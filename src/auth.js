'use strict';

const crypto = require('node:crypto');
const { nowIso } = require('./time');

const SESSION_HOURS = 12;
const COOKIE = 'siruang_session';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function mockPassword() {
  return process.env.MOCK_SSO_PASSWORD || 'idb12345';
}

function verifyMockPassword(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(mockPassword()).digest();
  return crypto.timingSafeEqual(a, b);
}

function findUserByLogin(db, login) {
  const value = String(login || '').trim().toLowerCase();
  if (!value) return null;
  return db
    .prepare(
      `SELECT * FROM users
       WHERE (lower(email) = ? OR lower(nim) = ?) AND active = 1
       LIMIT 1`
    )
    .get(value, value);
}

function createSession(db, userId, ip = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    hashToken(token),
    userId,
    created.toISOString(),
    created.toISOString(),
    expires.toISOString(),
    ip
  );
  return { token, expiresAt: expires.toISOString() };
}

function getSessionUser(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND u.active = 1`
    )
    .get(hashToken(token));
  if (!row) return null;
  const now = new Date();
  if (new Date(row.expires_at) <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  db.prepare(
    'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?'
  ).run(now.toISOString(), expires.toISOString(), row.token_hash);
  const user = { ...row };
  delete user.token_hash;
  delete user.expires_at;
  return user;
}

function destroySession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

function isAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

function isManager(user) {
  return Boolean(user && user.role === 'pengelola');
}

function managesRoom(user, room) {
  return Boolean(
    user &&
      room &&
      (isAdmin(user) || Number(room.manager_id) === Number(user.id))
  );
}

function canCreateReservation(user) {
  return Boolean(user && ['pemohon', 'pengurus'].includes(user.role));
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function sessionCookie(token, { secure = false } = {}) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_HOURS * 60 * 60}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const loginAttempts = new Map();

function loginRateLimited(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.first > windowMs) {
    loginAttempts.set(key, { first: now, count: 1 });
    return { limited: false, remaining: 4 };
  }
  entry.count += 1;
  if (entry.count > 5) {
    return {
      limited: true,
      retryAfter: Math.ceil((windowMs - (now - entry.first)) / 1000)
    };
  }
  return { limited: false, remaining: 5 - entry.count };
}

function resetLoginAttempts(key) {
  loginAttempts.delete(key);
}

module.exports = {
  SESSION_HOURS,
  mockPassword,
  verifyMockPassword,
  findUserByLogin,
  COOKIE,
  hashToken,
  createSession,
  getSessionUser,
  destroySession,
  purgeExpiredSessions,
  isAdmin,
  isManager,
  managesRoom,
  canCreateReservation,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  loginRateLimited,
  resetLoginAttempts
};
