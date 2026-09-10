-- =====================================================================
-- Backfill reference_no untuk jurnal lama (Cloudflare D1 / SQLite)
-- Format baru: JV-YYYYMM-NNN (mis. JV-202608-001)
-- =====================================================================
-- Mengisi reference_no yang masih kosong dengan format baru yang lebih
-- mudah diingat: bulan transaksi langsung terlihat dari nomornya, dan
-- nomor urut kembali ke 001 setiap awal bulan (tidak terus membesar
-- seperti nomor urut tahunan lama, JV-YYYY-NNNN).
--
-- Aman dijalankan meski sebagian entri sudah pernah dibackfill dengan
-- format lama (JV-YYYY-NNNN) atau IMPORT-XXXX — hanya baris dengan
-- reference_no kosong/NULL yang disentuh, dan nomor urut per bulan
-- akan melanjutkan dari nomor tertinggi berformat baru yang sudah ada
-- di bulan itu (biar tidak bentrok dengan jurnal yang sudah dibuat
-- lewat aplikasi setelah fitur auto-reference aktif).
--
-- Cara menjalankan (dari folder cloudflare/api-worker):
--   npx wrangler d1 execute gudara-finance-db --remote --file=backfill-reference-no-v2-d1.sql
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
      substr(reference_no, 4, 6) AS yyyymm,
      MAX(CAST(substr(reference_no, 11) AS INTEGER)) AS max_seq
    FROM journal_entries
    WHERE reference_no LIKE 'JV-______-___'
    GROUP BY yyyymm
  ),
  to_fill AS (
    SELECT
      id,
      strftime('%Y%m', entry_date) AS yyyymm,
      ROW_NUMBER() OVER (PARTITION BY strftime('%Y%m', entry_date) ORDER BY entry_date ASC, id ASC) AS rn
    FROM journal_entries
    WHERE reference_no IS NULL OR trim(reference_no) = ''
  )
  SELECT
    to_fill.id AS id,
    'JV-' || to_fill.yyyymm || '-' || substr('000' || (COALESCE(existing_max.max_seq, 0) + to_fill.rn), -3, 3) AS new_reference_no
  FROM to_fill
  LEFT JOIN existing_max ON existing_max.yyyymm = to_fill.yyyymm
) AS t
WHERE journal_entries.id = t.id
  AND (journal_entries.reference_no IS NULL OR trim(journal_entries.reference_no) = '');

-- (Opsional) Verifikasi setelah dijalankan:
-- SELECT id, entry_date, reference_no, description
-- FROM journal_entries
-- ORDER BY entry_date, id
-- LIMIT 20;
