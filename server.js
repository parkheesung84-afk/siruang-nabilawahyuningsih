'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  openDb,
  transaction,
  get: dbGet,
  all: dbAll
} = require('./src/db');
const { seed } = require('./src/seed');
const {
  nowIso,
  todayWitaKey,
  addDays,
  dayRangeUtc,
  witaInputToUtc,
  parseIso,
  monthKey,
  monthRangeUtc,
  startOfWeekWita,
  formatRange,
  formatDate,
  formatTime,
  witaDateKey
} = require('./src/time');
const {
  parseCookies,
  getSessionUser,
  createSession,
  destroySession,
  sessionCookie,
  clearSessionCookie,
  loginRateLimited,
  resetLoginAttempts,
  mockPassword,
  verifyMockPassword,
  findUserByLogin,
  COOKIE,
  isAdmin,
  managesRoom
} = require('./src/auth');
const {
  listRooms,
  getRoom,
  getReservation,
  findConflicts,
  availability,
  nextFreeSlots,
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
  monthEvents,
  weekEvents,
  dayRoomStatus,
  usageReport,
  publicCalendarEntries
} = require('./src/bookings');
const { audit } = require('./src/audit');
const { layout, authLayout } = require('./src/views/layout');
const { homePage, searchPage, roomDetailPage } = require('./src/views/public');
const { bookingPage, myReservationsPage, akunPage, loginPage } = require('./src/views/account');
const { guidePage } = require('./src/views/guide');
const { dashboardPage } = require('./src/views/dashboard');
const { calendarPage } = require('./src/views/calendar');
const { managerPage } = require('./src/views/manager');
const { adminPage } = require('./src/views/admin');
const { errorPage } = require('./src/views/errors');
const { esc, icon } = require('./src/views/components');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

const db = openDb(process.env.SIRUANG_DB);
seed(db);

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

let lastMaintenance = 0;
function maintenance() {
  const now = Date.now();
  if (now - lastMaintenance < 30_000) return;
  lastMaintenance = now;
  try {
    expireStale(db);
    completePast(db);
  } catch (error) {
    console.error('maintenance failed', error);
  }
}

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...extra
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, securityHeaders(headers));
  res.end(body);
}

function json(res, status, payload, headers = {}) {
  send(res, status, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
}

function html(res, status, body, headers = {}) {
  send(res, status, body, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
}

function redirect(res, location, headers = {}) {
  send(res, 303, '', { Location: location, ...headers });
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) {
    throw Object.assign(new Error('Content-Type harus application/json.'), {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE'
    });
  }
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Body JSON tidak valid.'), {
      status: 400,
      code: 'INVALID_JSON'
    });
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function clientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function userFor(req) {
  const cookies = parseCookies(req.headers.cookie);
  return getSessionUser(db, cookies[COOKIE]);
}

function isSecure(req) {
  return (
    Boolean(req.socket.encrypted) ||
    String(req.headers['x-forwarded-proto'] || '') === 'https'
  );
}

function cleanNext(next, fallback = '/') {
  const value = String(next || '');
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

function buildings() {
  return [...new Set(listRooms(db).map((room) => room.building))];
}

function toMin(clock) {
  const m = String(clock || '').match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function clockOf(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function defaultSlot(room) {
  const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const nowMinutes = nowWita.getUTCHours() * 60 + nowWita.getUTCMinutes();
  const duration = 120;
  for (let d = 0; d < 8; d += 1) {
    const dateKey = addDays(todayWitaKey(), d);
    const day = new Date(`${dateKey}T00:00:00+08:00`).getUTCDay();
    const hours = room.operating_hours[day];
    if (!hours) continue;
    const open = toMin(hours[0]);
    const close = toMin(hours[1]);
    if (open === null || close === null) continue;
    let start = d === 0
      ? Math.max(open, Math.ceil((nowMinutes + 15) / 30) * 30)
      : Math.max(open, 9 * 60);
    if (start + duration > close) {
      if (d === 0) continue;
      start = open;
      if (start + duration > close) continue;
    }
    return {
      dateKey,
      start: clockOf(start),
      end: clockOf(start + duration)
    };
  }
  const dateKey = addDays(todayWitaKey(), 1);
  return { dateKey, start: '09:00', end: '11:00' };
}

function parseDateParam(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const range = dayRangeUtc(value);
    if (range) return value;
  }
  return todayWitaKey();
}

function parseClock(value, fallback) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function searchInput(params) {
  let dateKey = parseDateParam(params.get('date'));
  let startTime = parseClock(params.get('start'), '09:00');
  let endTime = parseClock(params.get('end'), '11:00');
  const participants = Number(params.get('capacity') || params.get('participants')) || null;
  const building = params.get('building') || '';
  const facilities = params.getAll('facility').filter(Boolean);
  let startAt = witaInputToUtc(`${dateKey}T${startTime}`);
  let endAt = witaInputToUtc(`${dateKey}T${endTime}`);
  const now = new Date();
  if (!startAt || !endAt || endAt <= startAt) {
    startTime = '09:00';
    endTime = '11:00';
    startAt = witaInputToUtc(`${dateKey}T09:00`);
    endAt = witaInputToUtc(`${dateKey}T11:00`);
  }
  if (endAt.getTime() < now.getTime()) {
    dateKey = addDays(dateKey, 1);
    startAt = witaInputToUtc(`${dateKey}T${startTime}`);
    endAt = witaInputToUtc(`${dateKey}T${endTime}`);
  }
  return {
    dateKey,
    startTime,
    endTime,
    participants,
    building,
    facilities,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString()
  };
}

function render(res, {
  title,
  active,
  page,
  body,
  user,
  pageData,
  status = 200,
  managerQueueCount = 0,
  wide = false
}) {
  html(
    res,
    status,
    layout({
      title,
      active,
      page,
      body,
      user,
      pageData,
      managerQueueCount,
      wide
    })
  );
}

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:[A-Za-z]+/g, (match) => {
        keys.push(match.slice(1));
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ method, regex, keys, handler });
}

