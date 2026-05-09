const { DatabaseSync } = require('node:sqlite')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.join(__dirname, 'data')
const UPLOADS_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const db = new DatabaseSync(path.join(DATA_DIR, 'vehicle.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = OFF') // OFF during migration

// ── Schema version tracking ──────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`)
const vRow = db.prepare(`SELECT value FROM schema_meta WHERE key='version'`).get()
const schemaVersion = vRow ? parseInt(vRow.value) : 0

// ── Migration to v2 ──────────────────────────────────────────────────────────
// Changes: new vehicle fields, new statuses (reported/departed), new roles,
//          dock_id on users table so supervisor sees only their dock
if (schemaVersion < 2) {

  // 1. Users table — recreate without CHECK constraint, add dock_id
  const hasUsers = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get()
  db.exec(`
    CREATE TABLE users_v2 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT UNIQUE NOT NULL,
      password_hash  TEXT NOT NULL,
      password_plain TEXT,
      name           TEXT NOT NULL,
      role           TEXT NOT NULL,
      dock_id        INTEGER,
      active         INTEGER DEFAULT 1,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  if (hasUsers) {
    try {
      db.exec(`INSERT INTO users_v2 (id,username,password_hash,name,role,active,created_at)
               SELECT id,username,password_hash,name,role,active,created_at FROM users`)
    } catch {}
    db.exec(`DROP TABLE users`)
  }
  db.exec(`ALTER TABLE users_v2 RENAME TO users`)

  // 2. Docks table — recreate (keep existing data)
  const hasDocks = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='docks'`).get()
  db.exec(`
    CREATE TABLE docks_v2 (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      dock_no          TEXT UNIQUE NOT NULL,
      supervisor_name  TEXT,
      supervisor_phone TEXT,
      status           TEXT DEFAULT 'green',
      active           INTEGER DEFAULT 1,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  if (hasDocks) {
    try {
      db.exec(`INSERT INTO docks_v2 SELECT id,dock_no,supervisor_name,supervisor_phone,status,active,created_at FROM docks`)
    } catch {}
    db.exec(`DROP TABLE docks`)
  }
  db.exec(`ALTER TABLE docks_v2 RENAME TO docks`)

  // 3. Vehicles table — recreate with new fields and statuses
  const hasVehicles = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'`).get()
  db.exec(`
    CREATE TABLE vehicles_v2 (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_no       TEXT NOT NULL,
      shipment_no      TEXT,
      driver_name      TEXT,
      driver_mobile    TEXT,
      arrival_photo    TEXT,
      arrival_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
      status           TEXT DEFAULT 'reported',
      assigned_dock_id INTEGER,
      assigned_time    DATETIME,
      seal_photo       TEXT,
      gate_photo       TEXT,
      offload_photo    TEXT,
      offload_time     DATETIME,
      departed_time    DATETIME,
      registered_by    INTEGER
    )
  `)
  if (hasVehicles) {
    try {
      db.exec(`
        INSERT INTO vehicles_v2
          (id,vehicle_no,arrival_photo,arrival_time,status,assigned_dock_id,assigned_time,
           seal_photo,offload_photo,offload_time,registered_by)
        SELECT id,vehicle_no,arrival_photo,arrival_time,
               CASE status WHEN 'waiting' THEN CASE WHEN assigned_dock_id IS NULL THEN 'waiting' ELSE 'assigned' END
                           ELSE status END,
               assigned_dock_id,assigned_time,seal_photo,offload_photo,offload_time,registered_by
        FROM vehicles
      `)
    } catch {}
    db.exec(`DROP TABLE vehicles`)
  }
  db.exec(`ALTER TABLE vehicles_v2 RENAME TO vehicles`)

  // 4. Queue and Events — recreate fresh (no structural change)
  db.exec(`DROP TABLE IF EXISTS queue`)
  db.exec(`DROP TABLE IF EXISTS events`)
  db.exec(`
    CREATE TABLE queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER UNIQUE,
      queued_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER,
      dock_id    INTEGER,
      event_type TEXT NOT NULL,
      photo      TEXT,
      notes      TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','2')`).run()
}

// ── Migration to v3: add password_plain column ────────────────────────────────
if (schemaVersion < 3) {
  try { db.exec(`ALTER TABLE users ADD COLUMN password_plain TEXT`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','3')`).run()
}

// ── Migration to v4: add gate_photo column to vehicles ────────────────────────
if (schemaVersion < 4) {
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN gate_photo TEXT`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','4')`).run()
}

// ── Migration to v5: unique shipment (among non-null), performance indexes ───
if (schemaVersion < 5) {
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_shipment_no ON vehicles(shipment_no) WHERE shipment_no IS NOT NULL`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status)`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_vehicles_dock ON vehicles(assigned_dock_id)`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_vehicles_arrival ON vehicles(arrival_time)`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_queue_queued_at ON queue(queued_at)`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_events_vehicle ON events(vehicle_id)`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','5')`).run()
}

// ── Migration to v6: inbound/outbound workflow ─────────────────────────────-─
// dock.type, vehicle.purpose, prev history columns, rejections table.
if (schemaVersion < 6) {
  try { db.exec(`ALTER TABLE docks ADD COLUMN type TEXT DEFAULT 'inbound'`) } catch {}
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN purpose TEXT DEFAULT 'inbound'`) } catch {}
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN prev_vehicle_nos TEXT`) } catch {}
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN prev_shipment_no TEXT`) } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rejections (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id    INTEGER NOT NULL,
        dock_id       INTEGER,
        supervisor_id INTEGER,
        reason        TEXT NOT NULL,
        photo         TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',
        decided_by    INTEGER,
        decided_at    DATETIME,
        resolved_at   DATETIME,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
  } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_rejections_status ON rejections(status)`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_rejections_vehicle ON rejections(vehicle_id)`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','6')`).run()
}

