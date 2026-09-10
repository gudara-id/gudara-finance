-- Menambahkan role "sales" ke CHECK constraint kolom users.role
-- SQLite tidak bisa ALTER CHECK constraint secara langsung, jadi tabel
-- dibuat ulang dengan constraint baru, lalu data lama dipindahkan.

PRAGMA foreign_keys=OFF;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL CHECK (trim(full_name) <> ''),
  email TEXT NOT NULL UNIQUE CHECK (trim(email) <> ''),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'akuntan', 'manajemen', 'sales')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, full_name, email, password_hash, role, is_active, last_login_at, created_at, updated_at)
SELECT id, full_name, email, password_hash, role, is_active, last_login_at, created_at, updated_at FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));

PRAGMA foreign_keys=ON;