function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1]);
    });
    return { handler: r.handler, params };
  }
  return null;
}

function pageRequireUser(req, res) {
  const user = userFor(req);
  if (!user) {
    const next = encodeURIComponent(req.url);
    redirect(res, `/masuk?next=${next}`);
    return null;
  }
  return user;
}

function queueCount(user) {
  if (!user || !['pengelola', 'admin'].includes(user.role)) return 0;
  try {
    return managerQueue(db, user).length;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ pages */

route('GET', '/', (req, res, params, url) => {
  maintenance();
  const user = userFor(req);
  const query = searchInput(url.searchParams);
  const allRooms = listRooms(db);
  const rooms = query.participants
    ? allRooms.filter((room) => room.capacity >= query.participants)
    : allRooms;
  const statuses = {};
  for (const room of allRooms) {
    const conflicts = findConflicts(db, room.id, query.startAt, query.endAt);
    statuses[room.id] = conflicts.blocks.length
      ? 'blocked'
      : conflicts.reservations.length
        ? 'busy'
        : 'free';
  }
  const weekStart = startOfWeekWita(query.dateKey);
  const events = weekEvents(db, weekStart, addDays(weekStart, 6));
  const managerMap = new Map();
  for (const room of allRooms) {
    const entry = managerMap.get(room.manager_id) || {
      id: room.manager_id,
      name: room.manager_name,
      email: room.manager_email,
      rooms: []
    };
    entry.rooms.push(room);
    managerMap.set(room.manager_id, entry);
  }
  const body = homePage({
    user,
    rooms,
    allRooms,
    query,
    statuses,
    events,
    managers: [...managerMap.values()]
  });
  render(res, {
    title: 'Daftar ruangan tersedia',
    active: 'beranda',
    page: 'home',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: { dateKey: query.dateKey, startAt: query.startAt, endAt: query.endAt }
  });
});

route('GET', '/dashboard', (req, res) => {
  maintenance();
  const user = pageRequireUser(req, res);
  if (!user) return;
  const reservations = myReservations(db, user.id);
  const now = nowIso();
  const active = reservations.filter(
    (r) => ['Diajukan', 'Disetujui'].includes(r.status) && r.end_at > now
  );
  const pending = active.filter((r) => r.status === 'Diajukan');
  const approved = active.filter((r) => r.status === 'Disetujui');
  const completed = reservations.filter((r) => r.status === 'Selesai');
  const upcoming = active
    .slice()
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 4);
  const notifications = dbAll(
    db,
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 4',
    [user.id]
  );
  const weekStart = startOfWeekWita(todayWitaKey());
  const events = weekEvents(db, weekStart, addDays(weekStart, 6));
  let queue = 0;
  let managedRooms = [];
  let adminStats = null;
  if (['pengelola', 'admin'].includes(user.role)) {
    managedRooms = managerRooms(db, user);
    queue = managerQueue(db, user).length;
  }
  if (isAdmin(user)) {
    adminStats = {
      users: dbGet(db, 'SELECT COUNT(*) AS n FROM users WHERE active = 1').n,
      rooms: dbGet(db, 'SELECT COUNT(*) AS n FROM rooms WHERE active = 1').n,
      reservations: dbGet(db, 'SELECT COUNT(*) AS n FROM reservations').n,
      pending: dbGet(db, "SELECT COUNT(*) AS n FROM reservations WHERE status = 'Diajukan'").n
    };
  }
  const body = dashboardPage({
    user,
    reservations,
    active,
    pending,
    approved,
    completed,
    upcoming,
    notifications,
    events,
    queueCount: queue,
    managedRooms,
    adminStats
  });
  render(res, {
    title: 'Dashboard',
    active: 'dashboard',
    page: 'dashboard',
    body,
    user,
    managerQueueCount: queue,
    pageData: { userId: user.id }
  });
});

route('GET', '/panduan', (req, res) => {
  const user = userFor(req);
  const body = guidePage({ user });
  render(res, {
    title: 'Panduan penggunaan',
    active: 'panduan',
    page: 'panduan',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: {}
  });
});

route('GET', '/cari', (req, res, params, url) => {
  maintenance();
  const user = userFor(req);
  const query = searchInput(url.searchParams);
  const rooms = listRooms(db);
  const result = availability(db, {
    startAt: query.startAt,
    endAt: query.endAt,
    capacity: query.participants,
    building: query.building,
    facilities: query.facilities
  });
  const suggestions = result.free.length
    ? []
    : nextFreeSlots(db, {
        startAt: query.startAt,
        endAt: query.endAt,
        capacity: query.participants,
        building: query.building,
        facilities: query.facilities
      });
  const body = searchPage({ user, rooms, result, query, suggestions });
  render(res, {
    title: 'Cari ruangan',
    active: 'cari',
    page: 'search',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: {
      startAt: query.startAt,
      endAt: query.endAt,
      roomSlugs: result.free.map((r) => r.slug)
    }
  });
});

route('GET', '/ruangan/:slug', (req, res, params, url) => {
  maintenance();
  const user = userFor(req);
  const room = getRoom(db, params.slug);
  if (!room || !room.active) {
    return render(res, {
      title: 'Ruangan tidak ditemukan',
      active: 'cari',
      page: '404',
      user,
      status: 404,
      body: errorPage({
        code: '404',
        title: 'Ruangan tidak ditemukan',
        message: 'Ruangan mungkin sudah dinonaktifkan pengelola. Coba cari ruangan lain.',
        action: '/cari',
        actionLabel: 'Cari ruangan'
      })
    });
  }
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dateKey = addDays(todayWitaKey(), i);
    const range = dayRangeUtc(dateKey);
    const reservations = dbAll(
      db,
      `SELECT start_at, end_at, status FROM reservations
       WHERE room_id = ? AND status IN ('Diajukan','Disetujui')
         AND start_at < ? AND end_at > ? ORDER BY start_at`,
      [room.id, range.end.toISOString(), range.start.toISOString()]
    );
    const blocks = dbAll(
      db,
      `SELECT start_at, end_at, reason FROM blocks
       WHERE room_id = ? AND start_at < ? AND end_at > ?
       ORDER BY start_at`,
      [room.id, range.end.toISOString(), range.start.toISOString()]
    );
    const items = [
      ...reservations.map((r) => ({
        ...r,
        kind: 'reservation',
        label: r.status === 'Diajukan' ? 'Menunggu keputusan' : 'Terpakai'
      })),
      ...blocks.map((b) => ({
        ...b,
        kind: 'block',
        label: `Blokir: ${b.reason}`
      }))
    ].sort((a, b) => a.start_at.localeCompare(b.start_at));
    days.push({ dateKey, items });
  }
  const slot = defaultSlot(room);
  const nextFree = nextFreeSlots(db, {
    startAt: witaInputToUtc(`${slot.dateKey}T${slot.start}`).toISOString(),
    endAt: witaInputToUtc(`${slot.dateKey}T${slot.end}`).toISOString(),
    roomId: room.id
  })[0];
  const activeCount = dbGet(
    db,
    `SELECT COUNT(*) AS n FROM reservations
     WHERE room_id = ? AND status IN ('Diajukan','Disetujui') AND end_at > ?`,
    [room.id, nowIso()]
  ).n;
  const body = roomDetailPage({
    user,
    room,
    days,
    nextFree,
    defaultSlot: slot,
    isManaged: managesRoom(user, room),
    activeReservations: activeCount
  });
  render(res, {
    title: room.name,
    active: 'cari',
    page: 'room',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: { roomSlug: room.slug }
  });
});

