-- =====================================================================
-- Backfill Detail Aset Tetap dari Saldo Awal (insert-saldo-awal-aset-d1.sql)
-- =====================================================================
-- Mengisi tabel `fixed_assets` (dibuat di migration 0002_fixed_assets.sql)
-- dengan 23 unit aset yang sebelumnya sudah dicatat sebagai baris jurnal
-- saldo awal. Ini TIDAK membuat jurnal baru -- saldo di buku besar tidak
-- berubah -- ini hanya menambahkan rincian per unit supaya bisa
-- ditampilkan di halaman "Daftar Aset".
--
-- CATATAN ASUMSI (silakan disesuaikan lewat halaman Daftar Aset nanti):
--   - Tanggal perolehan memakai tanggal jurnal saldo awal (12 Agu 2026)
--     karena tanggal beli asli per item tidak tercatat terpisah.
--   - Umur manfaat memakai 48 bulan (4 tahun) untuk aset fisik, mengikuti
--     kelompok 1 penyusutan fiskal yang umum dipakai UMKM di Indonesia.
--   - Aset tak berwujud (merek dagang/legalitas) memakai 60 bulan.
--   - Nilai residu diasumsikan Rp 0.
--   - 2 item bernilai Rp 0 (Rak Kayu, Akun Marketplace) tetap dimasukkan
--     di sini (tidak seperti di jurnal) supaya tercatat sebagai unit aset,
--     dengan acquisition_cost = 0.
--
-- Cara menjalankan (dari folder cloudflare/api-worker):
--   npx wrangler d1 execute gudara-finance-db --remote --file=backfill-fixed-assets-d1.sql
--
-- Aman dijalankan ulang: memakai INSERT ... ON CONFLICT(asset_code) DO NOTHING.
-- =====================================================================

INSERT INTO fixed_assets (asset_code, asset_name, account_id, quantity, acquisition_date, acquisition_cost, residual_value, useful_life_months, status)
VALUES
  ('IT-001', 'Laptop Advan Workmate', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 5000000.00, 0, 48, 'aktif'),
  ('IT-002', 'PC Admin Gudara', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 1500000.00, 0, 48, 'aktif'),
  ('IT-003', 'PC Editor', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 3500000.00, 0, 48, 'aktif'),
  ('IT-004', 'HP Iphone 11', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 2700000.00, 0, 48, 'aktif'),
  ('IT-005', 'HP Iphone 13', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 4600000.00, 0, 48, 'aktif'),
  ('IT-006', 'Printer Thermal Resi', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 1500000.00, 0, 48, 'aktif'),
  ('IT-007', 'Monitor LG 27 Inch', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 2249000.00, 0, 48, 'aktif'),
  ('IT-008', 'Monitor LG 21 Inch', (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, '2026-08-12', 1150000.00, 0, 48, 'aktif'),

  ('PRL-001', 'Rak Besi', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 6, '2026-08-12', 2514000.00, 0, 48, 'aktif'),
  ('PRL-002', 'Rak Kayu', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 6, '2026-08-12', 0.00, 0, 48, 'aktif'),
  ('PRL-003', 'Keranjang Pajero', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 7, '2026-08-12', 91133.00, 0, 48, 'aktif'),
  ('PRL-004', 'Gawang Baju Lebar 100cm', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 2, '2026-08-12', 402250.00, 0, 48, 'aktif'),
  ('PRL-005', 'Gawang Baju + Ram Tinggi 140cm', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 1, '2026-08-12', 210000.00, 0, 48, 'aktif'),
  ('PRL-006', 'Hanger Jepit', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 6, '2026-08-12', 27918.00, 0, 48, 'aktif'),
  ('PRL-007', 'Gantungan Baju Plastik', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 6, '2026-08-12', 26250.00, 0, 48, 'aktif'),
  ('PRL-008', 'Storage Plastik', (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 1, '2026-08-12', 102500.00, 0, 48, 'aktif'),

  ('PP-001', 'Tripod Taff Studio', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 1, '2026-08-12', 68108.00, 0, 48, 'aktif'),
  ('PP-002', 'Tripod No Merek', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 2, '2026-08-12', 100000.00, 0, 48, 'aktif'),
  ('PP-003', 'Paket Softbox 4 Socket', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 1, '2026-08-12', 223230.00, 0, 48, 'aktif'),
  ('PP-004', 'Paket Softbox Lightstand', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 1, '2026-08-12', 198000.00, 0, 48, 'aktif'),
  ('PP-005', 'Holder Overhead Stand Tripod Hp Ringlight', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 1, '2026-08-12', 125930.00, 0, 48, 'aktif'),
  ('PP-006', 'Ringlight Holder Hp Live', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 1, '2026-08-12', 40000.00, 0, 48, 'aktif'),
  ('PP-007', 'Microphone Belcore', (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 1, '2026-08-12', 100000.00, 0, 48, 'aktif'),

  ('ATB-001', 'Akun Marketplace Shopee dan Tiktok', (SELECT id FROM chart_of_accounts WHERE account_code = '1170'), 1, '2026-08-12', 0.00, 0, 60, 'aktif'),
  ('ATB-002', 'Merek Dagang & Legalitas', (SELECT id FROM chart_of_accounts WHERE account_code = '1170'), 1, '2026-08-12', 500000.00, 0, 60, 'aktif')
ON CONFLICT(asset_code) DO NOTHING;
