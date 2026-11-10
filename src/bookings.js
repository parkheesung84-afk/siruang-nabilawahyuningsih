'use strict';

const crypto = require('node:crypto');
const {
  nowIso,
  parseIso,
  addDays,
  addWorkingDays,
  dayRangeUtc,
  monthRangeUtc,
  todayWitaKey,
  durationHours,
  formatRange,
  witaDateKey
} = require('./time');
const { transaction, isConflictError } = require('./db');
const {
  validateBooking,
  validateCancel,
  validateDecision,
  validateBlockInput,
  validateOperatingHours
} = require('./validation');
const { audit, notifyReservation } = require('./audit');

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function decorateRoom(row) {
  if (!row) return null;
  return {
    ...row,
    facilities: parseJson(row.facilities, []),
    rules: parseJson(row.rules, []),
    operating_hours: parseJson(row.operating_hours, [])
  };
}

function listRooms(db, { includeInactive = false } = {}) {
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS manager_name, u.email AS manager_email
       FROM rooms r JOIN users u ON u.id = r.manager_id
       ${includeInactive ? '' : 'WHERE r.active = 1'}
       ORDER BY r.id`
    )
    .all();
  return rows.map(decorateRoom);
}

function getRoom(db, idOrSlug) {
  const row = db
    .prepare(
      `SELECT r.*, u.name AS manager_name, u.email AS manager_email
       FROM rooms r JOIN users u ON u.id = r.manager_id
       WHERE r.slug = ? OR r.id = ?`
    )
    .get(String(idOrSlug), Number(idOrSlug) || -1);
  return decorateRoom(row);
}

function getReservation(db, idOrPublic) {
  return db
    .prepare(
      `SELECT r.*, rm.name AS room_name, rm.slug AS room_slug, rm.building, rm.floor,
              rm.capacity, rm.manager_id, u.name AS requester_name, u.email AS requester_email,
              o.name AS registered_organization_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       WHERE r.public_id = ? OR r.id = ?`
    )
    .get(String(idOrPublic), Number(idOrPublic) || -1);
}

function findConflicts(db, roomId, startAt, endAt) {
  const reservations = db
    .prepare(
      `SELECT r.id, r.public_id, r.start_at, r.end_at, r.activity_name, r.status,
              r.user_id, u.name AS requester_name, r.organization_id, o.name AS organization_name
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       WHERE r.room_id = ? AND r.status IN ('Diajukan','Disetujui')
         AND r.start_at < ? AND r.end_at > ?
       ORDER BY r.start_at`
    )
    .all(roomId, endAt, startAt);
  const blocks = db
    .prepare(
      `SELECT b.id, b.start_at, b.end_at, b.reason
       FROM blocks b
       WHERE b.room_id = ? AND b.start_at < ? AND b.end_at > ?
       ORDER BY b.start_at`
    )
    .all(roomId, endAt, startAt);
  return { reservations, blocks };
}

function filterRooms(db, rooms, { capacity, building, facilities = [] }) {
  return rooms.filter((room) => {
    if (capacity && room.capacity < Number(capacity)) return false;
    if (building && room.building !== building) return false;
    if (
      facilities.length &&
      !facilities.every((f) => room.facilities.includes(f))
    ) {
      return false;
    }
    return true;
  });
}

function availability(db, { startAt, endAt, capacity, building, facilities = [] }) {
  const rooms = filterRooms(db, listRooms(db), { capacity, building, facilities });
  const free = [];
  const busy = [];
  for (const room of rooms) {
    const conflicts = findConflicts(db, room.id, startAt, endAt);
    if (conflicts.reservations.length === 0 && conflicts.blocks.length === 0) {
      free.push(room);
    } else {
      busy.push({ room, conflicts });
    }
  }
  return { free, busy };
}

function nextFreeSlots(db, { startAt, endAt, roomId = null, capacity, building, facilities = [], days = 6 }) {
  const start = parseIso(startAt);
  const end = parseIso(endAt);
  if (!start || !end) return [];
  const duration = end.getTime() - start.getTime();
  const now = new Date();
  const suggestions = [];
  const seen = new Set();
  const rooms = roomId
    ? [getRoom(db, roomId)].filter(Boolean)
    : filterRooms(db, listRooms(db), { capacity, building, facilities });

  for (let d = 0; d <= days && suggestions.length < 6; d += 1) {
    const base = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
    const offsets = d === 0 ? [2, 4, 6] : [0, 2, 4, -2];
    for (const offset of offsets) {
      const candidateStart = new Date(base.getTime() + offset * 60 * 60 * 1000);
      const candidateEnd = new Date(candidateStart.getTime() + duration);
      if (candidateStart.getTime() < now.getTime() + 15 * 60 * 1000) continue;
      const candidateRange = dayRangeUtc(witaDateKey(candidateStart.toISOString()));
      if (!candidateRange) continue;
      if (candidateStart < candidateRange.start || candidateEnd > candidateRange.end) continue;
      const key = `${roomId || 'any'}-${candidateStart.toISOString()}`;
      if (seen.has(key)) continue;
      for (const room of rooms) {
        if (validateOperatingHours(room, candidateStart, candidateEnd)) continue;
        const conflicts = findConflicts(
          db,
          room.id,
          candidateStart.toISOString(),
          candidateEnd.toISOString()
        );
        if (conflicts.reservations.length === 0 && conflicts.blocks.length === 0) {
          seen.add(key);
          suggestions.push({
            room,
            startAt: candidateStart.toISOString(),
            endAt: candidateEnd.toISOString()
          });
          break;
        }
      }
      if (suggestions.length >= 6) break;
    }
  }
  return suggestions;
}

function makePublicId() {
  return `RSV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function hashRequest(input) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        roomId: input.roomId,
        startAt: input.startAt,
        endAt: input.endAt,
        purpose: input.purpose,
        activityName: input.activityName,
        participants: input.participants,
        organizationId: input.organizationId || null,
        organizationName: input.organizationName || '',
        additionalBorrowing: input.additionalBorrowing || '',
        notes: input.notes || ''
      })
    )
    .digest('hex');
}