route('GET', '/reservasi/baru', (req, res, params, url) => {
  maintenance();
  const user = pageRequireUser(req, res);
  if (!user) return;
  if (!['pemohon', 'pengurus'].includes(user.role)) {
    return render(res, {
      title: 'Tidak berwenang',
      active: '',
      page: '403',
      user,
      status: 403,
      body: errorPage({
        code: '403',
        title: 'Hanya pemohon dan pengurus',
        message: 'Akun pengelola dan admin tidak mengajukan reservasi dari jalur ini.',
        action: '/pengelola',
        actionLabel: 'Buka panel pengelola'
      })
    });
  }
  const room = getRoom(db, url.searchParams.get('room') || url.searchParams.get('roomId') || '');
  if (!room) {
    return redirect(res, '/#ruangan');
  }
  const slot = defaultSlot(room);
  const hasDate = Boolean(url.searchParams.get('date'));
  const dateKey = hasDate ? parseDateParam(url.searchParams.get('date')) : slot.dateKey;
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');
  const startClock = startParam && !startParam.includes('T')
    ? startParam
    : url.searchParams.get('startTime');
  const endClock = endParam && !endParam.includes('T')
    ? endParam
    : url.searchParams.get('endTime');
  let startAt = startParam && startParam.includes('T')
    ? parseIso(startParam)
    : witaInputToUtc(`${dateKey}T${parseClock(startClock, hasDate ? '09:00' : slot.start)}`);
  let endAt = endParam && endParam.includes('T')
    ? parseIso(endParam)
    : witaInputToUtc(`${dateKey}T${parseClock(endClock, hasDate ? '11:00' : slot.end)}`);
  if (!startAt || !endAt || endAt <= startAt) {
    startAt = witaInputToUtc(`${slot.dateKey}T${slot.start}`);
    endAt = witaInputToUtc(`${slot.dateKey}T${slot.end}`);
  }
  const participants = Number(url.searchParams.get('participants')) || 10;
  const initialConflicts = findConflicts(
    db,
    room.id,
    startAt.toISOString(),
    endAt.toISOString()
  );
  const initialBusy = initialConflicts.reservations.length > 0 || initialConflicts.blocks.length > 0;
  const suggestions = initialBusy
    ? nextFreeSlots(db, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        roomId: room.id
      }).slice(0, 4)
    : [];
  const org = user.org_id
    ? dbGet(db, 'SELECT * FROM organizations WHERE id = ?', [user.org_id])
    : null;
  const body = bookingPage({
    user,
    room,
    org,
    suggestions,
    prefill: {
      dateKey: witaDateKey(startAt.toISOString()),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      participants
    }
  });
  render(res, {
    title: `Ajukan ${room.name}`,
    active: 'form',
    page: 'booking',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: {
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        capacity: room.capacity,
        maxHours: room.max_hours,
        mode: room.mode
      },
      prefill: {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        participants
      }
    }
  });
});

