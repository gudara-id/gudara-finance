-- =====================================================================
-- Tabel Detail Aset Tetap (Fixed Assets Register)
-- =====================================================================
-- Menyimpan rincian per unit aset tetap: kode, nama, akun COA terkait,
-- tanggal & harga perolehan, umur manfaat, dan nilai residu.
-- Penyusutan & nilai buku dihitung on-the-fly di backend (metode garis
-- lurus / straight-line), bukan disimpan statis, supaya selalu akurat
-- per tanggal berapapun laporan diminta.
-- =====================================================================

CREATE TABLE IF NOT EXISTS fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE,
  asset_name TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  acquisition_date TEXT NOT NULL,
  acquisition_cost REAL NOT NULL DEFAULT 0,
  residual_value REAL NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL DEFAULT 36,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif', 'dijual', 'rusak')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT fixed_assets_code_not_empty CHECK (trim(asset_code) <> ''),
  CONSTRAINT fixed_assets_name_not_empty CHECK (trim(asset_name) <> ''),
  CONSTRAINT fixed_assets_cost_non_negative CHECK (acquisition_cost >= 0),
  CONSTRAINT fixed_assets_residual_non_negative CHECK (residual_value >= 0),
  CONSTRAINT fixed_assets_useful_life_positive CHECK (useful_life_months > 0)
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_account ON fixed_assets(account_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);
