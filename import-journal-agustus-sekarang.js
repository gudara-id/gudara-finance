/**
 * Import ULANG jurnal dari "REPORT_GUDARA.xlsx" (sheet "📅 Jurnal Harian"),
 * TAPI hanya baris tanggal >= START_DATE (default 2026-08-01) — dipakai
 * setelah reset-jurnal-piutang-utang.sql supaya cuma data Agustus s/d
 * sekarang yang masuk lagi ke aplikasi.
 *
 * Mapping akun sama persis dengan import-journal-catchup.js (sudah
 * termasuk perbaikan kategori "Kemasan" -> Beban Lain-lain 6090, bukan HPP).
 *
 * SALDO AWAL (PENTING — baca dulu sebelum jalan):
 * Karena transaksi Juni-Juli 2026 tidak diimpor ulang, akun Kas & Bank
 * akan mulai dari Rp0 kalau tidak diberi saldo awal. Supaya laporan tetap
 * akurat, script ini SECARA DEFAULT membuat SATU jurnal saldo awal
 * tambahan bertanggal 2026-08-01 sebesar saldo riil akhir Juli 2026 dari
 * sheet (Kas Rp26.335.586, Bank Rp15.810.883 - dari kolom SALDO BERJALAN
 * & DANA PEMINDAHAN REKENING baris terakhir sebelum Agustus). Kalau tidak
 * mau ini (mis. saldo awal mau diinput manual sendiri), set
 * INCLUDE_OPENING_BALANCE=false.
 *
 * CARA PAKAI:
 *   1. npm install xlsx  (kalau folder node_modules lama sudah ada, skip)
 *   2. Taruh file xlsx-nya di folder yang sama, atau ubah XLSX_PATH.
 *   3. Jalankan dulu mode DRY RUN (default) untuk lihat preview:
 *          node import-journal-agustus-sekarang.js
 *   4. Kalau preview sudah sesuai:
 *          DRY_RUN=false GUDARA_PASSWORD=xxxx node import-journal-agustus-sekarang.js
 *
 * Butuh Node.js 18+ (pakai fetch bawaan). Jalankan SETELAH reset dan
 * SETELAH migration 0009_book_closing.sql di-apply (biar konsisten,
 * walau tidak wajib urutan itu).
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// ============================= KONFIGURASI =============================

const API_BASE_URL = process.env.API_BASE_URL || "https://api.gudara.id";
const EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const PASSWORD = process.env.GUDARA_PASSWORD || "";
const XLSX_PATH = process.env.XLSX_PATH || path.join(__dirname, "REPORT_GUDARA.xlsx");
const SHEET_NAME = "📅 Jurnal Harian";
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true
const DELAY_MS_BETWEEN_REQUESTS = 150;

// Hanya baris dengan tanggal >= START_DATE yang diimpor.
const START_DATE = process.env.START_DATE || "2026-08-01";

// Saldo awal Kas & Bank per akhir hari sebelum START_DATE (lihat catatan
// di atas). SESUAIKAN kalau START_DATE diubah ke tanggal lain.
const INCLUDE_OPENING_BALANCE = process.env.INCLUDE_OPENING_BALANCE !== "false"; // default true
const OPENING_BALANCE_KAS = Number(process.env.OPENING_BALANCE_KAS || 26335586);
const OPENING_BALANCE_BANK = Number(process.env.OPENING_BALANCE_BANK || 15810883);

// Kode akun COA. SESUAIKAN kalau kode di COA live berbeda.
const ACC = {
  KAS: "1010",
  BANK: "1020",
  MODAL_PEMILIK: "3010",
  PENJUALAN: "4010",
  RETUR_PEMBELIAN: "5030",
  PENDAPATAN_LAIN: "4040",
  HPP: "5010",
  BEBAN_GAJI: "6010",
  BEBAN_SEWA: "6020",
  BEBAN_LISTRIK_AIR: "6030",
  BEBAN_INTERNET_TELEPON: "6040",
  BEBAN_MARKETING: "6050",
  BEBAN_ADMIN_BANK: "6060",
  BEBAN_LAIN: "6090",
  UTANG_BANK_JP: "2110",
  PRIVE_DIVIDEN: "3030"
};

// =========================================================================

function excelDateToISO(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new Error(`Tanggal tidak valid: ${value}`);
}

/**
 * Sama persis dengan resolveAccounts() di import-journal-catchup.js
 * (termasuk fix Kemasan -> 6090, BUKAN HPP 5010).
 */