route('GET', '/reservasi-saya', (req, res, params, url) => {
  maintenance();
  const user = pageRequireUser(req, res);
  if (!user) return;
  const all = myReservations(db, user.id);
  const filter = ['all', 'aktif', 'riwayat'].includes(url.searchParams.get('status'))
    ? url.searchParams.get('status')
    : 'all';
  const counts = {
    all: all.length,
    active: all.filter((r) => ['Diajukan', 'Disetujui'].includes(r.status)).length,
    history: all.filter((r) => !['Diajukan', 'Disetujui'].includes(r.status)).length
  };
  const filtered = all.filter((r) => {
    if (filter === 'aktif') return ['Diajukan', 'Disetujui'].includes(r.status);
    if (filter === 'riwayat') return !['Diajukan', 'Disetujui'].includes(r.status);
    return true;
  });
  const body = myReservationsPage({ user, reservations: filtered, filter, counts });
  render(res, {
    title: 'Reservasi saya',
    active: 'reservasi',
    page: 'reservasi-saya',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: { reservations: filtered.map((r) => r.public_id) }
  });
});

route('GET', '/akun', (req, res) => {
  const user = pageRequireUser(req, res);
  if (!user) return;
  const notifications = dbAll(
    db,
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [user.id]
  );
  const cookies = parseCookies(req.headers.cookie);
  const session = dbGet(
    db,
    'SELECT * FROM sessions WHERE token_hash = ?',
    [crypto.createHash('sha256').update(cookies[COOKIE] || '').digest('hex')]
  ) || { expires_at: nowIso() };
  const body = akunPage({ user, notifications, session });
  render(res, {
    title: 'Akun',
    active: 'akun',
    page: 'akun',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: { notifications: notifications.length }
  });
});

route('GET', '/kalender', (req, res, params, url) => {
  maintenance();
  const user = userFor(req);
  const requested = url.searchParams.get('month');
  const month = /^\d{4}-\d{2}$/.test(requested || '') ? requested : monthKey(todayWitaKey());
  const selectedDay = parseDateParam(url.searchParams.get('day'));
  const roomFilter = url.searchParams.get('room')
    ? getRoom(db, url.searchParams.get('room'))
    : null;
  let events = publicCalendarEntries(db, month);
  let dayStatus = dayRoomStatus(db, selectedDay);
  if (roomFilter) {
    events = events.filter((event) => event.room_slug === roomFilter.slug);
    dayStatus = dayStatus.filter((item) => item.room.id === roomFilter.id);
  }
  const body = calendarPage({
    events,
    month,
    selectedDay,
    dayStatus,
    rooms: listRooms(db),
    roomFilter
  });
  render(res, {
    title: 'Kalender kampus',
    active: 'kalender',
    page: 'calendar',
    body,
    user,
    managerQueueCount: queueCount(user),
    pageData: { month, selectedDay }
  });
});

route('GET', '/masuk', (req, res, params, url) => {
  const user = userFor(req);
  const next = cleanNext(url.searchParams.get('next'), '/dashboard');
  if (user) return redirect(res, next);
  const accounts = dbAll(
    db,
    `SELECT u.id, u.name, u.email, u.nim, u.role, u.unit, o.name AS org_name
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.active = 1 ORDER BY
       CASE u.role WHEN 'pemohon' THEN 1 WHEN 'pengurus' THEN 2 WHEN 'pengelola' THEN 3 ELSE 4 END, u.name`
  );
  const body = loginPage({
    accounts,
    next,
    mode: 'user',
    demoPassword: mockPassword(),
    error: url.searchParams.get('error') || '',
    lockedUntil: url.searchParams.get('locked') || '',
    prefillLogin: url.searchParams.get('login') || ''
  });
  html(res, 200, authLayout({
    title: 'Masuk Akun',
    page: 'login',
    body
  }));
});

route('GET', '/masuk/admin', (req, res, params, url) => {
  const user = userFor(req);
  if (user && isAdmin(user)) return redirect(res, '/admin');
  const next = cleanNext(url.searchParams.get('next'), '/admin');
  const accounts = dbAll(
    db,
    `SELECT u.id, u.name, u.email, u.nim, u.role, u.unit, o.name AS org_name
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.active = 1 ORDER BY u.name`
  );
  const body = loginPage({
    accounts,
    next,
    mode: 'admin',
    demoPassword: mockPassword(),
    error: url.searchParams.get('error') || '',
    lockedUntil: url.searchParams.get('locked') || '',
    prefillLogin: url.searchParams.get('login') || ''
  });
  html(res, 200, authLayout({
    title: 'Masuk Admin',
    page: 'login-admin',
    body
  }));
});

route('GET', '/pengelola', (req, res, params, url) => {
  maintenance();
  const user = pageRequireUser(req, res);
  if (!user) return;
  if (!['pengelola', 'admin'].includes(user.role)) {
    return render(res, {
      title: 'Tidak berwenang',
      active: '',
      page: '403',
      user,
      status: 403,
      body: errorPage({
        code: '403',
        title: 'Akses pengelola diperlukan',
        message: 'Panel ini hanya untuk pengelola ruangan dan admin sistem.',
        action: '/',
        actionLabel: 'Kembali ke beranda'
      })
    });
  }
  const rooms = managerRooms(db, user);
  const ids = rooms.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',') || 'NULL';
  const pendingEvents = ids.length
    ? dbAll(
        db,
        `SELECT e.*, r.public_id, r.start_at, r.end_at, rm.name AS room_name
         FROM events e JOIN reservations r ON r.id = e.reservation_id
         JOIN rooms rm ON rm.id = r.room_id
         WHERE e.moderation_status = 'menunggu' AND r.status = 'Disetujui'
           AND r.room_id IN (${placeholders})
         ORDER BY r.start_at`,
        ids
      )
    : [];
  const month = monthKey(todayWitaKey());
  const range = monthRangeUtc(month);
  const report = usageReport(db, {
    from: range.start.toISOString(),
    to: range.end.toISOString()
  }).filter((row) => ids.includes(row.id));
  const searchQuery = String(url.searchParams.get('q') || '').trim();
  let searchResult = null;
  if (searchQuery) {
    const found = getReservation(db, searchQuery);
    if (found && ids.includes(found.room_id)) searchResult = found;
  }
  const body = managerPage({
    user,
    rooms,
    queue: managerQueue(db, user),
    history: managerHistory(db, user),
    blocks: blocksForManager(db, user),
    pendingEvents,
    report,
    searchResult,
    searchQuery
  });
  render(res, {
    title: 'Panel pengelola',
    active: 'pengelola',
    page: 'manager',
    body,
    user,
    wide: true,
    managerQueueCount: queueCount(user),
    pageData: { rooms: rooms.map((r) => ({ id: r.id, name: r.name })) }
  });
});

