-- =====================================================================
-- RESET DATA TRANSAKSI JURNAL — v2 (gudara-finance-db, Cloudflare D1)
-- =====================================================================
-- Versi ini menghapus JUGA data Piutang & Utang (ar_invoices, ap_bills,
-- dkk) karena tabel-tabel itu punya FK ke journal_entries tanpa
-- ON DELETE CASCADE -- reset-journal-data.sql yang lama akan gagal
-- dengan "FOREIGN KEY constraint failed" kalau ada data di tabel ini.
--
-- Dipertahankan (TIDAK dihapus):
--   - fixed_assets        (data aset tetap)
--   - chart_of_accounts   (COA)
--   - users               (data login)
--   - journal_templates / journal_template_lines (template-nya sendiri,
--     cuma histori "sudah generate periode mana" yang dihapus)
--
-- Direset (dikosongkan), urutan sesuai dependency FK -- child dulu baru parent:
--   - ar_invoice_payments  (FK -> ar_invoices, journal_entries)
--   - ar_invoices          (FK -> contacts, journal_entries)
--   - ap_bill_payments     (FK -> ap_bills, journal_entries)
--   - ap_bills             (FK -> contacts, journal_entries)
--   - contacts             (referensi customer/supplier piutang-utang)
--   - journal_template_runs (FK -> journal_templates, journal_entries)
--   - journal_lines        (FK -> journal_entries, sebenarnya ON DELETE
--                            CASCADE, tapi tetap dihapus eksplisit)
--   - journal_entries
-- =====================================================================

DELETE FROM ar_invoice_payments;
DELETE FROM ar_invoices;
DELETE FROM ap_bill_payments;
DELETE FROM ap_bills;
DELETE FROM contacts;
DELETE FROM journal_template_runs;
DELETE FROM journal_lines;
DELETE FROM journal_entries;

-- Reset counter AUTOINCREMENT supaya ID mulai dari 1 lagi.
-- Hapus baris ini kalau tidak ingin ID direset.
DELETE FROM sqlite_sequence WHERE name IN (
  'journal_entries',
  'journal_lines',
  'ar_invoices',
  'ar_invoice_payments',
  'ap_bills',
  'ap_bill_payments',
  'contacts',
  'journal_template_runs'
);
