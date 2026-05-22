-- 人物关系网 — D1 完整 schema

PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────────────────
-- Persons
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname          TEXT,
  standard_title    TEXT,
  dialect_title     TEXT,
  real_name         TEXT,
  gender            TEXT CHECK(gender IN ('male','female','unknown')) DEFAULT 'unknown',
  birth_date        TEXT,
  birth_calendar    TEXT NOT NULL DEFAULT 'solar',
  kinship           TEXT NOT NULL DEFAULT 'social'
                       CHECK(kinship IN ('blood','quasi','in_law','social')),
  avatar_url        TEXT,
  avatar_char       TEXT,
  notes             TEXT,
  deleted_at        INTEGER DEFAULT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_persons_kinship ON persons(kinship);
CREATE INDEX IF NOT EXISTS idx_persons_deleted ON persons(deleted_at);

-- ────────────────────────────────────────────────────────
-- Person Addresses (1:N)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL,
  address     TEXT NOT NULL,
  longitude   REAL,
  latitude    REAL,
  label       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_addresses_person ON person_addresses(person_id);

-- ────────────────────────────────────────────────────────
-- Relations
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_person_id  INTEGER NOT NULL,
  to_person_id    INTEGER NOT NULL,
  relation_type   TEXT NOT NULL,
  birth_order     INTEGER,
  description     TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (from_person_id) REFERENCES persons(id) ON DELETE CASCADE,
  FOREIGN KEY (to_person_id)   REFERENCES persons(id) ON DELETE CASCADE,
  UNIQUE(from_person_id, to_person_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_person_id);
CREATE INDEX IF NOT EXISTS idx_relations_to   ON relations(to_person_id);

-- ────────────────────────────────────────────────────────
-- Settings (KV)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ────────────────────────────────────────────────────────
-- Person Phones (1:N)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_phones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL,
  phone       TEXT NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phones_person ON person_phones(person_id);

-- ────────────────────────────────────────────────────────
-- Shares (AES-GCM encrypted password)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shares (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  token               TEXT NOT NULL UNIQUE,
  root_person_id      INTEGER NOT NULL,
  title               TEXT,
  password_encrypted  TEXT NOT NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at          INTEGER,
  mode                TEXT NOT NULL DEFAULT 'tree'
                        CHECK(mode IN ('tree','person')),
  hide_sensitive      INTEGER NOT NULL DEFAULT 0,
  visible_fields      TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (root_person_id) REFERENCES persons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);

-- ────────────────────────────────────────────────────────
-- Events
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT,
  event_date  TEXT,
  event_type  TEXT NOT NULL DEFAULT 'gathering',
  location    TEXT,
  longitude   REAL,
  latitude    REAL,
  media       TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at  INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_deleted ON events(deleted_at);

-- ────────────────────────────────────────────────────────
-- Event <-> Person (M:N)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_persons (
  event_id    INTEGER NOT NULL,
  person_id   INTEGER NOT NULL,
  role        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (event_id, person_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_persons_person ON event_persons(person_id);
CREATE INDEX IF NOT EXISTS idx_event_persons_event ON event_persons(event_id);

-- ────────────────────────────────────────────────────────
-- Taxonomies (event types / social relations)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxonomies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain          TEXT NOT NULL,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  icon_name       TEXT,
  color_hex       TEXT,
  order_index     INTEGER NOT NULL DEFAULT 0,
  is_default      INTEGER NOT NULL DEFAULT 0,
  is_anniversary  INTEGER NOT NULL DEFAULT 0,
  deleted_at      INTEGER DEFAULT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(domain, key)
);

CREATE INDEX IF NOT EXISTS idx_taxonomies_domain
  ON taxonomies(domain, order_index);

-- ────── 事件类型种子 ──────
INSERT OR IGNORE INTO taxonomies
  (domain, key, label, icon_name, color_hex, order_index, is_default)
VALUES
  ('event_type', 'gathering', '聚餐', 'CoffeeOutlined',  '#d97706', 0, 1),
  ('event_type', 'travel',    '旅行', 'CompassOutlined', '#059669', 1, 1),
  ('event_type', 'holiday',   '节日', 'FireOutlined',    '#7c3aed', 2, 1),
  ('event_type', 'work',      '工作', 'LaptopOutlined',  '#2563eb', 3, 1);

-- ────── 社会关系种子 ──────
INSERT OR IGNORE INTO taxonomies
  (domain, key, label, icon_name, color_hex, order_index, is_default)
VALUES
  ('social_relation', 'teacher',   '老师', 'BookOutlined',  '#d97706', 0, 1),
  ('social_relation', 'friend',    '朋友', 'UserOutlined',  '#6b7280', 1, 1),
  ('social_relation', 'neighbor',  '邻居', 'HomeOutlined',  '#059669', 2, 1),
  ('social_relation', 'colleague', '同事', 'TeamOutlined',  '#2563eb', 3, 1);