function createReservation(db, { user, input, idempotencyKey, now = new Date() }) {
  const key = String(idempotencyKey || '').trim();
  if (!key) {
    return {
      status: 400,
      body: { error: 'IDEMPOTENCY_REQUIRED', message: 'Header Idempotency-Key wajib dikirim.' }
    };
  }
  const room = getRoom(db, input.roomId);
  if (!room) {
    return { status: 404, body: { error: 'ROOM_NOT_FOUND', message: 'Ruangan tidak ditemukan.' } };
  }

  const existing = db
    .prepare('SELECT * FROM reservations WHERE user_id = ? AND idempotency_key = ?')
    .get(user.id, key);
  if (existing) {
    const hash = hashRequest(input);
    if (existing.request_hash && existing.request_hash !== hash) {
      return {
        status: 409,
        body: {
          error: 'IDEMPOTENCY_MISMATCH',
          message: 'Idempotency-Key sudah dipakai untuk permintaan berbeda.'
        }
      };
    }
    return {
      status: 200,
      body: {
        reservation: getReservation(db, existing.public_id),
        reused: true,
        message: 'Permintaan ini sudah diproses sebelumnya.'
      }
    };
  }

  const validation = validateBooking({ db, user, room, input, now });
  if (!validation.ok) {
    return {
      status: 422,
      body: {
        error: 'VALIDATION_ERROR',
        message: 'Periksa kembali data reservasi.',
        fields: validation.errors
      }
    };
  }

  const value = validation.value;
  try {
    const result = transaction(db, () => {
      const duplicate = db
        .prepare('SELECT * FROM reservations WHERE user_id = ? AND idempotency_key = ?')
        .get(user.id, key);
      if (duplicate) return { existing: duplicate };

      const conflicts = findConflicts(db, room.id, value.startAt, value.endAt);
      if (conflicts.reservations.length || conflicts.blocks.length) {
        return { conflicts };
      }

      const status = room.mode === 'bebas' ? 'Disetujui' : 'Diajukan';
      const publicId = makePublicId();
      const createdAt = now.toISOString();
      const inserted = db
        .prepare(
          `INSERT INTO reservations
            (public_id, user_id, room_id, organization_id, start_at, end_at, purpose,
             activity_name, organization_name, additional_borrowing, participants, notes,
             status, is_public, public_description, idempotency_key, request_hash,
             created_at, updated_at, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          publicId,
          user.id,
          room.id,
          value.organizationId,
          value.startAt,
          value.endAt,
          value.purpose,
          value.activityName,
          value.organizationName,
          value.additionalBorrowing,
          value.participants,
          value.notes,
          status,
          value.isPublic,
          value.publicDescription,
          key,
          hashRequest(input),
          createdAt,
          createdAt,
          status === 'Disetujui' ? room.manager_id : null,
          status === 'Disetujui' ? createdAt : null
        );

      const reservationId = Number(inserted.lastInsertRowid);
      if (value.isPublic) {
        db.prepare(
          `INSERT INTO events (reservation_id, title, description, moderation_status, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          reservationId,
          value.activityName,
          value.publicDescription,
          status === 'Disetujui' ? 'menunggu' : 'menunggu',
          createdAt
        );
      }
      audit(db, {
        actor: user,
        action: 'reservation.create',
        objectType: 'reservation',
        objectId: publicId,
        meta: {
          room: room.name,
          status,
          startAt: value.startAt,
          endAt: value.endAt
        }
      });
      return { reservationId, publicId, status };
    });

    if (result.existing) {
      return {
        status: 200,
        body: {
          reservation: getReservation(db, result.existing.public_id),
          reused: true,
          message: 'Permintaan ini sudah diproses sebelumnya.'
        }
      };
    }
    if (result.conflicts) {
      const suggestions = nextFreeSlots(db, {
        startAt: value.startAt,
        endAt: value.endAt,
        roomId: room.id
      });
      return {
        status: 409,
        body: {
          error: 'SLOT_CONFLICT',
          message: 'Slot baru saja dipesan pengguna lain. Pilih waktu atau ruangan lain.',
          conflicts: result.conflicts,
          suggestions
        }
      };
    }

    const reservation = getReservation(db, result.publicId);
    notifyReservation(db, reservation, result.status === 'Disetujui' ? 'disetujui' : 'diajukan');
    return {
      status: 201,
      body: {
        reservation,
        message:
          result.status === 'Disetujui'
            ? `Reservasi ${result.publicId} disetujui otomatis. Ruang siap dipakai.`
            : `Reservasi diajukan. ID ${result.publicId}. Menunggu persetujuan.`
      }
    };
  } catch (error) {
    if (isConflictError(error)) {
      return {
        status: 409,
        body: {
          error: 'SLOT_CONFLICT',
          message: 'Slot baru saja dipesan pengguna lain. Pilih waktu atau ruangan lain.'
        }
      };
    }
    throw error;
  }
}

