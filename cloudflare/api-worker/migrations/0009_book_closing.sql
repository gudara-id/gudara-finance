-- =====================================================================
-- Tutup Buku (Book Closing)
-- =====================================================================
-- Satu baris = satu bulan kalender ('YYYY-MM') yang sudah "ditutup"
-- oleh admin lewat tombol Tutup Buku. Begitu tercatat di sini, SEMUA
-- transaksi (jurnal umum, invoice/tagihan piutang-utang, pembayarannya)
-- dengan tanggal di bulan itu atau lebih lama tidak bisa lagi
-- dibuat/diubah/dihapus/dibatalkan — lihat assertPeriodOpen() di
-- src/index.js, dipanggil di semua endpoint yang menyentuh tanggal
-- transaksi.
--
-- Tutup buku harus berurutan (tidak boleh loncat bulan / ada gap), dan
-- hanya periode yang PALING BARU ditutup yang boleh dibuka kembali
-- (DELETE /api/book-closing/:period_month) kalau ternyata ditutup keliru.
-- =====================================================================

CREATE TABLE IF NOT EXISTS book_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_month TEXT NOT NULL UNIQUE CHECK (period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  closed_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by INTEGER REFERENCES users(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_book_closings_period ON book_closings(period_month);
