-- =====================================================================
-- RESET DATA TRANSAKSI JURNAL (gudara-finance-db, Cloudflare D1)
-- =====================================================================
-- Dipertahankan (TIDAK dihapus):
--   - fixed_assets        (data aset tetap)
--   - chart_of_accounts   (COA)
--   - users               (data login)
--
-- Direset (dikosongkan):
--   - journal_lines
--   - journal_entries
--
-- CATATAN:
-- journal_lines punya FK ON DELETE CASCADE ke journal_entries, jadi
-- menghapus journal_entries otomatis menghapus journal_lines terkait.
-- Script ini tetap menghapus journal_lines lebih dulu secara eksplisit
-- supaya urutannya jelas dan aman walau constraint berubah di kemudian hari.
-- =====================================================================

DELETE FROM journal_lines;
DELETE FROM journal_entries;

-- Reset counter AUTOINCREMENT supaya ID jurnal mulai dari 1 lagi.
-- Hapus baris ini kalau tidak ingin ID direset (biar ID lama tidak
-- pernah dipakai ulang, misal karena sudah tercetak di dokumen fisik).
DELETE FROM sqlite_sequence WHERE name IN ('journal_entries', 'journal_lines');