function cancelReservation(db, { user, idOrPublic, reason, now = new Date() }) {
  const reservation = getReservation(db, idOrPublic);
  const room = reservation ? getRoom(db, reservation.room_id) : null;
  const validation = validateCancel({ user, reservation, room, reason, now });
  if (!validation.ok) {
    return {
      status: validation.code || 422,
      body: { error: 'CANCEL_REJECTED', message: Object.values(validation.errors)[0], fields: validation.errors }
    };
  }
  const outcome = validation.value;
  try {
    transaction(db, () => {
      db.prepare(
        `UPDATE reservations
         SET status = 'Dibatalkan', decision_reason = ?, decided_by = ?, decided_at = ?, updated_at = ?
         WHERE id = ? AND status IN ('Diajukan','Disetujui')`
      ).run(
        outcome.isManager ? outcome.reason : 'Dibatalkan oleh pemohon',
        user.id,
        now.toISOString(),
        now.toISOString(),
        reservation.id
      );
      audit(db, {
        actor: user,
        action: 'reservation.cancel',
        objectType: 'reservation',
        objectId: reservation.public_id,
        reason: outcome.reason || 'Dibatalkan oleh pemohon',
        meta: { previousStatus: reservation.status }
      });
    });
  } catch (error) {
    if (isConflictError(error)) {
      return {
        status: 409,
        body: { error: 'SLOT_CONFLICT', message: 'Reservasi berubah saat diproses. Muat ulang.' }
      };
    }
    throw error;
  }
  const updated = getReservation(db, reservation.public_id);
  notifyReservation(db, updated, 'dibatalkan', { reason: outcome.reason });
  return {
    status: 200,
    body: {
      reservation: updated,
      message: 'Reservasi dibatalkan. Slot sudah tersedia kembali.'
    }
  };
}