route('GET', '/admin', (req, res) => {
  maintenance();
  const user = pageRequireUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) {
    return render(res, {
      title: 'Tidak berwenang',
      active: '',
      page: '403',
      user,
      status: 403,
      body: errorPage({
        code: '403',
        title: 'Akses admin diperlukan',
        message: 'Panel ini hanya untuk admin sistem.',
        action: '/',
        actionLabel: 'Kembali ke beranda'
      })
    });
  }
  const users = dbAll(
    db,
    `SELECT u.*, o.name AS org_name FROM users u
     LEFT JOIN organizations o ON o.id = u.org_id ORDER BY u.id`
  );
  const rooms = listRooms(db, { includeInactive: true });
  const auditRows = dbAll(
    db,
    'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120'
  );
  const stats = {
    users: users.filter((u) => u.active).length,
    officers: users.filter((u) => u.role === 'pengurus').length,
    managers: users.filter((u) => u.role === 'pengelola').length,
    rooms: rooms.filter((r) => r.active).length,
    modeFree: rooms.filter((r) => r.mode === 'bebas').length,
    modeApproval: rooms.filter((r) => r.mode === 'persetujuan').length,
    reservations: dbGet(db, 'SELECT COUNT(*) AS n FROM reservations').n,
    pending: dbGet(db, "SELECT COUNT(*) AS n FROM reservations WHERE status = 'Diajukan'").n,
    conflicts: dbGet(db, "SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE '%conflict%'").n,
    failedNotifications: dbGet(db, "SELECT COUNT(*) AS n FROM notifications WHERE status = 'gagal'").n
  };
  const body = adminPage({ user, users, rooms, audit: auditRows, stats });
  render(res, {
    title: 'Panel admin',
    active: 'admin',
    page: 'admin',
    body,
    user,
    wide: true,
    managerQueueCount: queueCount(user),
    pageData: { stats }
  });
});

/* -------------------------------------------------------------- auth API */

route('POST', '/api/auth/login', async (req, res) => {
  if (!sameOrigin(req)) return json(res, 403, { error: 'CSRF', message: 'Origin tidak cocok.' });
  const moment = loginRateLimited(clientIp(req));
  if (moment.limited) {
    return json(res, 429, { error: 'RATE_LIMITED', message: `Terlalu banyak percobaan. Coba lagi dalam ${moment.retryAfter} detik.` });
  }
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, error.status || 400, { error: error.code || 'BAD_REQUEST', message: error.message });
  }
  const account = findUserByLogin(db, body.login);
  if (!account || !verifyMockPassword(body.password)) {
    return json(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Email/NIM atau password salah.' });
  }
  resetLoginAttempts(clientIp(req));
  const session = createSession(db, account.id, clientIp(req));
  audit(db, { actor: account, action: 'auth.login', objectType: 'user', objectId: account.id });
  const next = cleanNext(body.next, '/dashboard');
  return json(res, 200, {
    ok: true,
    redirect: next,
    user: { id: account.id, name: account.name, email: account.email, nim: account.nim, role: account.role }
  }, {
    'Set-Cookie': sessionCookie(session.token, { secure: isSecure(req) })
  });
});

route('POST', '/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const user = userFor(req);
  if (user) {
    audit(db, { actor: user, action: 'auth.logout', objectType: 'user', objectId: user.id });
  }
  destroySession(db, cookies[COOKIE]);
  const wantsJson = String(req.headers.accept || '').includes('application/json');
  if (wantsJson) {
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
  }
  return redirect(res, '/', { 'Set-Cookie': clearSessionCookie() });
});

route('POST', '/masuk', async (req, res) => {
  if (!sameOrigin(req)) {
    return html(res, 403, layout({
      title: 'Permintaan ditolak', active: '', page: '403', user: null,
      body: errorPage({ code: '403', title: 'Permintaan ditolak', message: 'Origin tidak cocok.' })
    }));
  }
  const moment = loginRateLimited(clientIp(req));
  if (moment.limited) return redirect(res, `/masuk?locked=${moment.retryAfter}`);
  const raw = await readBody(req);
  const form = new URLSearchParams(raw);
  const login = String(form.get('login') || '').trim();
  const password = String(form.get('password') || '');
  const next = cleanNext(form.get('next'));
  const account = findUserByLogin(db, login);
  if (!account || !verifyMockPassword(password)) {
    return redirect(
      res,
      `/masuk?error=${encodeURIComponent('Email/NIM atau password salah.')}&login=${encodeURIComponent(login)}&next=${encodeURIComponent(next)}`
    );
  }
  resetLoginAttempts(clientIp(req));
  const session = createSession(db, account.id, clientIp(req));
  audit(db, { actor: account, action: 'auth.login', objectType: 'user', objectId: account.id });
  return redirect(res, next, {
    'Set-Cookie': sessionCookie(session.token, { secure: isSecure(req) })
  });
});

