-- =====================================================================
-- RESET DATA JURNAL + PIUTANG/UTANG — Gudara Finance
-- =====================================================================
-- Menghapus SEMUA transaksi jurnal (jurnal umum, marketplace, dan yang
-- otomatis dibuat dari Piutang & Utang) beserta invoice/tagihan dan
-- riwayat pembayarannya.
--
-- TETAP DIPERTAHANKAN (tidak ikut dihapus):
--   - users (login tidak berubah)
--   - chart_of_accounts (daftar akun)
--   - contacts (daftar pelanggan/supplier)
--   - fixed_assets (daftar aset tetap)
--   - budgets (anggaran)
--   - journal_templates / journal_template_lines (template jurnal berulang
--     itu sendiri TIDAK dihapus, hanya riwayat generate-nya di
--     journal_template_runs yang dikosongkan karena jurnal hasil generate-nya
--     ikut terhapus)
--   - book_closings (kalau migration 0009 sudah dijalankan)
--
-- !!! WAJIB BACKUP DULU SEBELUM MENJALANKAN INI !!!
--   npx wrangler d1 export gudara-finance-db --remote --output=backup-sebelum-reset-$(date +%Y%m%d).sql
--
-- CARA JALANKAN (dari folder cloudflare/api-worker):
--   npx wrangler d1 execute gudara-finance-db --remote --file=./reset-jurnal-piutang-utang.sql
-- =====================================================================

-- 0) Kosongkan riwayat generate template jurnal (merujuk journal_entries
--    yang akan dihapus di langkah berikutnya; tidak menghapus template-nya
--    sendiri, cuma catatan "sudah pernah digenerate periode mana saja").
DELETE FROM journal_template_runs;

-- 1) Hapus riwayat pembayaran invoice/tagihan dulu (merujuk ar_invoices/ap_bills)
DELETE FROM ar_invoice_payments;
DELETE FROM ap_bill_payments;

-- 2) Baru invoice (piutang) dan tagihan (utang) boleh dihapus
DELETE FROM ar_invoices;
DELETE FROM ap_bills;

-- 3) Hapus semua baris jurnal, lalu semua header jurnal — termasuk jurnal
--    umum manual, marketplace, dan yang tadinya otomatis dari piutang/utang
DELETE FROM journal_lines;
DELETE FROM journal_entries;

-- Setelah ini: chart_of_accounts, contacts, fixed_assets, budgets, dan
-- users (login) TIDAK berubah sama sekali. Sqlite AUTOINCREMENT counter
-- untuk journal_entries.id / reference_no otomatis mulai dari nomor kecil
-- lagi berkat generateReferenceNo() yang membaca ulang dari data yang ada
-- (kosong), jadi tidak perlu direset manual.