function resolveAccounts(row) {
  const arah = String(row["KELUAR / MASUK"] || "").trim();
  const kategori = String(row["KATEGORI"] || "").trim();
  const keterangan = String(row["KETERANGAN"] || "").trim();
  const masuk = arah === "Masuk";
  const keluar = arah === "Keluar";

  if (/saldo awal/i.test(keterangan)) {
    return { debitCode: ACC.KAS, creditCode: ACC.MODAL_PEMILIK, note: "Saldo awal kas" };
  }

  if (/take profit/i.test(keterangan)) {
    return { debitCode: ACC.PRIVE_DIVIDEN, creditCode: ACC.KAS, note: "Penarikan profit pemilik" };
  }

  switch (kategori) {
    case "Marketplace":
    case "Reseller":
    case "Konsinyasi":
      if (masuk) return { debitCode: ACC.KAS, creditCode: ACC.PENJUALAN };
      break;

    case "PO":
      if (masuk) return { debitCode: ACC.KAS, creditCode: ACC.PENJUALAN };
      if (keluar) return { debitCode: ACC.HPP, creditCode: ACC.KAS };
      break;

    case "Bunga Rekening":
      if (masuk) return { debitCode: ACC.KAS, creditCode: ACC.PENDAPATAN_LAIN };
      break;

    case "Retur Produk":
      if (masuk) return { debitCode: ACC.KAS, creditCode: ACC.RETUR_PEMBELIAN };
      break;

    case "Pemindahan Rekening":
      if (keluar) return { debitCode: ACC.BANK, creditCode: ACC.KAS };
      if (masuk) return { debitCode: ACC.KAS, creditCode: ACC.BANK };
      break;

    case "Iklan":
    case "Host Live":
      if (keluar) return { debitCode: ACC.BEBAN_MARKETING, creditCode: ACC.KAS };
      break;

    case "Gaji":
    case "Bonus Tim":
      if (keluar) return { debitCode: ACC.BEBAN_GAJI, creditCode: ACC.KAS };
      break;

    case "Kemasan":
      if (keluar) return { debitCode: ACC.BEBAN_LAIN, creditCode: ACC.KAS };
      break;

    case "Stok":
      if (keluar) return { debitCode: ACC.HPP, creditCode: ACC.KAS };
      break;

    case "Ongkir":
      if (keluar) return { debitCode: ACC.BEBAN_LAIN, creditCode: ACC.KAS };
      break;

    case "Operasional Tempat":
      if (keluar) {
        let debitCode = ACC.BEBAN_LAIN;
        if (/sewa/i.test(keterangan)) debitCode = ACC.BEBAN_SEWA;
        else if (/listrik/i.test(keterangan)) debitCode = ACC.BEBAN_LISTRIK_AIR;
        else if (/internet/i.test(keterangan)) debitCode = ACC.BEBAN_INTERNET_TELEPON;
        return { debitCode, creditCode: ACC.KAS };
      }
      break;

    case "Ops Lainnya":
      if (keluar) return { debitCode: ACC.BEBAN_LAIN, creditCode: ACC.KAS };
      break;

    case "Admin Bank":
      if (keluar) return { debitCode: ACC.BEBAN_ADMIN_BANK, creditCode: ACC.KAS };
      break;

    case "Spinjam Keluar":
      if (keluar) return { debitCode: ACC.BEBAN_LAIN, creditCode: ACC.KAS };
      break;
  }

  return null;
}