route('POST', '/masuk/admin', async (req, res) => {
  if (!sameOrigin(req)) {
    return html(res, 403, layout({
      title: 'Permintaan ditolak', active: '', page: '403', user: null,
      body: errorPage({ code: '403', title: 'Permintaan ditolak', message: 'Origin tidak cocok.' })
    }));
  }
  const moment = loginRateLimited(clientIp(req));
  if (moment.limited) return redirect(res, `/masuk/admin?locked=${moment.retryAfter}`);
  const raw = await readBody(req);
  const form = new URLSearchParams(raw);
  const login = String(form.get('login') || '').trim();
  const password = String(form.get('password') || '');
  const account = findUserByLogin(db, login);
  if (!account || !verifyMockPassword(password)) {
    return redirect(
      res,
      `/masuk/admin?error=${encodeURIComponent('Email/NIM atau password salah.')}&login=${encodeURIComponent(login)}`
    );
  }
  if (account.role !== 'admin') {
    return redirect(
      res,
      `/masuk/admin?error=${encodeURIComponent('Akun ini bukan admin. Gunakan halaman Masuk Akun pengguna.')}&login=${encodeURIComponent(login)}`
    );
  }
  resetLoginAttempts(clientIp(req));
  const session = createSession(db, account.id, clientIp(req));
  audit(db, { actor: account, action: 'auth.login_admin', objectType: 'user', objectId: account.id });
  return redirect(res, cleanNext(form.get('next'), '/admin'), {
    'Set-Cookie': sessionCookie(session.token, { secure: isSecure(req) })
  });
});

route('GET', '/auth/login', (req, res, params, url) => {
  redirect(res, `/masuk?next=${encodeURIComponent(cleanNext(url.searchParams.get('next'), '/dashboard'))}`);
});

/* ---------------------------------------------------------------- API */

function apiUser(req, res) {
  const user = userFor(req);
  if (!user) {
    json(res, 401, { error: 'UNAUTHENTICATED', message: 'Sesi tidak valid. Silakan masuk kembali.' });
    return null;
  }
  return user;
}

function apiOrigin(req, res) {
  if (!sameOrigin(req)) {
    json(res, 403, { error: 'CSRF', message: 'Origin tidak cocok.' });
    return false;
  }
  return true;
}

route('GET', '/healthz', (req, res) => {
  const row = db.prepare('SELECT 1 AS ok').get();
  json(res, 200, {
    status: row && row.ok === 1 ? 'ok' : 'degraded',
    database: row && row.ok === 1 ? 'ok' : 'error',
    time: nowIso()
  });
});

route('GET', '/api/rooms', (req, res, params, url) => {
  const rooms = listRooms(db);
  const building = url.searchParams.get('building');
  const capacity = Number(url.searchParams.get('capacity')) || null;
  const filtered = rooms.filter(
    (r) => (!building || r.building === building) && (!capacity || r.capacity >= capacity)
  );
  json(res, 200, { rooms: filtered });
});

route('GET', '/api/rooms/:id', (req, res, params) => {
  const room = getRoom(db, params.id);
  if (!room) return json(res, 404, { error: 'ROOM_NOT_FOUND', message: 'Ruangan tidak ditemukan.' });
  json(res, 200, { room });
});

route('GET', '/api/availability', (req, res, params, url) => {
  const query = searchInput(url.searchParams);
  const result = availability(db, {
    startAt: query.startAt,
    endAt: query.endAt,
    capacity: query.participants,
    building: query.building,
    facilities: query.facilities
  });
  const suggestions = result.free.length
    ? []
    : nextFreeSlots(db, {
        startAt: query.startAt,
        endAt: query.endAt,
        capacity: query.participants,
        building: query.building,
        facilities: query.facilities
      });
  json(res, 200, {
    startAt: query.startAt,
    endAt: query.endAt,
    free: result.free,
    busyCount: result.busy.length,
    suggestions: suggestions.map((s) => ({
      roomSlug: s.room.slug,
      roomName: s.room.name,
      startAt: s.startAt,
      endAt: s.endAt
    }))
  });
});

route('GET', '/api/calendar', (req, res, params, url) => {
  const requested = url.searchParams.get('month');
  const month = /^\d{4}-\d{2}$/.test(requested || '') ? requested : monthKey(todayWitaKey());
  const roomFilter = url.searchParams.get('room') ? getRoom(db, url.searchParams.get('room')) : null;
  const entries = publicCalendarEntries(db, month).filter(
    (e) => !roomFilter || e.room_slug === roomFilter.slug
  );
  json(res, 200, {
    month,
    room: roomFilter ? roomFilter.slug : null,
    events: entries.map((e) => ({
      title: e.title,
      description: e.description,
      room: e.room_name,
      organizer: e.organizer_name,
      startAt: e.start_at,
      endAt: e.end_at
    }))
  });
});

route('GET', '/api/reservations/me', (req, res) => {
  const user = apiUser(req, res);
  if (!user) return;
  json(res, 200, { reservations: myReservations(db, user.id) });
});

