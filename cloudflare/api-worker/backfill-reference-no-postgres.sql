-- =====================================================================
-- Backfill reference_no untuk jurnal lama (PostgreSQL / backend Node.js)
-- =====================================================================
-- Hanya perlu dijalankan jika Anda juga memakai backend Node.js/Express
-- dengan PostgreSQL (folder src/), bukan Cloudflare Worker/D1.
--
-- Mengisi reference_no yang masih kosong dengan format
-- JV-{tahun}-{urutan 4 digit}, berurutan berdasarkan entry_date lalu id,
-- dan melanjutkan dari nomor tertinggi yang sudah dipakai di tahun itu.
-- Referensi dengan format lain (bukan JV-YYYY-NNNN) tidak disentuh
-- maupun dijadikan patokan.
--
-- Cara menjalankan:
--   psql "$DATABASE_URL" -f backfill-reference-no-postgres.sql
-- =====================================================================

BEGIN;

-- (Opsional) Cek dulu berapa banyak entri yang akan terdampak:
-- SELECT COUNT(*) AS akan_diisi FROM journal_entries
-- WHERE reference_no IS NULL OR trim(reference_no) = '';

WITH existing_max AS (
  SELECT
    (regexp_match(reference_no, '^JV-(\d{4})-(\d+)$'))[1]::int AS yr,
    MAX((regexp_match(reference_no, '^JV-(\d{4})-(\d+)$'))[2]::int) AS max_seq
  FROM journal_entries
  WHERE reference_no ~ '^JV-\d{4}-\d+$'
  GROUP BY yr
),
to_fill AS (
  SELECT
    id,
    EXTRACT(YEAR FROM entry_date)::int AS yr,
    ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM entry_date) ORDER BY entry_date ASC, id ASC) AS rn
  FROM journal_entries
  WHERE reference_no IS NULL OR trim(reference_no) = ''
)
UPDATE journal_entries je
SET reference_no = 'JV-' || tf.yr || '-' || lpad((COALESCE(em.max_seq, 0) + tf.rn)::text, 4, '0')
FROM to_fill tf
LEFT JOIN existing_max em ON em.yr = tf.yr
WHERE je.id = tf.id;

COMMIT;

-- (Opsional) Verifikasi setelah dijalankan:
-- SELECT id, entry_date, reference_no, description
-- FROM journal_entries
-- ORDER BY entry_date, id
-- LIMIT 20;
