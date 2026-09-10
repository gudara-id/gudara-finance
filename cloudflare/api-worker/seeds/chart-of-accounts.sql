INSERT INTO chart_of_accounts (account_code, account_name, account_type, normal_balance, parent_account_id, is_active)
VALUES
  ('1000', 'Aset Lancar', 'asset', 'debit', NULL, 1),
  ('1010', 'Kas', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1000'), 1),
  ('1020', 'Bank', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1000'), 1),
  ('1030', 'Piutang Usaha', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1000'), 1),
  ('1040', 'Persediaan Barang Dagang', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1000'), 1),
  ('1050', 'Uang Muka Pembelian', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1000'), 1),
  ('1060', 'Pajak Dibayar Dimuka', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1000'), 1),
  ('1100', 'Aset Tetap', 'asset', 'debit', NULL, 1),
  ('1110', 'Peralatan Toko', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1),
  ('1120', 'Kendaraan Operasional', 'asset', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1),
  ('1130', 'Akumulasi Penyusutan', 'asset', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 1),
  ('2000', 'Liabilitas Lancar', 'liability', 'credit', NULL, 1),
  ('2010', 'Utang Usaha', 'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '2000'), 1),
  ('2020', 'Utang Pajak', 'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '2000'), 1),
  ('2030', 'Utang Gaji', 'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '2000'), 1),
  ('2040', 'Pendapatan Diterima Dimuka', 'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '2000'), 1),
  ('2100', 'Liabilitas Jangka Panjang', 'liability', 'credit', NULL, 1),
  ('2110', 'Utang Bank Jangka Panjang', 'liability', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '2100'), 1),
  ('3000', 'Ekuitas', 'equity', 'credit', NULL, 1),
  ('3010', 'Modal Pemilik', 'equity', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '3000'), 1),
  ('3020', 'Laba Ditahan', 'equity', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '3000'), 1),
  ('3030', 'Prive / Dividen', 'equity', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '3000'), 1),
  ('4000', 'Pendapatan', 'revenue', 'credit', NULL, 1),
  ('4010', 'Penjualan Barang Dagang', 'revenue', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '4000'), 1),
  ('4020', 'Retur Penjualan', 'revenue', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '4000'), 1),
  ('4030', 'Diskon Penjualan', 'revenue', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '4000'), 1),
  ('4040', 'Pendapatan Lain-lain', 'revenue', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '4000'), 1),
  ('5000', 'Harga Pokok Penjualan', 'cogs', 'debit', NULL, 1),
  ('5010', 'HPP Barang Dagang', 'cogs', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '5000'), 1),
  ('5020', 'Ongkos Kirim Pembelian', 'cogs', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '5000'), 1),
  ('5030', 'Retur Pembelian', 'cogs', 'credit', (SELECT id FROM chart_of_accounts WHERE account_code = '5000'), 1),
  ('6000', 'Beban Operasional', 'expense', 'debit', NULL, 1),
  ('6010', 'Beban Gaji', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6020', 'Beban Sewa', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6030', 'Beban Listrik dan Air', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6040', 'Beban Internet dan Telepon', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6050', 'Beban Marketing', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6060', 'Beban Administrasi Bank', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6070', 'Beban Penyusutan', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6080', 'Beban Pajak', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1),
  ('6090', 'Beban Lain-lain', 'expense', 'debit', (SELECT id FROM chart_of_accounts WHERE account_code = '6000'), 1)
ON CONFLICT(account_code) DO UPDATE SET
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  parent_account_id = excluded.parent_account_id,
  is_active = 1,
  updated_at = datetime('now');

UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1000') WHERE account_code IN ('1010', '1020', '1030', '1040', '1050', '1060');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1100') WHERE account_code IN ('1110', '1120', '1130');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2000') WHERE account_code IN ('2010', '2020', '2030', '2040');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2100') WHERE account_code = '2110';
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '3000') WHERE account_code IN ('3010', '3020', '3030');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4000') WHERE account_code IN ('4010', '4020', '4030', '4040');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '5000') WHERE account_code IN ('5010', '5020', '5030');
UPDATE chart_of_accounts SET parent_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '6000') WHERE account_code IN ('6010', '6020', '6030', '6040', '6050', '6060', '6070', '6080', '6090');