function decideReservation(db, { user, idOrPublic, action, reason, now = new Date() }) {
  const reservation = getReservation(db, idOrPublic);
  const room = reservation ? getRoom(db, reservation.room_id) : null;
  const validation = validateDecision({ user, reservation, room, action, reason });
  if (!validation.ok) {
    return {
      status: validation.code || 422,
      body: { error: 'DECISION_REJECTED', message: Object.values(validation.errors)[0], fields: validation.errors }
    };
  }
  const nextStatus = action === 'approve' ? 'Disetujui' : 'Ditolak';
  try {
    transaction(db, () => {
      if (action === 'approve') {
        const conflicts = findConflicts(
          db,
          reservation.room_id,
          reservation.start_at,
          reservation.end_at
        );
        const others = conflicts.reservations.filter((r) => r.id !== reservation.id);
        if (others.length || conflicts.blocks.length) {
          throw Object.assign(new Error('SLOT_CONFLICT'), { code: 'SLOT_CONFLICT' });
        }
      }
      db.prepare(
        `UPDATE reservations
         SET status = ?, decision_reason = ?, decided_by = ?, decided_at = ?, updated_at = ?
         WHERE id = ? AND status = 'Diajukan'`
      ).run(
        nextStatus,
        String(reason || '').trim() || null,
        user.id,
        now.toISOString(),
        now.toISOString(),
        reservation.id
      );
      if (action === 'approve') {
        const event = db.prepare('SELECT * FROM events WHERE reservation_id = ?').get(reservation.id);
        if (event && reservation.is_public) {
          db.prepare("UPDATE events SET moderation_status = 'menunggu' WHERE id = ?").run(event.id);
        }
      }
      audit(db, {
        actor: user,
        action: action === 'approve' ? 'reservation.approve' : 'reservation.reject',
        objectType: 'reservation',
        objectId: reservation.public_id,
        reason: String(reason || '').trim() || null,
        meta: { previousStatus: 'Diajukan' }
      });
    });
  } catch (error) {
    if (error.code === 'SLOT_CONFLICT' || isConflictError(error)) {
      return {
        status: 409,
        body: {
          error: 'SLOT_CONFLICT',
          message: 'Slot sudah terisi blokir atau reservasi lain. Keputusan tidak disimpan.'
        }
      };
    }
    throw error;
  }
  const updated = getReservation(db, reservation.public_id);
  notifyReservation(db, updated, action === 'approve' ? 'disetujui' : 'ditolak', { reason });
  return {
    status: 200,
    body: {
      reservation: updated,
      message:
        action === 'approve'
          ? 'Reservasi disetujui. Ruang siap dipakai pada waktu yang dipilih.'
          : 'Reservasi ditolak dan alasan sudah dicatat.'
    }
  };
}

