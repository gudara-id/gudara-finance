-- =====================================================================
-- Reset data Piutang & Utang Umum (percobaan) — Gudara Finance
-- (v3 — D1 menolak CREATE TEMPORARY TABLE dengan SQLITE_AUTH, jadi pakai
--  tabel biasa untuk menyimpan id jurnal sementara, lalu di-DROP di akhir)
-- =====================================================================
-- Jalankan dengan:
--   npx wrangler d1 execute gudara-finance-db --remote --file=./reset_piutang_utang.sql
-- =====================================================================

-- 0) Simpan dulu id jurnal yang mau dihapus, sebelum baris yang
--    merujuknya (ar_invoices/ap_bills/*_payments) ikut terhapus.
--    (Tabel biasa, bukan TEMPORARY — D1 tidak mengizinkan temp table.)
CREATE TABLE _ar_ap_journal_ids AS
SELECT journal_entry_id AS id FROM ar_invoices
UNION
SELECT journal_entry_id FROM ar_invoice_payments
UNION
SELECT journal_entry_id FROM ap_bills
UNION
SELECT journal_entry_id FROM ap_bill_payments;

-- 1) Hapus riwayat pembayaran dulu (merujuk ke ar_invoices/ap_bills)
DELETE FROM ar_invoice_payments;
DELETE FROM ap_bill_payments;

-- 2) Baru invoice (piutang) dan tagihan (utang) boleh dihapus
DELETE FROM ar_invoices;
DELETE FROM ap_bills;

-- 3) Sekarang aman hapus baris jurnal (debit/kredit) miliknya
DELETE FROM journal_lines
WHERE journal_entry_id IN (SELECT id FROM _ar_ap_journal_ids);

-- 4) Terakhir, hapus header jurnalnya
DELETE FROM journal_entries
WHERE id IN (SELECT id FROM _ar_ap_journal_ids);

-- 5) Bersihkan tabel bantu (ini bukan bagian dari skema aplikasi)
DROP TABLE _ar_ap_journal_ids;

-- Opsional: kosongkan juga daftar kontak (pelanggan/supplier) percobaan.
-- Uncomment kalau memang kontaknya juga cuma percobaan:
-- DELETE FROM contacts;
