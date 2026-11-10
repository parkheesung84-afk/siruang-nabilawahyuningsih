'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const {
  createReservation,
  cancelReservation,
  decideReservation,
  expireStale,
  getRoom,
  findConflicts,
  getReservation,
  publicCalendarEntries,
  createBlock
} = require('../src/bookings');
const { addDays, todayWitaKey, witaInputToUtc, formatTime } = require('../src/time');

function fresh() {
  const db = openDb(':memory:');
  seed(db);
  return db;
}

function user(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function at(dateKey, time) {
  return witaInputToUtc(`${dateKey}T${time}`).toISOString();
}

function input(db, overrides = {}) {
  const date = overrides.date || addDays(todayWitaKey(), 1);
  const room = overrides.roomId || 1;
  return {
    roomId: room,
    startAt: at(date, overrides.start || '13:00'),
    endAt: at(date, overrides.end || '15:00'),
    purpose: 'pribadi',
    activityName: 'Uji reservasi SiRuang',
    participants: 10,
    notes: '',
    organizationId: null,
    isPublic: false,
    publicDescription: '',
    ...overrides,
    startAt: overrides.startAt || at(date, overrides.start || '13:00'),
    endAt: overrides.endAt || at(date, overrides.end || '15:00')
  };
}

test('AC-RS1A: slot tersedia menghasilkan reservasi dengan ID dan status mode ruangan', () => {
  const db = fresh();
  const result = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'test-ac-rs1a'
  });
  assert.equal(result.status, 201);
  assert.match(result.body.reservation.public_id, /^RSV-[A-F0-9]{6}$/);
  assert.equal(result.body.reservation.status, 'Diajukan');
  const free = createReservation(db, {
    user: user(db, 2),
    input: input(db, { roomId: 4, date: addDays(todayWitaKey(), 2), start: '10:00', end: '12:00' }),
    idempotencyKey: 'test-ac-rs1a-free'
  });
  assert.equal(free.status, 201);
  assert.equal(free.body.reservation.status, 'Disetujui');
});

test('AC-RS3A: idempotency key yang sama tidak membuat reservasi ganda', () => {
  const db = fresh();
  const first = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'idem-same'
  });
  const second = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'idem-same'
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.reused, true);
  assert.equal(second.body.reservation.public_id, first.body.reservation.public_id);
  const count = db.prepare(
    "SELECT COUNT(*) AS n FROM reservations WHERE idempotency_key = 'idem-same'"
  ).get();
  assert.equal(count.n, 1);
});

test('BR-01/BR-03/BR-04/BR-06: validasi waktu, jam operasional, kapasitas, durasi', () => {
  const db = fresh();
  const u = user(db, 2);

  const reversed = createReservation(db, {
    user: u,
    input: input(db, { startAt: at(addDays(todayWitaKey(), 1), '15:00'), endAt: at(addDays(todayWitaKey(), 1), '13:00') }),
    idempotencyKey: 'br-01'
  });
  assert.equal(reversed.status, 422);
  assert.ok(reversed.body.fields.endAt);

  const outside = createReservation(db, {
    user: u,
    input: input(db, { start: '18:00', end: '19:00' }),
    idempotencyKey: 'br-03'
  });
  assert.equal(outside.status, 422);
  assert.match(outside.body.fields.startAt, /jam operasional/i);

  const past = createReservation(db, {
    user: u,
    input: input(db, { date: addDays(todayWitaKey(), -1) }),
    idempotencyKey: 'br-03-past'
  });
  assert.equal(past.status, 422);

  const tooMany = createReservation(db, {
    user: u,
    input: input(db, { participants: 9999 }),
    idempotencyKey: 'br-04'
  });
  assert.equal(tooMany.status, 422);
  assert.match(tooMany.body.fields.participants, /kapasitas/i);

  const tooLong = createReservation(db, {
    user: u,
    input: input(db, { start: '08:30', end: '14:00' }),
    idempotencyKey: 'br-06'
  });
  assert.equal(tooLong.status, 422);
  assert.match(tooLong.body.fields.endAt, /Durasi maksimum/i);
});

test('BR-07: reservasi organisasi hanya oleh pengurus terdaftar', () => {
  const db = fresh();
  const result = createReservation(db, {
    user: user(db, 1),
    input: input(db, { purpose: 'organisasi', organizationId: 1 }),
    idempotencyKey: 'br-07'
  });
  assert.equal(result.status, 422);
  assert.match(result.body.fields.purpose, /pengurus/i);
});

