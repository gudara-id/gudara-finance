const bcrypt = require("bcryptjs");
const { Client } = require("pg");
require("dotenv").config();

const chartOfAccounts = [
  ["1000", "Aset Lancar", "asset", "debit", null],
  ["1010", "Kas", "asset", "debit", "1000"],
  ["1020", "Bank", "asset", "debit", "1000"],
  ["1030", "Piutang Usaha", "asset", "debit", "1000"],
  ["1040", "Persediaan Barang Dagang", "asset", "debit", "1000"],
  ["1050", "Uang Muka Pembelian", "asset", "debit", "1000"],
  ["1060", "Pajak Dibayar Dimuka", "asset", "debit", "1000"],
  ["1100", "Aset Tetap", "asset", "debit", null],
  ["1110", "Peralatan Toko", "asset", "debit", "1100"],
  ["1120", "Kendaraan Operasional", "asset", "debit", "1100"],
  ["1130", "Akumulasi Penyusutan", "asset", "credit", "1100"],

  ["2000", "Liabilitas Lancar", "liability", "credit", null],
  ["2010", "Utang Usaha", "liability", "credit", "2000"],
  ["2020", "Utang Pajak", "liability", "credit", "2000"],
  ["2030", "Utang Gaji", "liability", "credit", "2000"],
  ["2040", "Pendapatan Diterima Dimuka", "liability", "credit", "2000"],
  ["2100", "Liabilitas Jangka Panjang", "liability", "credit", null],
  ["2110", "Utang Bank Jangka Panjang", "liability", "credit", "2100"],

  ["3000", "Ekuitas", "equity", "credit", null],
  ["3010", "Modal Pemilik", "equity", "credit", "3000"],
  ["3020", "Laba Ditahan", "equity", "credit", "3000"],
  ["3030", "Prive / Dividen", "equity", "debit", "3000"],

  ["4000", "Pendapatan", "revenue", "credit", null],
  ["4010", "Penjualan Barang Dagang", "revenue", "credit", "4000"],
  ["4020", "Retur Penjualan", "revenue", "debit", "4000"],
  ["4030", "Diskon Penjualan", "revenue", "debit", "4000"],
  ["4040", "Pendapatan Lain-lain", "revenue", "credit", "4000"],

  ["5000", "Harga Pokok Penjualan", "cogs", "debit", null],
  ["5010", "HPP Barang Dagang", "cogs", "debit", "5000"],
  ["5020", "Ongkos Kirim Pembelian", "cogs", "debit", "5000"],
  ["5030", "Retur Pembelian", "cogs", "credit", "5000"],

  ["6000", "Beban Operasional", "expense", "debit", null],
  ["6010", "Beban Gaji", "expense", "debit", "6000"],
  ["6020", "Beban Sewa", "expense", "debit", "6000"],
  ["6030", "Beban Listrik dan Air", "expense", "debit", "6000"],
  ["6040", "Beban Internet dan Telepon", "expense", "debit", "6000"],
  ["6050", "Beban Marketing", "expense", "debit", "6000"],
  ["6060", "Beban Administrasi Bank", "expense", "debit", "6000"],
  ["6070", "Beban Penyusutan", "expense", "debit", "6000"],
  ["6080", "Beban Pajak", "expense", "debit", "6000"],
  ["6090", "Beban Lain-lain", "expense", "debit", "6000"]
];

const adminUser = {
  fullName: process.env.SEED_ADMIN_NAME || "Gudara Admin",
  email: process.env.SEED_ADMIN_EMAIL || "admin@gudara.id",
  password: process.env.SEED_ADMIN_PASSWORD,
  role: "admin"
};

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!adminUser.password || adminUser.password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD is required and must be at least 10 characters.");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    await client.query("BEGIN");

    const accountIdByCode = new Map();

    for (const [code, name, type, normalBalance, parentCode] of chartOfAccounts) {
      const parentId = parentCode ? accountIdByCode.get(parentCode) : null;

      if (parentCode && !parentId) {
        throw new Error(`Parent account ${parentCode} is missing for account ${code}.`);
      }

      const result = await client.query(
        `
          INSERT INTO chart_of_accounts (
            account_code,
            account_name,
            account_type,
            normal_balance,
            parent_account_id,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, TRUE)
          ON CONFLICT (account_code)
          DO UPDATE SET
            account_name = EXCLUDED.account_name,
            account_type = EXCLUDED.account_type,
            normal_balance = EXCLUDED.normal_balance,
            parent_account_id = EXCLUDED.parent_account_id,
            is_active = TRUE,
            updated_at = NOW()
          RETURNING id
        `,
        [code, name, type, normalBalance, parentId]
      );

      accountIdByCode.set(code, result.rows[0].id);
    }

    const existingAdmin = await client.query("SELECT id FROM users WHERE lower(email) = lower($1)", [adminUser.email]);

    if (existingAdmin.rowCount === 0) {
      const passwordHash = await bcrypt.hash(adminUser.password, 12);

      await client.query(
        `
          INSERT INTO users (full_name, email, password_hash, role, is_active)
          VALUES ($1, $2, $3, $4, TRUE)
        `,
        [adminUser.fullName, adminUser.email, passwordHash, adminUser.role]
      );
      console.log(`Admin user ${adminUser.email} created.`);
    } else {
      console.log(`Admin user ${adminUser.email} already exists.`);
    }

    await client.query("COMMIT");
    console.log(`${chartOfAccounts.length} chart of accounts seeded successfully.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error("Database seeding failed.");
  console.error(error.message);
  process.exit(1);
});
