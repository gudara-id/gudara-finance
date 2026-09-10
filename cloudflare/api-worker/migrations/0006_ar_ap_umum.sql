-- =====================================================================
-- Piutang & Utang Umum (di luar marketplace) — menyusul fitur Mekari Jurnal
-- =====================================================================
-- Piutang non-marketplace (wholesale/reseller) dan utang ke supplier
-- bahan baku, dengan tanggal jatuh tempo supaya bisa dibuat laporan umur
-- piutang/utang (aging report). Akun kontrolnya tetap akun COA yang
-- sudah ada: 1030 Piutang Usaha (debit saat invoice dibuat) dan
-- 2010 Utang Usaha (credit saat tagihan dibuat) — contacts/ar_invoices/
-- ap_bills di sini adalah buku pembantu (subsidiary ledger) per
-- pelanggan/supplier, bukan akun COA baru.
--
-- Setiap invoice/tagihan otomatis membuat SATU jurnal (journal_entry_id),
-- begitu juga setiap pembayaran/pelunasan. status pada ar_invoices/
-- ap_bills hanya menandai 'open' atau 'void'; lunas/sebagian dihitung
-- on-the-fly dari total pembayarannya (amount - SUM(payments.amount)),
-- supaya tidak ada dua sumber kebenaran yang bisa saling tidak sinkron.
-- =====================================================================

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('customer', 'supplier')),
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type, is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

CREATE TABLE IF NOT EXISTS ar_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE CHECK (trim(invoice_no) <> ''),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  description TEXT NOT NULL CHECK (trim(description) <> ''),
  amount REAL NOT NULL CHECK (amount > 0),
  revenue_account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'void')),
  voided_at TEXT,
  voided_by INTEGER,
  void_reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (due_date >= invoice_date)
);

CREATE INDEX IF NOT EXISTS idx_ar_invoices_contact ON ar_invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_status_due ON ar_invoices(status, due_date);

CREATE TABLE IF NOT EXISTS ar_invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES ar_invoices(id),
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ar_invoice_payments_invoice ON ar_invoice_payments(invoice_id);

CREATE TABLE IF NOT EXISTS ap_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT NOT NULL UNIQUE CHECK (trim(bill_no) <> ''),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  bill_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  description TEXT NOT NULL CHECK (trim(description) <> ''),
  amount REAL NOT NULL CHECK (amount > 0),
  expense_account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'void')),
  voided_at TEXT,
  voided_by INTEGER,
  void_reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (due_date >= bill_date)
);

CREATE INDEX IF NOT EXISTS idx_ap_bills_contact ON ap_bills(contact_id);
CREATE INDEX IF NOT EXISTS idx_ap_bills_status_due ON ap_bills(status, due_date);

CREATE TABLE IF NOT EXISTS ap_bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES ap_bills(id),
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ap_bill_payments_bill ON ap_bill_payments(bill_id);