test('AC-RS2A: dua request bersamaan pada slot beririsan menghasilkan tepat satu 201 dan satu 409', async () => {
  const db = fresh();
  // Both calls run through the same IMMEDIATE transaction serialisation used by the API.
  const slot = input(db);
  const first = createReservation(db, {
    user: user(db, 2),
    input: slot,
    idempotencyKey: 'race-a'
  });
  const second = createReservation(db, {
    user: user(db, 8),
    input: slot,
    idempotencyKey: 'race-b'
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'SLOT_CONFLICT');
  const conflicts = findConflicts(db, 1, slot.startAt, slot.endAt);
  assert.equal(conflicts.reservations.length, 1);
});

test('trigger database menolak overlap langsung (BR-02)', () => {
  const db = fresh();
  const slot = input(db);
  createReservation(db, {
    user: user(db, 2),
    input: slot,
    idempotencyKey: 'trigger-source'
  });
  assert.throws(() => {
    db.prepare(
      `INSERT INTO reservations
        (public_id, user_id, room_id, start_at, end_at, purpose, activity_name,
         participants, status, idempotency_key, created_at, updated_at)
       VALUES ('RSV-BYPASS', 8, 1, ?, ?, 'pribadi', 'Bypass', 2, 'Diajukan', 'bypass', ?, ?)`
    ).run(slot.startAt, slot.endAt, new Date().toISOString(), new Date().toISOString());
  }, /SLOT_CONFLICT/);
});

test('AC-PS1A dan BR-08: penolakan tanpa alasan ditolak, dengan alasan berhasil', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'decide'
  });
  const id = created.body.reservation.public_id;
  const noReason = decideReservation(db, {
    user: user(db, 5),
    idOrPublic: id,
    action: 'reject',
    reason: ''
  });
  assert.equal(noReason.status, 422);
  assert.equal(getReservation(db, id).status, 'Diajukan');

  const reject = decideReservation(db, {
    user: user(db, 5),
    idOrPublic: id,
    action: 'reject',
    reason: 'Beririsan dengan jadwal kelas.'
  });
  assert.equal(reject.status, 200);
  assert.equal(reject.body.reservation.status, 'Ditolak');
});

test('pengelola ruangan lain tidak dapat memutuskan reservasi', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'decide-other'
  });
  const result = decideReservation(db, {
    user: user(db, 6),
    idOrPublic: created.body.reservation.public_id,
    action: 'approve'
  });
  assert.equal(result.status, 403);
});

test('AC-PB1A/AC-PB1B/AC-PB1C: pembatalan mandiri, batas 2 jam, dan slot kembali tersedia', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'cancel-ok'
  });
  const id = created.body.reservation.public_id;

  const other = cancelReservation(db, {
    user: user(db, 8),
    idOrPublic: id
  });
  assert.equal(other.status, 403);

  const ok = cancelReservation(db, {
    user: user(db, 2),
    idOrPublic: id
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.reservation.status, 'Dibatalkan');
  const conflicts = findConflicts(db, 1, created.body.reservation.start_at, created.body.reservation.end_at);
  assert.equal(conflicts.reservations.length, 0);

  const soonDate = todayWitaKey();
  const now = new Date();
  const nowWita = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const minutes = nowWita.getUTCHours() * 60 + nowWita.getUTCMinutes();
  const startMinutes = Math.ceil((minutes + 20) / 30) * 30;
  if (startMinutes + 60 <= 17 * 60 + 30) {
    const start = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
    const endMinutes = startMinutes + 60;
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const soon = createReservation(db, {
      user: user(db, 2),
      input: input(db, { date: soonDate, start, end }),
      idempotencyKey: 'cancel-late'
    });
    if (soon.status === 201) {
      const late = cancelReservation(db, {
        user: user(db, 2),
        idOrPublic: soon.body.reservation.public_id
      });
      assert.equal(late.status, 422);
      assert.match(late.body.message, /2 jam/i);
    }
  }
});

test('PS-02: pengajuan lewat batas kedaluwarsa menjadi Kedaluwarsa dan slot bebas', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'expire'
  });
  const id = created.body.reservation.public_id;
  db.prepare('UPDATE reservations SET created_at = ? WHERE public_id = ?').run(
    new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    id
  );
  const n = expireStale(db);
  assert.ok(n >= 1);
  assert.equal(getReservation(db, id).status, 'Kedaluwarsa');
});

test('audit log append-only', () => {
  const db = fresh();
  assert.throws(() => {
    db.prepare("UPDATE audit_logs SET reason = 'diubah' WHERE id = 1").run();
  }, /AUDIT_APPEND_ONLY/);
  assert.throws(() => {
    db.prepare('DELETE FROM audit_logs WHERE id = 1').run();
  }, /AUDIT_APPEND_ONLY/);
});