// ── Migration to v7: gate_open_time on vehicles ──────────────────────────────
if (schemaVersion < 7) {
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN gate_open_time DATETIME`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','7')`).run()
}

// ── Migration to v8: gate pass + outbound closing seal ──────────────────────
// close_seal_photo → seal photo taken when OUTBOUND vehicle finishes loading
// gate_pass_no     → auto-generated unique code printed on the gate pass
// gate_pass_photo  → photo of signed/stamped gate pass captured at departure
if (schemaVersion < 8) {
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN close_seal_photo TEXT`) } catch {}
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN gate_pass_no TEXT`) } catch {}
  try { db.exec(`ALTER TABLE vehicles ADD COLUMN gate_pass_photo TEXT`) } catch {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_gate_pass_no ON vehicles(gate_pass_no) WHERE gate_pass_no IS NOT NULL`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key,value) VALUES ('version','8')`).run()
}

// ── Ensure tables exist (fresh install hits here) ────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    password_plain TEXT,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL,
    dock_id        INTEGER,
    active         INTEGER DEFAULT 1,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS docks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    dock_no          TEXT UNIQUE NOT NULL,
    supervisor_name  TEXT,
    supervisor_phone TEXT,
    status           TEXT DEFAULT 'green',
    active           INTEGER DEFAULT 1,
    type             TEXT DEFAULT 'inbound',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS vehicles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_no       TEXT NOT NULL,
    shipment_no      TEXT,
    driver_name      TEXT,
    driver_mobile    TEXT,
    arrival_photo    TEXT,
    arrival_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
    status           TEXT DEFAULT 'reported',
    purpose          TEXT DEFAULT 'inbound',
    assigned_dock_id INTEGER,
    assigned_time    DATETIME,
    seal_photo       TEXT,
    offload_photo    TEXT,
    offload_time     DATETIME,
    gate_open_time   DATETIME,
    departed_time    DATETIME,
    registered_by    INTEGER,
    prev_vehicle_nos TEXT,
    prev_shipment_no TEXT,
    close_seal_photo TEXT,
    gate_pass_no     TEXT,
    gate_pass_photo  TEXT
  );
  CREATE TABLE IF NOT EXISTS rejections (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id    INTEGER NOT NULL,
    dock_id       INTEGER,
    supervisor_id INTEGER,
    reason        TEXT NOT NULL,
    photo         TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    decided_by    INTEGER,
    decided_at    DATETIME,
    resolved_at   DATETIME,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS queue (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER UNIQUE,
    queued_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    dock_id    INTEGER,
    event_type TEXT NOT NULL,
    photo      TEXT,
    notes      TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

db.exec('PRAGMA foreign_keys = ON')

// ── Seed default admin ───────────────────────────────────────────────────────
const adminExists = db.prepare(`SELECT id FROM users WHERE username='admin'`).get()
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10)
  db.prepare(`INSERT INTO users (username,password_hash,password_plain,name,role) VALUES (?,?,?,?,?)`)
    .run('admin', hash, 'admin123', 'Administrator', 'admin')
  console.log('  Default admin → username: admin  password: admin123')
}

// ── Transaction helper ───────────────────────────────────────────────────────
// node:sqlite has no `.transaction()` like better-sqlite3, so polyfill one.
// Usage: const tx = db.transaction(() => { ...stmts... }); tx()
db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN')
    try {
      const r = fn(...args)
      db.exec('COMMIT')
      return r
    } catch (e) {
      try { db.exec('ROLLBACK') } catch {}
      throw e
    }
  }
}

module.exports = db