route('POST', '/api/reservations', async (req, res) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  if (!['pemohon', 'pengurus'].includes(user.role)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Akun ini tidak dapat mengajukan reservasi.' });
  }
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, error.status || 400, { error: error.code || 'BAD_REQUEST', message: error.message });
  }
  const room = getRoom(db, body.roomId || body.roomSlug);
  const result = createReservation(db, {
    user,
    input: {
      roomId: room ? room.id : body.roomId,
      startAt: body.startAt,
      endAt: body.endAt,
      purpose: body.purpose,
      organizationName: body.organizationName,
      additionalBorrowing: body.additionalBorrowing,
      activityName: body.activityName,
      participants: body.participants,
      notes: body.notes,
      organizationId: body.organizationId,
      isPublic: body.isPublic,
      publicDescription: body.publicDescription
    },
    idempotencyKey: req.headers['idempotency-key']
  });
  if (result.status === 409) {
    audit(db, {
      actor: user,
      action: 'reservation.conflict',
      objectType: 'room',
      objectId: String(room ? room.id : 'unknown'),
      meta: { requestedStart: body.startAt, requestedEnd: body.endAt }
    });
  }
  return json(res, result.status, result.body);
});

route('POST', '/api/reservations/:id/cancel', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  let body = {};
  if (String(req.headers['content-type'] || '').includes('application/json')) {
    body = await readJson(req);
  }
  const result = cancelReservation(db, {
    user,
    idOrPublic: params.id,
    reason: body.reason
  });
  json(res, result.status, result.body);
});

route('POST', '/api/reservations/:id/approve', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  if (!['pengelola', 'admin'].includes(user.role)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Akses pengelola diperlukan.' });
  }
  const result = decideReservation(db, { user, idOrPublic: params.id, action: 'approve' });
  json(res, result.status, result.body);
});

route('POST', '/api/reservations/:id/reject', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  if (!['pengelola', 'admin'].includes(user.role)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Akses pengelola diperlukan.' });
  }
  let body = {};
  if (String(req.headers['content-type'] || '').includes('application/json')) {
    body = await readJson(req);
  }
  const result = decideReservation(db, {
    user,
    idOrPublic: params.id,
    action: 'reject',
    reason: body.reason
  });
  json(res, result.status, result.body);
});

route('GET', '/api/manage/queue', (req, res) => {
  const user = apiUser(req, res);
  if (!user) return;
  if (!['pengelola', 'admin'].includes(user.role)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Akses pengelola diperlukan.' });
  }
  json(res, 200, { queue: managerQueue(db, user) });
});

route('POST', '/api/rooms/:id/blocks', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  if (!['pengelola', 'admin'].includes(user.role)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Akses pengelola diperlukan.' });
  }
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, error.status || 400, { error: error.code || 'BAD_REQUEST', message: error.message });
  }
  const result = createBlock(db, {
    user,
    roomId: params.id,
    startAt: body.startAt,
    endAt: body.endAt,
    reason: body.reason,
    confirmOverlap: Boolean(body.confirmOverlap)
  });
  json(res, result.status, result.body);
});

route('POST', '/api/events/:id/moderate', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, error.status || 400, { error: error.code || 'BAD_REQUEST', message: error.message });
  }
  const status = body.status;
  if (!['terbit', 'ditolak'].includes(status)) {
    return json(res, 422, { error: 'VALIDATION_ERROR', message: 'Status moderasi tidak valid.' });
  }
  const event = dbGet(
    db,
    `SELECT e.*, r.room_id, r.public_id, rm.manager_id
     FROM events e JOIN reservations r ON r.id = e.reservation_id
     JOIN rooms rm ON rm.id = r.room_id WHERE e.id = ?`,
    [Number(params.id)]
  );
  if (!event) return json(res, 404, { error: 'EVENT_NOT_FOUND', message: 'Kegiatan tidak ditemukan.' });
  if (!isAdmin(user) && Number(event.manager_id) !== Number(user.id)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Anda tidak mengelola ruangan kegiatan ini.' });
  }
  transaction(db, () => {
    db.prepare('UPDATE events SET moderation_status = ? WHERE id = ?').run(status, event.id);
    audit(db, {
      actor: user,
      action: 'event.moderate',
      objectType: 'event',
      objectId: String(event.id),
      reason: status,
      meta: { reservation: event.public_id }
    });
  });
  json(res, 200, { ok: true, message: status === 'terbit' ? 'Kegiatan diterbitkan ke kalender publik.' : 'Usulan publikasi ditolak.' });
});

