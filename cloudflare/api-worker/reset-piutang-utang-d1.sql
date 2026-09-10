-- =====================================================================
-- RESET DATA PIUTANG & UTANG (gudara-finance-db, Cloudflare D1)
-- =====================================================================
-- Dihapus (dikosongkan):
--   - ar_invoice_payments   (pembayaran piutang)
--   - ar_invoices           (invoice piutang non-marketplace)
--   - ap_bill_payments      (pembayaran utang)
--   - ap_bills              (tagihan utang ke supplier)
--   - journal_entries + journal_lines YANG DIBUAT OTOMATIS oleh baris
--     di atas (setiap invoice/tagihan/pembayaran punya journal_entry_id
--     masing-masing) -- ini "jurnal terkait" yang dimaksud.
--
-- TIDAK dihapus:
--   - contacts (daftar pelanggan/supplier) -- supaya tidak perlu input
--     ulang kontak saat mulai mencatat piutang/utang baru. Kalau memang
--     mau bersih total termasuk kontak, hapus tanda komentar pada baris
--     "DELETE FROM contacts" di bagian paling bawah.
--   - Semua jurnal LAIN yang tidak terkait piutang/utang (jurnal umum,
--     saldo awal, dsb) -- sequence journal_entries juga TIDAK direset,
--     karena tabel itu dipakai bersama modul lain dan masih ada baris
--     yang tersisa.
--
-- CATATAN URUTAN:
-- ar_invoices/ap_bills dan payment-nya masih mereferensikan
-- journal_entries lewat journal_entry_id (FK tanpa ON DELETE CASCADE),
-- jadi ID jurnal terkait harus disimpan dulu ke tabel sementara SEBELUM
-- baris piutang/utangnya dihapus, baru jurnalnya dihapus belakangan.
-- journal_lines otomatis ikut terhapus lewat ON DELETE CASCADE ke
-- journal_entries.
-- =====================================================================

CREATE TEMP TABLE IF NOT EXISTS _piutang_utang_journal_ids AS
SELECT journal_entry_id FROM ar_invoices
UNION
SELECT journal_entry_id FROM ar_invoice_payments
UNION
SELECT journal_entry_id FROM ap_bills
UNION
SELECT journal_entry_id FROM ap_bill_payments;

DELETE FROM ar_invoice_payments;
DELETE FROM ar_invoices;
DELETE FROM ap_bill_payments;
DELETE FROM ap_bills;

DELETE FROM journal_entries WHERE id IN (SELECT journal_entry_id FROM _piutang_utang_journal_ids);

DROP TABLE _piutang_utang_journal_ids;

-- Reset counter AUTOINCREMENT piutang/utang supaya nomor invoice/tagihan
-- baru mulai bersih lagi. Sengaja TIDAK menyentuh sequence
-- journal_entries/journal_lines (dipakai bersama modul jurnal umum).
DELETE FROM sqlite_sequence
WHERE name IN ('ar_invoices', 'ar_invoice_payments', 'ap_bills', 'ap_bill_payments');

-- Opsional -- hapus tanda komentar kalau kontak (pelanggan/supplier)
-- juga ingin dihapus total:
-- DELETE FROM contacts;
-- DELETE FROM sqlite_sequence WHERE name = 'contacts';