async function login() {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Login gagal: ${res.status} ${JSON.stringify(body)}`);
  return body.data.access_token;
}

async function fetchAccountMap(token) {
  const res = await fetch(`${API_BASE_URL}/api/chart-of-accounts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gagal ambil chart of accounts: ${res.status} ${JSON.stringify(body)}`);
  const map = new Map();
  for (const acc of body.data) map.set(acc.account_code, acc.id);
  return map;
}

async function postJournal(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/journals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!DRY_RUN && !PASSWORD) {
    throw new Error("Set GUDARA_PASSWORD (env var) sebelum menjalankan mode nyata (DRY_RUN=false).");
  }

  console.log(`Membaca ${XLSX_PATH} ...`);
  const workbook = XLSX.readFile(XLSX_PATH, { cellDates: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan. Sheet yang ada: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { range: 3, defval: null });
  const allDataRows = rows.filter((r) => r["TANGGAL"] && r["KETERANGAN"]);

  const dataRows = allDataRows.filter((r) => excelDateToISO(r["TANGGAL"]) >= START_DATE);
  console.log(
    `Ditemukan ${allDataRows.length} baris total di sheet, ${dataRows.length} baris >= ${START_DATE} yang akan diimpor.`
  );

  let accountMap = null;
  let token = null;

  if (!DRY_RUN) {
    console.log("Login ke API...");
    token = await login();
    console.log("Mengambil chart of accounts...");
    accountMap = await fetchAccountMap(token);
    for (const code of Object.values(ACC)) {
      if (!accountMap.has(code)) {
        throw new Error(`Kode akun ${code} tidak ditemukan di chart of accounts live. Cek/edit mapping ACC di script ini.`);
      }
    }
  }

  const skipped = [];
  const results = [];

  // --- Saldo awal (opsional) ---
  if (INCLUDE_OPENING_BALANCE && (OPENING_BALANCE_KAS > 0 || OPENING_BALANCE_BANK > 0)) {
    const openingEntries = [];
    if (OPENING_BALANCE_KAS > 0) {
      openingEntries.push({
        entry_date: START_DATE,
        description: `Saldo awal Kas per ${START_DATE} (carry-over dari data sebelum reset)`,
        debitCode: ACC.KAS,
        creditCode: ACC.MODAL_PEMILIK,
        amount: OPENING_BALANCE_KAS
      });
    }
    if (OPENING_BALANCE_BANK > 0) {
      openingEntries.push({
        entry_date: START_DATE,
        description: `Saldo awal Bank per ${START_DATE} (carry-over dari data sebelum reset)`,
        debitCode: ACC.BANK,
        creditCode: ACC.MODAL_PEMILIK,
        amount: OPENING_BALANCE_BANK
      });
    }

    for (const entry of openingEntries) {
      const payload = {
        entry_date: entry.entry_date,
        description: entry.description,
        lines: [
          { account_id: DRY_RUN ? entry.debitCode : accountMap.get(entry.debitCode), debit: entry.amount, credit: 0 },
          { account_id: DRY_RUN ? entry.creditCode : accountMap.get(entry.creditCode), debit: 0, credit: entry.amount }
        ]
      };

      if (DRY_RUN) {
        results.push({ row: "saldo-awal", ...entry });
        continue;
      }

      try {
        await postJournal(token, payload);
        results.push({ row: "saldo-awal", status: "ok", description: entry.description, amount: entry.amount });
        process.stdout.write(".");
      } catch (err) {
        results.push({ row: "saldo-awal", status: "error", description: entry.description, amount: entry.amount, error: err.message });
        process.stdout.write("x");
      }
      await sleep(DELAY_MS_BETWEEN_REQUESTS);
    }
  }

  // --- Transaksi Agustus s/d sekarang ---
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const mapping = resolveAccounts(row);
    const arah = String(row["KELUAR / MASUK"] || "").trim();
    const amount = arah === "Masuk" ? Number(row["DEBET (Rp)"] || 0) : Number(row["KREDIT (Rp)"] || 0);

    if (!mapping || !amount) {
      skipped.push({ row: i, keterangan: row["KETERANGAN"], kategori: row["KATEGORI"], arah, amount });
      continue;
    }

    const entryDate = excelDateToISO(row["TANGGAL"]);
    const description = `${row["KETERANGAN"]} (${row["KATEGORI"]})`;

    const payload = {
      entry_date: entryDate,
      description,
      lines: [
        { account_id: DRY_RUN ? mapping.debitCode : accountMap.get(mapping.debitCode), debit: amount, credit: 0 },
        { account_id: DRY_RUN ? mapping.creditCode : accountMap.get(mapping.creditCode), debit: 0, credit: amount }
      ]
    };

    if (DRY_RUN) {
      results.push({ row: i, entryDate, description, debit: mapping.debitCode, credit: mapping.creditCode, amount });
      continue;
    }

    try {
      await postJournal(token, payload);
      results.push({ row: i, status: "ok", description, amount });
      process.stdout.write(".");
    } catch (err) {
      results.push({ row: i, status: "error", description, amount, error: err.message });
      process.stdout.write("x");
    }

    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }

  console.log("\n\n=== RINGKASAN ===");
  console.log(`Periode diimpor       : ${START_DATE} s/d sekarang`);
  console.log(`Saldo awal disertakan  : ${INCLUDE_OPENING_BALANCE ? "YA" : "TIDAK"}`);
  console.log(`Total baris transaksi  : ${dataRows.length}`);
  console.log(`Diproses/di-preview    : ${results.length}`);
  console.log(`Dilewati (tak dikenal/nominal 0): ${skipped.length}`);

  if (!DRY_RUN) {
    const errors = results.filter((r) => r.status === "error");
    console.log(`Berhasil dikirim       : ${results.length - errors.length}`);
    console.log(`Gagal dikirim          : ${errors.length}`);
  }

  fs.writeFileSync(path.join(__dirname, "import-agustus-result.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(__dirname, "import-agustus-skipped.json"), JSON.stringify(skipped, null, 2));
  console.log(`\nDetail lengkap: import-agustus-result.json, import-agustus-skipped.json`);

  if (skipped.length) {
    console.log("\nContoh baris yang dilewati (cek import-agustus-skipped.json untuk semua):");
    console.log(skipped.slice(0, 10));
  }
}

main().catch((err) => {
  console.error("GAGAL:", err);
  process.exit(1);
});
