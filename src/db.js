'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DB = path.join(ROOT, 'data', 'siruang.db');
const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

let singleton = null;

function openDb(filename = process.env.SIRUANG_DB || DEFAULT_DB) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 8000;');
  if (filename !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec(SCHEMA);
  const roomColumns = db.prepare('PRAGMA table_info(rooms)').all().map((c) => c.name);
  if (!roomColumns.includes('photo')) {
    db.exec("ALTER TABLE rooms ADD COLUMN photo TEXT NOT NULL DEFAULT '';");
  }
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('nim')) {
    db.exec('ALTER TABLE users ADD COLUMN nim TEXT;');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nim ON users(nim);');
  }
  const reservationColumns = db
    .prepare('PRAGMA table_info(reservations)')
    .all()
    .map((c) => c.name);
  if (!reservationColumns.includes('organization_name')) {
    db.exec("ALTER TABLE reservations ADD COLUMN organization_name TEXT NOT NULL DEFAULT '';");
  }
  if (!reservationColumns.includes('additional_borrowing')) {
    db.exec("ALTER TABLE reservations ADD COLUMN additional_borrowing TEXT NOT NULL DEFAULT '';");
  }
  return db;
}

function getDb() {
  if (!singleton) singleton = openDb();
  return singleton;
}

function closeDb() {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

function transaction(db, fn, mode = 'IMMEDIATE') {
  db.exec(`BEGIN ${mode};`);
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      /* already rolled back */
    }
    throw error;
  }
}

function isConflictError(error) {
  const message = String(error && error.message);
  return (
    message.includes('SLOT_CONFLICT') ||
    message.includes('UNIQUE constraint failed: reservations') ||
    message.includes('database is locked') ||
    message.includes('SQLITE_BUSY')
  );
}

function plain(row) {
  return row ? { ...row } : row;
}

function all(db, sql, params = []) {
  return db.prepare(sql).all(...params).map(plain);
}

function get(db, sql, params = []) {
  return plain(db.prepare(sql).get(...params));
}

function run(db, sql, params = []) {
  return db.prepare(sql).run(...params);
}

module.exports = {
  ROOT,
  DEFAULT_DB,
  openDb,
  getDb,
  closeDb,
  transaction,
  isConflictError,
  all,
  get,
  run
};