route('GET', '/api/manage/export.csv', (req, res, params, url) => {
  const user = apiUser(req, res);
  if (!user) return;
  if (!['pengelola', 'admin'].includes(user.role)) {
    return json(res, 403, { error: 'FORBIDDEN', message: 'Akses pengelola diperlukan.' });
  }
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '')
    ? url.searchParams.get('month')
    : monthKey(todayWitaKey());
  const range = monthRangeUtc(month);
  const rooms = managerRooms(db, user);
  const ids = rooms.map((r) => r.id);
  const rows = usageReport(db, {
    from: range.start.toISOString(),
    to: range.end.toISOString()
  }).filter((row) => ids.includes(row.id));
  const header = 'ruangan,gedung,disetujui,jam_terpakai,dibatalkan,ditolak\n';
  const body = rows
    .map((r) =>
      [
        `"${String(r.name).replace(/"/g, '""')}"`,
        `"${String(r.building).replace(/"/g, '""')}"`,
        r.approved || 0,
        Number(r.hours || 0).toFixed(2),
        r.cancelled || 0,
        r.rejected || 0
      ].join(',')
    )
    .join('\n');
  send(res, 200, '\uFEFF' + header + body, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="siruang-${month}.csv"`,
    'Cache-Control': 'no-store'
  });
});

route('GET', '/api/admin/users', (req, res) => {
  const user = apiUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) return json(res, 403, { error: 'FORBIDDEN', message: 'Akses admin diperlukan.' });
  json(res, 200, { users: dbAll(db, 'SELECT id, name, email, role, active, org_id, unit FROM users ORDER BY id') });
});

route('PATCH', '/api/admin/users/:id', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) return json(res, 403, { error: 'FORBIDDEN', message: 'Akses admin diperlukan.' });
  const target = dbGet(db, 'SELECT * FROM users WHERE id = ?', [Number(params.id)]);
  if (!target) return json(res, 404, { error: 'USER_NOT_FOUND', message: 'Pengguna tidak ditemukan.' });
  const body = await readJson(req);
  const nextRole = ['pemohon', 'pengurus', 'pengelola', 'admin'].includes(body.role)
    ? body.role
    : target.role;
  const nextActive = body.active === undefined ? target.active : body.active ? 1 : 0;
  if (target.id === user.id && (nextRole !== 'admin' || !nextActive)) {
    return json(res, 422, {
      error: 'SELF_LOCKOUT',
      message: 'Admin tidak dapat menurunkan peran atau menonaktifkan akunnya sendiri.'
    });
  }
  transaction(db, () => {
    db.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').run(nextRole, nextActive, target.id);
    audit(db, {
      actor: user,
      action: 'admin.user.update',
      objectType: 'user',
      objectId: String(target.id),
      meta: { before: { role: target.role, active: target.active }, after: { role: nextRole, active: nextActive } }
    });
  });
  json(res, 200, { ok: true, user: { id: target.id, role: nextRole, active: nextActive } });
});

route('GET', '/api/admin/rooms', (req, res) => {
  const user = apiUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) return json(res, 403, { error: 'FORBIDDEN', message: 'Akses admin diperlukan.' });
  json(res, 200, { rooms: listRooms(db, { includeInactive: true }) });
});

route('PATCH', '/api/admin/rooms/:id', async (req, res, params) => {
  if (!apiOrigin(req, res)) return;
  const user = apiUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) return json(res, 403, { error: 'FORBIDDEN', message: 'Akses admin diperlukan.' });
  const room = getRoom(db, params.id);
  if (!room) return json(res, 404, { error: 'ROOM_NOT_FOUND', message: 'Ruangan tidak ditemukan.' });
  const body = await readJson(req);
  const capacity = Number(body.capacity ?? room.capacity);
  const mode = ['bebas', 'persetujuan'].includes(body.mode) ? body.mode : room.mode;
  const active = body.active === undefined ? room.active : body.active ? 1 : 0;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    return json(res, 422, { error: 'VALIDATION_ERROR', message: 'Kapasitas harus 1–500.' });
  }
  transaction(db, () => {
    db.prepare('UPDATE rooms SET capacity = ?, mode = ?, active = ? WHERE id = ?')
      .run(capacity, mode, active, room.id);
    audit(db, {
      actor: user,
      action: 'admin.room.update',
      objectType: 'room',
      objectId: String(room.id),
      meta: {
        before: { capacity: room.capacity, mode: room.mode, active: room.active },
        after: { capacity, mode, active }
      }
    });
  });
  json(res, 200, { ok: true, room: { id: room.id, capacity, mode, active } });
});

route('GET', '/api/admin/audit', (req, res, params, url) => {
  const user = apiUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) return json(res, 403, { error: 'FORBIDDEN', message: 'Akses admin diperlukan.' });
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
  json(res, 200, { logs: dbAll(db, 'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [limit]) });
});

/* ------------------------------------------------------------- static */

function serveStatic(req, res, pathname) {
  const rel = pathname.replace(/^\/+/, '');
  if (!rel || rel.includes('..') || rel.startsWith('.')) return false;
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = /\.(woff2|ttf|png|jpg|jpeg|webp|svg)$/.test(ext)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  const data = fs.readFileSync(file);
  send(res, 200, data, { 'Content-Type': type, 'Cache-Control': cache });
  return true;
}

/* ------------------------------------------------------------- server */

async function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return json(res, 400, { error: 'BAD_URL', message: 'URL tidak valid.' });
  }
  const pathname = url.pathname;

  if (req.method === 'GET' && serveStatic(req, res, pathname)) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    if (mutating && !sameOrigin(req)) {
      return json(res, 403, { error: 'CSRF', message: 'Origin tidak cocok.' });
    }
  }

  const found = match(req.method, pathname);
  if (!found) {
    if (pathname.startsWith('/api/')) {
      return json(res, 404, { error: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' });
    }
    const user = userFor(req);
    return render(res, {
      title: 'Halaman tidak ditemukan',
      active: '',
      page: '404',
      user,
      status: 404,
      body: errorPage({
        code: '404',
        title: 'Halaman tidak ditemukan',
        message: 'Tautan mungkin sudah berubah. Mulai lagi dari beranda atau pencarian ruangan.'
      })
    });
  }

  try {
    await found.handler(req, res, found.params, url);
  } catch (error) {
    console.error('request failed', req.method, pathname, error);
    if (pathname.startsWith('/api/')) {
      return json(res, error.status || 500, {
        error: error.code || 'INTERNAL_ERROR',
        message: error.status ? error.message : 'Server gagal memproses permintaan. Coba lagi.'
      });
    }
    const user = userFor(req);
    return render(res, {
      title: 'Terjadi kesalahan',
      active: '',
      page: '500',
      user,
      status: 500,
      body: errorPage({
        code: '500',
        title: 'Server gagal memproses',
        message: 'Coba lagi. Jika kamu baru mengirim reservasi, cek Reservasi saya sebelum memesan ulang.',
        action: '/reservasi-saya',
        actionLabel: 'Cek reservasi saya'
      })
    });
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`SiRuang listening on http://${HOST}:${PORT}`);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      /* noop */
    }
    process.exit(0);
  });
}

module.exports = handleRequest;
module.exports.server = server;
module.exports.shutdown = shutdown;
