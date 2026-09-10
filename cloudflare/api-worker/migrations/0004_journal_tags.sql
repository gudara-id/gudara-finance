-- =====================================================================
-- Tag untuk Jurnal Umum (menyusul fitur Mekari Jurnal)
-- =====================================================================
-- tags disimpan sebagai JSON array text, mis. '["Proyek A","Cabang B"]',
-- supaya satu jurnal bisa punya lebih dari satu tag seperti di Mekari.
-- =====================================================================

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS tags TEXT;

CREATE INDEX IF NOT EXISTS idx_journal_entries_tags ON journal_entries(tags);
