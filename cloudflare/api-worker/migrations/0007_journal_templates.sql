-- =====================================================================
-- Template Jurnal Berulang (Recurring) — menyusul fitur Mekari Jurnal
-- =====================================================================
-- Simpan pola jurnal yang berulang tiap bulan (sewa, gaji, langganan
-- software, dll) berikut akun & nominal defaultnya. Satu klik generate
-- jurnal baru dari template untuk periode akuntansi tertentu.
--
-- journal_template_runs mencatat periode mana saja yang sudah pernah
-- di-generate untuk tiap template (UNIQUE per template+periode), supaya:
--   1. tidak bisa generate dobel untuk periode yang sama,
--   2. bisa dihitung template mana yang BELUM digenerate bulan ini
--      untuk ditampilkan sebagai reminder.
-- Menghapus template tidak menghapus jurnal yang sudah pernah
-- di-generate — jurnal itu tetap berdiri sendiri seperti jurnal manual.
-- =====================================================================

CREATE TABLE IF NOT EXISTS journal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  description TEXT,
  tags TEXT, -- JSON array text, format sama dengan journal_entries.tags
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journal_templates_active ON journal_templates(is_active);

CREATE TABLE IF NOT EXISTS journal_template_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES journal_templates(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  memo TEXT,
  debit REAL NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_template_lines_template ON journal_template_lines(template_id);

CREATE TABLE IF NOT EXISTS journal_template_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES journal_templates(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL CHECK (period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  generated_by INTEGER,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (template_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_journal_template_runs_period ON journal_template_runs(period_month);
