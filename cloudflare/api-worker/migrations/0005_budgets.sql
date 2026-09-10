-- =====================================================================
-- Anggaran (Budget vs Actual) — menyusul fitur Mekari Jurnal
-- =====================================================================
-- Satu baris = target anggaran untuk satu akun (pendapatan/beban/HPP)
-- pada satu periode akuntansi (period_month, format 'YYYY-MM', merujuk ke
-- periode yang MULAI tanggal 2 bulan tsb — konsisten dengan aturan tutup
-- buku tanggal 1 yang sudah dipakai di seluruh laporan).
-- =====================================================================

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  period_month TEXT NOT NULL CHECK (period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_month);
