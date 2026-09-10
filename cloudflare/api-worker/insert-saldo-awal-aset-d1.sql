-- =====================================================================
-- Input Saldo Awal Aset Gudara (Cloudflare D1 / SQLite)
-- =====================================================================
-- Mencatat aset tetap & tak berwujud dari Aset_GUDARA.xlsx sebagai
-- jurnal saldo awal (opening balance), TIDAK termasuk:
--   - Piutang Usaha (AL-002) -> sifatnya fluktuatif
--   - Kas & Saldo Bank (AL-001) -> sudah tercatat via transaksi jurnal lain
--
-- Catatan: 2 item bernilai Rp 0 juga tidak diikutkan sebagai baris
-- jurnal (constraint database mewajibkan debit atau kredit > 0), tapi
-- nilainya memang Rp 0 sehingga tidak memengaruhi total:
--   - PRL-002 Rak Kayu (6 Unit)
--   - ATB-001 Akun Marketplace Shopee dan Tiktok
--
-- Akun baru yang ditambahkan ke Chart of Accounts (di bawah 1100 - Aset Tetap):
--   1140 - Peralatan Komputer & IT              (subtotal Rp 22.199.000)
--   1150 - Rak & Peralatan Gudang                (subtotal Rp  3.374.051)
--   1160 - Peralatan Pendukung (Studio & Promosi) (subtotal Rp    855.268)
--   1170 - Aset Tak Berwujud                      (subtotal Rp    500.000)
--   TOTAL DEBIT = TOTAL KREDIT = Rp 26.928.319
--
-- Akun lawan (kredit): 3010 - Modal Pemilik (akun yang sudah ada)
-- Tanggal jurnal: 12 Agustus 2026 (sesuai tanggal beli di file)
-- Referensi (reference_no) sengaja dikosongkan di sini -> jalankan
-- skrip backfill-reference-no-d1.sql setelahnya supaya nomor JV-2026-XXXX
-- terisi otomatis dan konsisten dengan entri lain.
--
-- Skrip ini AMAN dijalankan berulang untuk bagian akun & header jurnal
-- (tidak akan terduplikasi). Namun baris detail jurnal (journal_lines)
-- HANYA akan berhasil sekali; jika dijalankan ulang setelah header sudah
-- ada, insert baris akan gagal karena constraint UNIQUE(line_no) --
-- ini kegagalan yang aman (bukan duplikasi data), tapi sebaiknya
-- jalankan skrip ini hanya SATU KALI.
--
-- Cara menjalankan (dari folder cloudflare/api-worker):
--   npx wrangler d1 execute gudara-finance-db --remote --file=insert-saldo-awal-aset-d1.sql
-- =====================================================================

-- 1) Tambah akun baru ke Chart of Accounts (aman dijalankan ulang)
INSERT INTO chart_of_accounts (account_code, account_name, account_type, normal_balance, parent_account_id, is_active)
VALUES
  ('1140', 'Peralatan Komputer & IT', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1),
  ('1150', 'Rak & Peralatan Gudang', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1),
  ('1160', 'Peralatan Pendukung (Studio & Promosi)', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1),
  ('1170', 'Aset Tak Berwujud', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1)
ON CONFLICT(account_code) DO UPDATE SET
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  parent_account_id = excluded.parent_account_id,
  is_active = 1,
  updated_at = datetime('now');

-- 2) Buat header jurnal (hanya jika belum ada, aman dijalankan ulang)
INSERT INTO journal_entries (entry_date, description, status, posted_at, created_by, posted_by)
SELECT '2026-08-12', 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)', 'posted', datetime('now'), NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries
  WHERE entry_date = '2026-08-12'
    AND description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)'
);

-- 3) Baris detail jurnal (23 aset didebit ke akun masing-masing, 1 baris kredit ke Modal Pemilik)
INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 1, 'IT-001 - Laptop Advan Workmate (1 Unit)', 5000000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 2, 'IT-002 - PC Admin Gudara', 1500000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 3, 'IT-003 - PC Editor (1 Unit)', 3500000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 4, 'IT-004 - HP Iphone 11 (1 Unit)', 2700000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 5, 'IT-005 - HP Iphone 13 (1 Unit)', 4600000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 6, 'IT-006 - Printer Thermal Resi 1 Unit', 1500000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 7, 'IT-007 - Monitor LG 27 Inch', 2249000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1140'), 8, 'IT-008 - Monitor LG 21 Inch', 1150000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 9, 'PRL-001 - Rak Besi (6 Unit)', 2514000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 10, 'PRL-003 - Keranjang Pajero (7 Unit)', 91133.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 11, 'PRL-004 - Gawang Baju Lebar 100cm (2 Unit)', 402250.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 12, 'PRL-005 - Gawang Baju + Ram Tinggi 140cm (1 Unit)', 210000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 13, 'PRL-006 - Hanger Jepit (6 Unit)', 27918.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 14, 'PRL-007 - Gantungan Baju Plastik (6 Unit)', 26250.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1150'), 15, 'PRL-008 - Storage Plastik (1 Unit)', 102500.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 16, 'PP-001 - Tripod Taff Studio', 68108.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 17, 'PP-002 - Tripod No Merek (2 Unit)', 100000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 18, 'PP-003 - Paket Softbox 4 Socket', 223230.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 19, 'PP-004 - Paket Softbox Lightstand', 198000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 20, 'PP-005 - Holder Overhead Stand Tripod Hp Ringlight', 125930.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 21, 'PP-006 - Ringlight Holder Hp Live', 40000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1160'), 22, 'PP-007 - Microphone Belcore', 100000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '1170'), 23, 'ATB-002 - Merek Dagang & Legalitas', 500000.00, 0
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
SELECT je.id, (SELECT id FROM chart_of_accounts WHERE account_code = '3010'), 24, 'Saldo Awal Aset Gudara (Komputer & IT, Rak & Peralatan Gudang, Peralatan Pendukung, Aset Tak Berwujud)', 0, 26928319.00
FROM journal_entries je
WHERE je.entry_date = '2026-08-12' AND je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)';

-- (Opsional) Verifikasi setelah dijalankan:
-- SELECT je.entry_date, je.reference_no, je.description, jl.line_no, coa.account_code, coa.account_name, jl.memo, jl.debit, jl.credit
-- FROM journal_lines jl
-- JOIN journal_entries je ON je.id = jl.journal_entry_id
-- JOIN chart_of_accounts coa ON coa.id = jl.account_id
-- WHERE je.description = 'Input Saldo Awal Aset Gudara per 12 Agustus 2026 (tidak termasuk Kas/Bank & Piutang, sifatnya fluktuatif)'
-- ORDER BY jl.line_no;
