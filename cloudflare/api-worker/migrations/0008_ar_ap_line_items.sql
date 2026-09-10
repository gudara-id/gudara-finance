-- =====================================================================
-- Rincian item (line items) + diskon + pajak untuk invoice/tagihan
-- =====================================================================
-- Sebelumnya ar_invoices/ap_bills hanya punya satu `description` + satu
-- `amount` per dokumen. Supaya form invoice bisa menampilkan rincian
-- produk per baris (No, Deskripsi, Qty, Harga Satuan, Total) seperti
-- dokumen invoice formal, kita tambahkan:
--   - items: JSON array [{ description, qty, unit_price }, ...],
--     NULL untuk dokumen lama yang masih pakai satu baris deskripsi.
--   - subtotal_amount: jumlah semua (qty * unit_price) sebelum diskon/pajak.
--   - discount_amount / tax_amount: nominal, default 0.
-- Kolom `amount` TETAP jadi satu-satunya nilai yang dipakai untuk jurnal
-- akuntansi dan perhitungan saldo/pelunasan (subtotal - diskon + pajak),
-- supaya semua logika piutang/utang yang sudah ada tidak perlu berubah.
-- =====================================================================

ALTER TABLE ar_invoices ADD COLUMN items TEXT;
ALTER TABLE ar_invoices ADD COLUMN subtotal_amount REAL;
ALTER TABLE ar_invoices ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE ar_invoices ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE ap_bills ADD COLUMN items TEXT;
ALTER TABLE ap_bills ADD COLUMN subtotal_amount REAL;
ALTER TABLE ap_bills ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE ap_bills ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;
