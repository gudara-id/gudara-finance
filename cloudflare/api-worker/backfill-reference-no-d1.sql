-- =====================================================================
-- Backfill reference_no untuk jurnal lama (Cloudflare D1 / SQLite)
-- =====================================================================
-- Mengisi reference_no yang masih kosong ("-") dengan format
-- JV-{tahun}-{urutan 4 digit}, berurutan berdasarkan entry_date lalu id,
-- dan melanjutkan dari nomor tertinggi yang sudah dipakai di tahun itu
-- (baik hasil generate otomatis maupun yang diisi manual dengan format
-- yang sama). Referensi yang formatnya bukan JV-YYYY-NNNN (mis. nomor
-- custom) tidak akan disentuh maupun dijadikan patokan.
--
-- Cara menjalankan (dari folder cloudflare/api-worker):
--   npx wrangler d1 execute gudara-finance-db --remote --file=backfill-reference-no-d1.sql
--
-- Jalankan dulu tanpa --remote (mode lokal) kalau ingin uji coba di
-- database D1 lokal sebelum menyentuh data production.
-- =====================================================================

-- (Opsional) Cek dulu berapa banyak entri yang akan terdampak:
-- SELECT COUNT(*) AS akan_diisi FROM journal_entries
-- WHERE reference_no IS NULL OR trim(reference_no) = '';

UPDATE journal_entries
SET reference_no = t.new_reference_no
FROM (
  WITH existing_max AS (
    SELECT
      CAST(substr(reference_no, 4, 4) AS INTEGER) AS yr,
      MAX(CAST(substr(reference_no, 9) AS INTEGER)) AS max_seq
    FROM journal_entries
    WHERE reference_no LIKE 'JV-____-____'
    GROUP BY yr
  ),
  to_fill AS (
    SELECT
      id,
      CAST(strftime('%Y', entry_date) AS INTEGER) AS yr,
      ROW_NUMBER() OVER (PARTITION BY strftime('%Y', entry_date) ORDER BY entry_date ASC, id ASC) AS rn
    FROM journal_entries
    WHERE reference_no IS NULL OR trim(reference_no) = ''
  )
  SELECT
    to_fill.id AS id,
    'JV-' || to_fill.yr || '-' || substr('0000' || (COALESCE(existing_max.max_seq, 0) + to_fill.rn), -4, 4) AS new_reference_no
  FROM to_fill
  LEFT JOIN existing_max ON existing_max.yr = to_fill.yr
) AS t
WHERE journal_entries.id = t.id
  AND (journal_entries.reference_no IS NULL OR trim(journal_entries.reference_no) = '');

-- (Opsional) Verifikasi setelah dijalankan:
-- SELECT id, entry_date, reference_no, description
-- FROM journal_entries
-- ORDER BY entry_date, id
-- LIMIT 20;
