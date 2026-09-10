-- =====================================================================
-- Kolom audit untuk pembatalan (void) jurnal
-- =====================================================================
-- journal_entries.status sudah mendukung nilai 'void' sejak migrasi awal,
-- tapi belum ada jalan untuk mengubah status ke situ maupun mencatat
-- siapa/kapan/kenapa jurnal dibatalkan. Kolom di bawah dipakai oleh
-- endpoint POST /api/journals/:id/void (menu Jurnal > Batalkan).
-- =====================================================================

ALTER TABLE journal_entries ADD COLUMN voided_at TEXT;
ALTER TABLE journal_entries ADD COLUMN voided_by INTEGER;
ALTER TABLE journal_entries ADD COLUMN void_reason TEXT;
