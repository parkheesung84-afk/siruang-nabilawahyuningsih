'use strict';

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Convert a WITA wall-clock value (datetime-local) into a UTC Date. */
function witaInputToUtc(value) {
  if (!value) return null;
  const m = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h, mi, s] = m;
  const ms =
    Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)) - WITA_OFFSET_MS;
  return new Date(ms);
}

/** UTC ISO -> value usable by <input type="datetime-local"> in WITA. */
function utcToWitaInput(iso) {
  const d = parseIso(iso);
  if (!d) return '';
  const w = new Date(d.getTime() + WITA_OFFSET_MS);
  return w.toISOString().slice(0, 16);
}

function witaDateKey(iso) {
  const d = parseIso(iso);
  if (!d) return '';
  return new Date(d.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 10);
}

function todayWitaKey() {
  return witaDateKey(nowIso());
}

function dayRangeUtc(dateKey) {
  const m = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const start = new Date(
    Date.UTC(+m[1], +m[2] - 1, +m[3]) - WITA_OFFSET_MS
  );
  return { start, end: new Date(start.getTime() + DAY) };
}

function addDays(dateKey, n) {
  const range = dayRangeUtc(dateKey);
  if (!range) return dateKey;
  return witaDateKey(new Date(range.start.getTime() + n * DAY).toISOString());
}

function addWorkingDays(date, n) {
  const d = new Date(date.getTime());
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wita = new Date(d.getTime() + WITA_OFFSET_MS).getUTCDay();
    if (wita !== 0 && wita !== 6) added += 1;
  }
  return d;
}

function startOfWeekWita(dateKey) {
  const range = dayRangeUtc(dateKey);
  if (!range) return dateKey;
  const wita = new Date(range.start.getTime() + WITA_OFFSET_MS);
  const dow = wita.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, delta);
}

function monthKey(dateKey) {
  return String(dateKey || todayWitaKey()).slice(0, 7);
}

function monthRangeUtc(month) {
  const m = String(month).match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return {
    start: new Date(Date.UTC(+m[1], +m[2] - 1, 1) - WITA_OFFSET_MS),
    end: new Date(Date.UTC(+m[1], +m[2], 1) - WITA_OFFSET_MS)
  };
}

function shiftMonth(month, delta) {
  const m = String(month).match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function formatDate(iso, opts = {}) {
  const d = parseIso(iso);
  if (!d) return '';
  const w = new Date(d.getTime() + WITA_OFFSET_MS);
  const day = DAY_NAMES[w.getUTCDay()];
  const date = w.getUTCDate();
  const month = MONTH_NAMES[w.getUTCMonth()];
  const year = w.getUTCFullYear();
  if (opts.short) return `${day.slice(0, 3)}, ${date} ${month.slice(0, 3)}`;
  if (opts.dateOnly) return `${date} ${month} ${year}`;
  return `${day}, ${date} ${month} ${year}`;
}

function formatTime(iso) {
  const d = parseIso(iso);
  if (!d) return '';
  const w = new Date(d.getTime() + WITA_OFFSET_MS);
  const h = String(w.getUTCHours()).padStart(2, '0');
  const m = String(w.getUTCMinutes()).padStart(2, '0');
  return `${h}.${m}`;
}

function formatRange(startIso, endIso, opts = {}) {
  const a = parseIso(startIso);
  const b = parseIso(endIso);
  if (!a || !b) return '';
  const sameDay = witaDateKey(startIso) === witaDateKey(endIso);
  if (!sameDay) {
    return `${formatDate(startIso, { short: true })} ${formatTime(startIso)} – ${formatDate(endIso, { short: true })} ${formatTime(endIso)}`;
  }
  const base = opts.dateOnly === false ? '' : `${formatDate(startIso, { short: true })} · `;
  return `${base}${formatTime(startIso)}–${formatTime(endIso)} WITA`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  return `${formatDate(iso, { short: true })} · ${formatTime(iso)} WITA`;
}

function durationHours(startIso, endIso) {
  const a = parseIso(startIso);
  const b = parseIso(endIso);
  if (!a || !b) return 0;
  return (b.getTime() - a.getTime()) / HOUR;
}

function minutesOfDay(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function witaClock(iso) {
  const d = parseIso(iso);
  if (!d) return 0;
  const w = new Date(d.getTime() + WITA_OFFSET_MS);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

function witaDayIndex(iso) {
  const d = parseIso(iso);
  if (!d) return 0;
  return new Date(d.getTime() + WITA_OFFSET_MS).getUTCDay();
}

module.exports = {
  WITA_OFFSET_MS,
  MINUTE,
  HOUR,
  DAY,
  nowIso,
  toIso,
  parseIso,
  witaInputToUtc,
  utcToWitaInput,
  witaDateKey,
  todayWitaKey,
  dayRangeUtc,
  addDays,
  addWorkingDays,
  startOfWeekWita,
  monthKey,
  monthRangeUtc,
  shiftMonth,
  DAY_NAMES,
  MONTH_NAMES,
  formatDate,
  formatTime,
  formatRange,
  formatDateTime,
  durationHours,
  minutesOfDay,
  witaClock,
  witaDayIndex
};
