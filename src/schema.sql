PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('BEM','Himpunan','UKM','Prodi')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  nim          TEXT UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('pemohon','pengurus','pengelola','admin')),
  org_id       INTEGER REFERENCES organizations(id),
  is_officer   INTEGER NOT NULL DEFAULT 0 CHECK (is_officer IN (0,1)),
  unit         TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  building         TEXT NOT NULL,
  floor            TEXT NOT NULL,
  capacity         INTEGER NOT NULL CHECK (capacity > 0),
  facilities       TEXT NOT NULL DEFAULT '[]',
  rules            TEXT NOT NULL DEFAULT '[]',
  operating_hours  TEXT NOT NULL,
  manager_id       INTEGER NOT NULL REFERENCES users(id),
  mode             TEXT NOT NULL CHECK (mode IN ('persetujuan','bebas')),
  max_hours        INTEGER NOT NULL DEFAULT 4,
  description      TEXT NOT NULL DEFAULT '',
  photo            TEXT NOT NULL DEFAULT '',
  art              TEXT NOT NULL DEFAULT 'grid',
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id          TEXT NOT NULL UNIQUE,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  room_id            INTEGER NOT NULL REFERENCES rooms(id),
  organization_id    INTEGER REFERENCES organizations(id),
  start_at           TEXT NOT NULL,
  end_at             TEXT NOT NULL,
  purpose            TEXT NOT NULL CHECK (purpose IN ('pribadi','organisasi')),
  activity_name      TEXT NOT NULL,
  organization_name  TEXT NOT NULL DEFAULT '',
  additional_borrowing TEXT NOT NULL DEFAULT '',
  participants       INTEGER NOT NULL CHECK (participants > 0),
  notes              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'Diajukan'
                       CHECK (status IN ('Diajukan','Disetujui','Ditolak','Dibatalkan','Kedaluwarsa','Selesai')),
  is_public          INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  public_description TEXT NOT NULL DEFAULT '',
  decision_reason    TEXT,
  idempotency_key    TEXT NOT NULL,
  request_hash       TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  decided_by         INTEGER REFERENCES users(id),
  decided_at         TEXT,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_res_room_time ON reservations(room_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_res_user ON reservations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);

CREATE TABLE IF NOT EXISTS blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     INTEGER NOT NULL REFERENCES rooms(id),
  start_at    TEXT NOT NULL,
  end_at      TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_room_time ON blocks(room_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id    INTEGER NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  moderation_status TEXT NOT NULL DEFAULT 'menunggu'
                      CHECK (moderation_status IN ('menunggu','terbit','ditolak')),
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id),
  actor_label TEXT NOT NULL,
  action      TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id   TEXT NOT NULL,
  reason      TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER REFERENCES users(id),
  reservation_id INTEGER REFERENCES reservations(id),
  channel        TEXT NOT NULL DEFAULT 'email',
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'terkirim' CHECK (status IN ('terkirim','gagal')),
  error          TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ip           TEXT
);

-- BR-02: an active reservation may never overlap another active reservation
-- or a block for the same room. The trigger is the last line of defence
-- behind the IMMEDIATE transaction in the booking service.
CREATE TRIGGER IF NOT EXISTS trg_reservation_overlap_insert
BEFORE INSERT ON reservations
WHEN NEW.status IN ('Diajukan','Disetujui')
BEGIN
  SELECT RAISE(ABORT, 'SLOT_CONFLICT')
  WHERE EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.room_id = NEW.room_id
      AND r.status IN ('Diajukan','Disetujui')
      AND NEW.start_at < r.end_at
      AND NEW.end_at > r.start_at
  )
  OR EXISTS (
    SELECT 1 FROM blocks b
    WHERE b.room_id = NEW.room_id
      AND NEW.start_at < b.end_at
      AND NEW.end_at > b.start_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_reservation_overlap_update
BEFORE UPDATE OF start_at, end_at, status, room_id ON reservations
WHEN NEW.status IN ('Diajukan','Disetujui')
BEGIN
  SELECT RAISE(ABORT, 'SLOT_CONFLICT')
  WHERE EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.room_id = NEW.room_id
      AND r.id <> NEW.id
      AND r.status IN ('Diajukan','Disetujui')
      AND NEW.start_at < r.end_at
      AND NEW.end_at > r.start_at
  )
  OR EXISTS (
    SELECT 1 FROM blocks b
    WHERE b.room_id = NEW.room_id
      AND NEW.start_at < b.end_at
      AND NEW.end_at > b.start_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_block_overlap_insert
BEFORE INSERT ON blocks
BEGIN
  SELECT RAISE(ABORT, 'SLOT_CONFLICT')
  WHERE EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.room_id = NEW.room_id
      AND r.status IN ('Diajukan','Disetujui')
      AND NEW.start_at < r.end_at
      AND NEW.end_at > r.start_at
  )
  OR EXISTS (
    SELECT 1 FROM blocks b
    WHERE b.room_id = NEW.room_id
      AND NEW.start_at < b.end_at
      AND NEW.end_at > b.start_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_block_overlap_update
BEFORE UPDATE OF start_at, end_at, room_id ON blocks
BEGIN
  SELECT RAISE(ABORT, 'SLOT_CONFLICT')
  WHERE EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.room_id = NEW.room_id
      AND r.status IN ('Diajukan','Disetujui')
      AND NEW.start_at < r.end_at
      AND NEW.end_at > r.start_at
  )
  OR EXISTS (
    SELECT 1 FROM blocks b
    WHERE b.room_id = NEW.room_id
      AND b.id <> NEW.id
      AND NEW.start_at < b.end_at
      AND NEW.end_at > b.start_at
  );
END;

-- Audit log is append-only.
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY');
END;
