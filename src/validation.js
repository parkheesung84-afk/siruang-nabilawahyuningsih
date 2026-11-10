'use strict';

const {
  parseIso,
  durationHours,
  witaClock,
  witaDayIndex,
  nowIso
} = require('./time');

const MAX_ACTIVE_PER_USER = 3;
const MAX_HOURS = 4;
const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000;

function toMinutes(clock) {
  const m = String(clock || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseHours(raw) {
  try {
    const hours = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(hours) ? hours : [];
  } catch {
    return [];
  }
}

function validateOperatingHours(room, start, end) {
  const hours = parseHours(room.operating_hours);
  const day = witaDayIndex(start.toISOString());
  const window = hours[day];
  if (!window) {
    return 'Ruangan tidak beroperasi pada hari tersebut.';
  }
  const open = toMinutes(window[0]);
  const close = toMinutes(window[1]);
  const startMin = witaClock(start.toISOString());
  const endMin = witaClock(end.toISOString());
  if (
    startMin === null ||
    endMin === null ||
    open === null ||
    close === null ||
    startMin < open ||
    endMin > close
  ) {
    return `Di luar jam operasional (${window[0]}–${window[1]} WITA).`;
  }
  if (witaDayIndex(start.toISOString()) !== witaDayIndex(end.toISOString())) {
    return 'Reservasi harus selesai pada hari yang sama.';
  }
  return null;
}

function validateBooking({ db, user, room, input, now = new Date() }) {
  const errors = {};
  const start = parseIso(input.startAt);
  const end = parseIso(input.endAt);

  if (!start) errors.startAt = 'Waktu mulai tidak valid.';
  if (!end) errors.endAt = 'Waktu selesai tidak valid.';

  if (start && end) {
    if (end <= start) {
      errors.endAt = 'Waktu selesai harus setelah waktu mulai.';
    } else {
      const hours = durationHours(start.toISOString(), end.toISOString());
      const maxHours = Number(room.max_hours) || MAX_HOURS;
      if (hours > maxHours) {
        errors.endAt = `Durasi maksimum ${maxHours} jam per reservasi.`;
      }
      if (start.getTime() < now.getTime() - 60 * 1000) {
        errors.startAt = 'Waktu mulai sudah lewat.';
      }
      const hoursError = validateOperatingHours(room, start, end);
      if (hoursError) errors.startAt = hoursError;
    }
  }

  const participants = Number(input.participants);
  if (!Number.isInteger(participants) || participants < 1) {
    errors.participants = 'Jumlah peserta harus bilangan bulat minimal 1.';
  } else if (participants > room.capacity) {
    errors.participants = `Jumlah peserta melebihi kapasitas ruangan (${room.capacity}).`;
  }

  const activityName = String(input.activityName || '').trim();
  if (activityName.length < 3) {
    errors.activityName = 'Nama kegiatan minimal 3 karakter.';
  } else if (activityName.length > 120) {
    errors.activityName = 'Nama kegiatan maksimal 120 karakter.';
  }

  const notes = String(input.notes || '').trim();
  if (notes.length > 500) {
    errors.notes = 'Catatan maksimal 500 karakter.';
  }

  const organizationName = String(input.organizationName || '').trim();
  if (organizationName.length > 120) {
    errors.organizationName = 'Nama organisasi maksimal 120 karakter.';
  }
  const additionalBorrowing = String(input.additionalBorrowing || '').trim();
  if (additionalBorrowing.length > 300) {
    errors.additionalBorrowing = 'Peminjaman tambahan maksimal 300 karakter.';
  }

  let purpose = input.purpose === 'organisasi' ? 'organisasi' : 'pribadi';
  let organizationId = null;
  if (user.is_officer && user.org_id && organizationName) {
    purpose = 'organisasi';
    organizationId = Number(user.org_id);
  } else if (purpose === 'organisasi') {
    organizationId = Number(input.organizationId);
    if (!user.is_officer || !user.org_id) {
      errors.purpose = 'Hanya pengurus organisasi terdaftar yang dapat memesan atas nama organisasi.';
    } else if (!organizationId || Number(user.org_id) !== organizationId) {
      errors.purpose = 'Organisasi tidak sesuai dengan keanggotaan Anda.';
    }
  }

  if (db && user && start && end) {
    const active = db
      .prepare(
        `SELECT COUNT(*) AS n FROM reservations
         WHERE user_id = ? AND status IN ('Diajukan','Disetujui')
           AND end_at > ?`
      )
      .get(user.id, now.toISOString());
    if (active && active.n >= MAX_ACTIVE_PER_USER) {
      errors.form = `Maksimal ${MAX_ACTIVE_PER_USER} reservasi aktif per pengguna.`;
    }
  }

  const isPublic = Boolean(input.isPublic);
  const publicDescription = String(input.publicDescription || '').trim();
  if (isPublic && publicDescription.length > 600) {
    errors.publicDescription = 'Deskripsi publik maksimal 600 karakter.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      startAt: start ? start.toISOString() : null,
      endAt: end ? end.toISOString() : null,
      purpose,
      organizationId,
      organizationName,
      additionalBorrowing,
      activityName,
      participants,
      notes,
      isPublic: isPublic ? 1 : 0,
      publicDescription
    }
  };
}

function validateCancel({ user, reservation, room, reason, now = new Date() }) {
  const errors = {};
  if (!reservation) {
    return { ok: false, errors: { form: 'Reservasi tidak ditemukan.' }, code: 404 };
  }
  if (!['Diajukan', 'Disetujui'].includes(reservation.status)) {
    errors.form = 'Reservasi ini tidak dapat dibatalkan.';
  }

  const isOwner = Number(reservation.user_id) === Number(user.id);
  const isManager = Number(room && room.manager_id) === Number(user.id);
  if (!isOwner && !isManager) {
    return { ok: false, errors: { form: 'Anda tidak berwenang membatalkan reservasi ini.' }, code: 403 };
  }
  if (isManager && !isOwner) {
    const text = String(reason || '').trim();
    if (text.length < 3) {
      errors.reason = 'Alasan pembatalan oleh pengelola wajib diisi.';
    }
  } else {
    const start = parseIso(reservation.start_at);
    if (start && start.getTime() - now.getTime() < CANCEL_WINDOW_MS) {
      errors.form = 'Pembatalan hanya bisa sampai 2 jam sebelum mulai.';
    }
    if (!isOwner && !isManager) {
      errors.form = 'Anda tidak berwenang membatalkan reservasi ini.';
    }
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { isManager, reason: String(reason || '').trim() }
  };
}

function validateDecision({ user, reservation, room, action, reason }) {
  const errors = {};
  if (!reservation) {
    return { ok: false, errors: { form: 'Reservasi tidak ditemukan.' }, code: 404 };
  }
  if (!room || Number(room.manager_id) !== Number(user.id)) {
    return { ok: false, errors: { form: 'Anda tidak mengelola ruangan ini.' }, code: 403 };
  }
  if (reservation.status !== 'Diajukan') {
    errors.form = 'Hanya reservasi berstatus Diajukan yang dapat diputuskan.';
  }
  if (!['approve', 'reject'].includes(action)) {
    errors.form = 'Aksi tidak dikenal.';
  }
  if (action === 'reject' && String(reason || '').trim().length < 3) {
    errors.reason = 'Alasan penolakan wajib diisi.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function validateBlockInput({ user, room, startAt, endAt, reason, now = new Date() }) {
  const errors = {};
  if (!room || Number(room.manager_id) !== Number(user.id)) {
    return { ok: false, errors: { form: 'Anda tidak mengelola ruangan ini.' }, code: 403 };
  }
  const start = parseIso(startAt);
  const end = parseIso(endAt);
  if (!start) errors.startAt = 'Waktu mulai tidak valid.';
  if (!end) errors.endAt = 'Waktu selesai tidak valid.';
  if (start && end) {
    if (end <= start) errors.endAt = 'Waktu selesai harus setelah waktu mulai.';
    if (start.getTime() < now.getTime()) errors.startAt = 'Waktu mulai sudah lewat.';
  }
  if (String(reason || '').trim().length < 3) {
    errors.reason = 'Alasan blokir wajib diisi.';
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      startAt: start ? start.toISOString() : null,
      endAt: end ? end.toISOString() : null,
      reason: String(reason || '').trim()
    }
  };
}

const ACTIVE_STATUSES = ['Diajukan', 'Disetujui'];

module.exports = {
  MAX_ACTIVE_PER_USER,
  MAX_HOURS,
  CANCEL_WINDOW_MS,
  ACTIVE_STATUSES,
  toMinutes,
  parseHours,
  validateOperatingHours,
  validateBooking,
  validateCancel,
  validateDecision,
  validateBlockInput
};