function createBlock(db, { user, roomId, startAt, endAt, reason, confirmOverlap = false, now = new Date() }) {
  const room = getRoom(db, roomId);
  if (!room) {
    return { status: 404, body: { error: 'ROOM_NOT_FOUND', message: 'Ruangan tidak ditemukan.' } };
  }
  const validation = validateBlockInput({ user, room, startAt, endAt, reason, now });
  if (!validation.ok) {
    return {
      status: validation.code || 422,
      body: { error: 'BLOCK_REJECTED', message: Object.values(validation.errors)[0], fields: validation.errors }
    };
  }
  const value = validation.value;
  const conflicts = findConflicts(db, room.id, value.startAt, value.endAt);
  if (conflicts.reservations.length && !confirmOverlap) {
    return {
      status: 409,
      body: {
        error: 'OVERLAP_CONFIRMATION_REQUIRED',
        message:
          'Blokir beririsan dengan reservasi aktif. Konfirmasi akan membatalkan reservasi tersebut dan memberi tahu pemohon.',
        conflicts
      }
    };
  }

  try {
    transaction(db, () => {
      for (const reservation of conflicts.reservations) {
        db.prepare(
          `UPDATE reservations
           SET status = 'Dibatalkan', decision_reason = ?, decided_by = ?, decided_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('Diajukan','Disetujui')`
        ).run(
          `Diblokir pengelola: ${value.reason}`,
          user.id,
          now.toISOString(),
          now.toISOString(),
          reservation.id
        );
        audit(db, {
          actor: user,
          action: 'reservation.cancel_for_block',
          objectType: 'reservation',
          objectId: reservation.public_id,
          reason: value.reason
        });
      }
      const inserted = db
        .prepare(
          `INSERT INTO blocks (room_id, start_at, end_at, reason, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(room.id, value.startAt, value.endAt, value.reason, user.id, now.toISOString());
      audit(db, {
        actor: user,
        action: 'block.create',
        objectType: 'block',
        objectId: String(inserted.lastInsertRowid),
        reason: value.reason,
        meta: { room: room.name, startAt: value.startAt, endAt: value.endAt }
      });
    });
  } catch (error) {
    if (isConflictError(error)) {
      return {
        status: 409,
        body: { error: 'SLOT_CONFLICT', message: 'Slot beririsan dengan jadwal lain. Muat ulang dan coba lagi.' }
      };
    }
    throw error;
  }

  for (const reservation of conflicts.reservations) {
    const updated = getReservation(db, reservation.public_id);
    notifyReservation(db, updated, 'dibatalkan', {
      reason: `Ruangan diblokir pengelola: ${value.reason}`
    });
  }
  return {
    status: 201,
    body: {
      message:
        conflicts.reservations.length > 0
          ? `Blokir dibuat. ${conflicts.reservations.length} reservasi dibatalkan dan pemohon diberi tahu.`
          : 'Blokir jadwal dibuat.'
    }
  };
}

function expireStale(db, now = new Date()) {
  const pending = db
    .prepare(
      `SELECT r.*, rm.name AS room_name, u.name AS requester_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       JOIN users u ON u.id = r.user_id
       WHERE r.status = 'Diajukan'`
    )
    .all();
  let expired = 0;
  for (const reservation of pending) {
    const created = parseIso(reservation.created_at);
    const start = parseIso(reservation.start_at);
    if (!created || !start) continue;
    const deadline = addWorkingDays(created, 2);
    const expiry = new Date(Math.min(deadline.getTime(), start.getTime()));
    if (now >= expiry) {
      transaction(db, () => {
        db.prepare(
          `UPDATE reservations
           SET status = 'Kedaluwarsa', decision_reason = ?, decided_at = ?, updated_at = ?
           WHERE id = ? AND status = 'Diajukan'`
        ).run(
          'Melewati batas keputusan 2 hari kerja atau waktu mulai.',
          now.toISOString(),
          now.toISOString(),
          reservation.id
        );
        audit(db, {
          actor: 'sistem',
          action: 'reservation.expire',
          objectType: 'reservation',
          objectId: reservation.public_id,
          reason: 'Batas keputusan terlampaui'
        });
      });
      notifyReservation(db, reservation, 'kedaluwarsa');
      expired += 1;
    }
  }
  return expired;
}

function completePast(db, now = new Date()) {
  const rows = db
    .prepare(
      `SELECT * FROM reservations
       WHERE status = 'Disetujui' AND end_at <= ?`
    )
    .all(now.toISOString());
  for (const reservation of rows) {
    transaction(db, () => {
      db.prepare(
        `UPDATE reservations SET status = 'Selesai', updated_at = ? WHERE id = ?`
      ).run(now.toISOString(), reservation.id);
      audit(db, {
        actor: 'sistem',
        action: 'reservation.complete',
        objectType: 'reservation',
        objectId: reservation.public_id
      });
    });
    notifyReservation(db, reservation, 'selesai');
  }
  return rows.length;
}

function myReservations(db, userId) {
  return db
    .prepare(
      `SELECT r.*, rm.name AS room_name, rm.slug AS room_slug, rm.building, rm.floor,
              o.name AS registered_organization_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       WHERE r.user_id = ?
       ORDER BY r.start_at DESC`
    )
    .all(userId);
}

function managerRooms(db, user) {
  if (user.role === 'admin') return listRooms(db);
  return listRooms(db).filter((room) => Number(room.manager_id) === Number(user.id));
}

function managerQueue(db, user) {
  const rooms = managerRooms(db, user);
  const ids = rooms.map((room) => room.id);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT r.*, rm.name AS room_name, rm.slug AS room_slug,
              u.name AS requester_name, u.email AS requester_email,
              o.name AS registered_organization_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       WHERE r.room_id IN (${placeholders}) AND r.status = 'Diajukan'
       ORDER BY r.start_at ASC`
    )
    .all(...ids);
}

function managerHistory(db, user, limit = 25) {
  const rooms = managerRooms(db, user);
  const ids = rooms.map((room) => room.id);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT r.*, rm.name AS room_name, u.name AS requester_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       JOIN users u ON u.id = r.user_id
       WHERE r.room_id IN (${placeholders}) AND r.status <> 'Diajukan'
       ORDER BY r.updated_at DESC LIMIT ?`
    )
    .all(...ids, limit);
}

function blocksForManager(db, user) {
  const rooms = managerRooms(db, user);
  const ids = rooms.map((room) => room.id);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT b.*, rm.name AS room_name, u.name AS created_by_name
       FROM blocks b JOIN rooms rm ON rm.id = b.room_id JOIN users u ON u.id = b.created_by
       WHERE b.room_id IN (${placeholders})
       ORDER BY b.start_at ASC`
    )
    .all(...ids);
}

function weekEvents(db, startKey, endKey) {
  const start = dayRangeUtc(startKey);
  const end = dayRangeUtc(endKey);
  if (!start || !end) return [];
  const rows = db
    .prepare(
      `SELECT e.*, r.start_at, r.end_at, r.is_public, rm.name AS room_name, rm.slug AS room_slug,
              COALESCE(NULLIF(r.organization_name, ''), o.name, 'Kegiatan kampus') AS organizer_name
       FROM events e
       JOIN reservations r ON r.id = e.reservation_id
       JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       WHERE e.moderation_status = 'terbit'
         AND r.status IN ('Disetujui','Selesai')
         AND r.start_at < ? AND r.end_at > ?
       ORDER BY r.start_at`
    )
    .all(end.start.toISOString(), start.start.toISOString());
  return rows;
}

function monthEvents(db, month) {
  const range = monthRangeUtc(month);
  if (!range) return [];
  const start = range.start;
  const end = range.end;
  return db
    .prepare(
      `SELECT e.*, r.start_at, r.end_at, rm.name AS room_name, rm.slug AS room_slug,
              COALESCE(NULLIF(r.organization_name, ''), o.name, 'Kegiatan kampus') AS organizer_name
       FROM events e
       JOIN reservations r ON r.id = e.reservation_id
       JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       WHERE e.moderation_status = 'terbit'
         AND r.status IN ('Disetujui','Selesai')
         AND r.start_at < ? AND r.end_at > ?
       ORDER BY r.start_at`
    )
    .all(end.toISOString(), start.toISOString());
}

function dayRoomStatus(db, dateKey) {
  const range = dayRangeUtc(dateKey);
  if (!range) return [];
  const rooms = listRooms(db);
  return rooms.map((room) => {
    const reservations = db
      .prepare(
        `SELECT start_at, end_at, status FROM reservations
         WHERE room_id = ? AND status IN ('Diajukan','Disetujui')
           AND start_at < ? AND end_at > ?
         ORDER BY start_at`
      )
      .all(room.id, range.end.toISOString(), range.start.toISOString());
    const blocks = db
      .prepare(
        `SELECT start_at, end_at, reason FROM blocks
         WHERE room_id = ? AND start_at < ? AND end_at > ?`
      )
      .all(room.id, range.end.toISOString(), range.start.toISOString());
    return { room, reservations, blocks };
  });
}

function usageReport(db, { from, to, roomId = null }) {
  const params = [to, from];
  let filter = '';
  if (roomId) {
    filter = 'AND r.room_id = ?';
    params.push(roomId);
  }
  const rows = db
    .prepare(
      `SELECT rm.id, rm.name, rm.building,
              SUM(CASE WHEN r.status IN ('Disetujui','Selesai') THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN r.status = 'Dibatalkan' THEN 1 ELSE 0 END) AS cancelled,
              SUM(CASE WHEN r.status = 'Ditolak' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN r.status IN ('Disetujui','Selesai')
                       THEN (julianday(r.end_at) - julianday(r.start_at)) * 24 ELSE 0 END) AS hours
       FROM rooms rm
       LEFT JOIN reservations r ON r.room_id = rm.id
         AND r.start_at >= ? AND r.start_at < ? ${filter}
       GROUP BY rm.id
       ORDER BY rm.name`
    )
    .all(...params);
  return rows;
}

function publicCalendarEntries(db, month) {
  return monthEvents(db, month).map((event) => ({
    ...event,
    organizer_name: event.organizer_name,
    requester_name: undefined
  }));
}

function busyForPublic(db, startIso, endIso) {
  return db
    .prepare(
      `SELECT rm.id AS room_id, rm.name AS room_name, r.start_at, r.end_at, r.status
       FROM reservations r JOIN rooms rm ON rm.id = r.room_id
       WHERE r.status IN ('Diajukan','Disetujui')
         AND r.start_at < ? AND r.end_at > ?
       ORDER BY r.start_at`
    )
    .all(endIso, startIso);
}

function suggestionsForRange(db, { startAt, endAt, capacity, building, facilities = [] }) {
  return nextFreeSlots(db, { startAt, endAt, capacity, building, facilities });
}

module.exports = {
  listRooms,
  getRoom,
  getReservation,
  findConflicts,
  availability,
  nextFreeSlots,
  suggestionsForRange,
  createReservation,
  cancelReservation,
  decideReservation,
  createBlock,
  expireStale,
  completePast,
  myReservations,
  managerRooms,
  managerQueue,
  managerHistory,
  blocksForManager,
  weekEvents,
  monthEvents,
  dayRoomStatus,
  usageReport,
  publicCalendarEntries,
  busyForPublic,
  decorateRoom,
  durationHours,
  formatRange,
  todayWitaKey
};