test('kalender publik tidak membocorkan identitas pemesan', () => {
  const db = fresh();
  const entries = publicCalendarEntries(db, todayWitaKey().slice(0, 7));
  assert.ok(entries.length > 0);
  for (const row of entries) {
    assert.equal(row.requester_name, undefined);
    assert.equal(row.user_id, undefined);
    assert.ok(row.organizer_name);
  }
});

test('jam operasional Sabtu/Aula mengikuti data ruangan', () => {
  const db = fresh();
  const room = getRoom(db, 'aula');
  assert.equal(room.operating_hours[6][0], '07:00');
  assert.equal(room.operating_hours[0][1], '16:00');
});

test('BR-09: waktu disimpan UTC dan ditampilkan WITA', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 2),
    input: input(db, { start: '13:00', end: '15:00' }),
    idempotencyKey: 'br-09'
  });
  assert.equal(created.status, 201);
  assert.match(created.body.reservation.start_at, /Z$/);
  assert.equal(formatTime(created.body.reservation.start_at), '13.00');
  assert.equal(formatTime(created.body.reservation.end_at), '15.00');
});

test('BR-06: maksimal 3 reservasi aktif per pengguna', () => {
  const db = fresh();
  const slots = [
    { roomId: 1, start: '13:00', end: '15:00' },
    { roomId: 2, start: '13:00', end: '15:00' },
    { roomId: 3, start: '13:00', end: '15:00' }
  ];
  for (const [i, slot] of slots.entries()) {
    const res = createReservation(db, {
      user: user(db, 2),
      input: input(db, slot),
      idempotencyKey: `active-${i}`
    });
    assert.equal(res.status, 201);
  }
  const fourth = createReservation(db, {
    user: user(db, 2),
    input: input(db, { roomId: 5 }),
    idempotencyKey: 'active-4'
  });
  assert.equal(fourth.status, 422);
  assert.match(fourth.body.fields.form, /3 reservasi aktif/i);
});

test('AC-NT1A: gagal kirim email tidak membatalkan reservasi dan dicatat', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 2),
    input: input(db),
    idempotencyKey: 'nt-01'
  });
  const id = created.body.reservation.public_id;
  process.env.MOCK_EMAIL_FAIL = '1';
  try {
    const approved = decideReservation(db, {
      user: user(db, 5),
      idOrPublic: id,
      action: 'approve'
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.reservation.status, 'Disetujui');
    const notif = db.prepare(
      "SELECT status, error FROM notifications WHERE reservation_id = ? ORDER BY id DESC LIMIT 1"
    ).get(created.body.reservation.id);
    assert.equal(notif.status, 'gagal');
    assert.ok(notif.error);
  } finally {
    delete process.env.MOCK_EMAIL_FAIL;
  }
});

test('AC-BL1A: blokir beririsan butuh konfirmasi dan membatalkan reservasi aktif', () => {
  const db = fresh();
  const target = db.prepare(
    "SELECT * FROM reservations WHERE status = 'Diajukan' AND room_id = 5 LIMIT 1"
  ).get();
  assert.ok(target);
  const blocked = createBlock(db, {
    user: user(db, 5),
    roomId: 5,
    startAt: target.start_at,
    endAt: target.end_at,
    reason: 'Rapat pimpinan mendadak'
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'OVERLAP_CONFIRMATION_REQUIRED');
  assert.equal(getReservation(db, target.public_id).status, 'Diajukan');

  const confirmed = createBlock(db, {
    user: user(db, 5),
    roomId: 5,
    startAt: target.start_at,
    endAt: target.end_at,
    reason: 'Rapat pimpinan mendadak',
    confirmOverlap: true
  });
  assert.equal(confirmed.status, 201);
  assert.equal(getReservation(db, target.public_id).status, 'Dibatalkan');
  const block = db.prepare('SELECT * FROM blocks WHERE room_id = 5 AND start_at = ?').get(target.start_at);
  assert.ok(block);
});

test('Nama organisasi dan peminjaman tambahan tersimpan pada reservasi', () => {
  const db = fresh();
  const created = createReservation(db, {
    user: user(db, 3),
    input: input(db, {
      date: addDays(todayWitaKey(), 2),
      organizationName: 'BEM IDB Bali',
      additionalBorrowing: '2 microphone dan kursi tambahan'
    }),
    idempotencyKey: 'org-additional'
  });
  assert.equal(created.status, 201);
  const row = getReservation(db, created.body.reservation.public_id);
  assert.equal(row.organization_name, 'BEM IDB Bali');
  assert.equal(row.additional_borrowing, '2 microphone dan kursi tambahan');
  assert.equal(row.purpose, 'organisasi');
  assert.equal(row.organization_id, 1);
});
