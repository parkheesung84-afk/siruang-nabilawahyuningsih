'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { nowIso } = require('./time');

const OUTBOX = process.env.SIRUANG_OUTBOX || path.join(__dirname, '..', 'data', 'outbox.log');

function audit(db, { actor, action, objectType, objectId, reason = null, meta = {} }) {
  const actorId = actor && typeof actor === 'object' ? actor.id : null;
  const actorLabel =
    actor && typeof actor === 'object' ? `${actor.name} (${actor.role})` : String(actor || 'sistem');
  db.prepare(
    `INSERT INTO audit_logs (actor_id, actor_label, action, object_type, object_id, reason, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actorId,
    actorLabel,
    action,
    objectType,
    String(objectId),
    reason,
    JSON.stringify(meta),
    nowIso()
  );
}

function writeOutbox(entry) {
  try {
    fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
    fs.appendFileSync(OUTBOX, `${JSON.stringify(entry)}\n`);
  } catch {
    /* logging the mock email must never break a booking */
  }
}

function notify(db, { userId, reservationId = null, subject, body }) {
  const fail = process.env.MOCK_EMAIL_FAIL === '1';
  const entry = {
    at: nowIso(),
    toUserId: userId,
    reservationId,
    subject,
    body,
    status: fail ? 'gagal' : 'terkirim',
    error: fail ? 'SMTP mock: koneksi ditolak' : null
  };
  writeOutbox(entry);
  db.prepare(
    `INSERT INTO notifications (user_id, reservation_id, channel, subject, body, status, error, created_at)
     VALUES (?, ?, 'email', ?, ?, ?, ?, ?)`
  ).run(
    userId,
    reservationId,
    subject,
    body,
    entry.status,
    entry.error,
    entry.at
  );
  return entry;
}

function notifyReservation(db, reservation, kind, extra = {}) {
  const templates = {
    diajukan: {
      subject: `Reservasi ${reservation.public_id} diajukan`,
      body: `Reservasi Anda untuk "${reservation.activity_name}" telah diajukan dan menunggu keputusan pengelola.`
    },
    disetujui: {
      subject: `Reservasi ${reservation.public_id} disetujui`,
      body: `Reservasi "${reservation.activity_name}" disetujui. Ruang siap dipakai pada waktu yang dipilih.`
    },
    ditolak: {
      subject: `Reservasi ${reservation.public_id} ditolak`,
      body: `Reservasi "${reservation.activity_name}" ditolak. Alasan: ${extra.reason || '-'}`
    },
    dibatalkan: {
      subject: `Reservasi ${reservation.public_id} dibatalkan`,
      body: `Reservasi "${reservation.activity_name}" dibatalkan. ${extra.reason ? `Alasan: ${extra.reason}` : ''}`
    },
    kedaluwarsa: {
      subject: `Reservasi ${reservation.public_id} kedaluwarsa`,
      body: `Reservasi "${reservation.activity_name}" melewati batas keputusan dan otomatis kedaluwarsa. Slot sudah tersedia kembali.`
    },
    selesai: {
      subject: `Reservasi ${reservation.public_id} selesai`,
      body: `Waktu pemakaian "${reservation.activity_name}" telah berakhir. Terima kasih.`
    }
  };
  const template = templates[kind];
  if (!template) return null;
  return notify(db, {
    userId: reservation.user_id,
    reservationId: reservation.id,
    subject: template.subject,
    body: template.body
  });
}

module.exports = { audit, notify, notifyReservation, writeOutbox };
