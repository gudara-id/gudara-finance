/**
 * Import jurnal dari "REPORT_GUDARA.xlsx" (sheet "📅 Jurnal Harian")
 * ke aplikasi keuangan GUDARA (Cloudflare Worker + D1) lewat REST API.
 *
 * CARA PAKAI:
 *   1. npm install xlsx
 *   2. Taruh file xlsx-nya di folder yang sama, atau ubah XLSX_PATH di bawah.
 *   3. Isi API_BASE_URL, EMAIL, PASSWORD di bawah.
 *   4. Jalankan dulu dalam mode DRY RUN (default DRY_RUN = true) untuk
 *      lihat preview entri yang akan dibuat TANPA benar-benar mengirim
 *      apa pun ke server:
 *          node import-journal.js
 *   5. Kalau preview-nya sudah sesuai, ubah DRY_RUN jadi false lalu
 *      jalankan lagi untuk benar-benar mengirim ke API:
 *          DRY_RUN=false node import-journal.js
 *
 * Butuh Node.js 18+ (pakai fetch bawaan).
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
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true -- lihat catatan di atas
const DELAY_MS_BETWEEN_REQUESTS = 150; // jeda antar request supaya tidak membanjiri API

// ==================== CATCH-UP MODE (anti dobel-import) ====================
// Baris terakhir yang SUDAH ter-import ke aplikasi (dari import-result.json
// sebelumnya): row 623, KETERANGAN "Return Barang Gudara", tanggal 2026-09-01.
// Import kali ini HANYA akan memproses baris SETELAH baris ini.
//
// Ganti dua nilai ini kalau kamu sudah import ulang lagi setelah ini dan
// butuh catch-up berikutnya.
const LAST_IMPORTED_ROW = Number(process.env.LAST_IMPORTED_ROW || 623);
const LAST_IMPORTED_KETERANGAN = process.env.LAST_IMPORTED_KETERANGAN || "Return Barang Gudara";
// =============================================================================

// Kode akun COA yang dipakai. SESUAIKAN kalau kode di COA live kamu berbeda
// dari daftar seed default.
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
  // fallback: string tanggal
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new Error(`Tanggal tidak valid: ${value}`);
}

/**
 * Menentukan pasangan akun debit/kredit untuk satu baris transaksi,
 * berdasarkan mapping yang sudah dikonfirmasi.
 * Mengembalikan { debitCode, creditCode, note } atau null kalau tidak
 * dikenali (baris akan dilewati dan dicatat sebagai "skipped").
 */
function resolveAccounts(row, rowIndexInSheet) {
  const arah = String(row["KELUAR / MASUK"] || "").trim();
  const kategori = String(row["KATEGORI"] || "").trim();
  const keterangan = String(row["KETERANGAN"] || "").trim();
  const masuk = arah === "Masuk";
  const keluar = arah === "Keluar";

  // Kasus khusus: baris pertama "Saldo Awal Kas" -- bukan penjualan,
  // ini saldo awal kas (equity), walau kategorinya kebetulan "Marketplace".
  if (/saldo awal/i.test(keterangan)) {
    return { debitCode: ACC.KAS, creditCode: ACC.MODAL_PEMILIK, note: "Saldo awal kas" };
  }

  // Kasus khusus: penarikan profit pemilik, kategori sering kosong di sheet.
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

  return null; // tidak dikenali -> akan di-skip & dilaporkan
}

async function login() {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Login gagal: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.data.access_token;
}

async function fetchAccountMap(token) {
  const res = await fetch(`${API_BASE_URL}/api/chart-of-accounts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Gagal ambil chart of accounts: ${res.status} ${JSON.stringify(body)}`);
  }
  const map = new Map();
  for (const acc of body.data) {
    map.set(acc.account_code, acc.id);
  }
  return map;
}

async function postJournal(token, payload) {
  const res = await fetch(`${API_BASE_URL}/api/journals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(body)}`);
  }
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

  // Header sebenarnya ada di baris ke-4 (index 3, 0-based) file excel.
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 3, defval: null });

  const allDataRows = rows.filter((r) => r["TANGGAL"] && r["KETERANGAN"]);
  console.log(`Ditemukan ${allDataRows.length} baris transaksi total di sheet.`);

  // --- Safety check: pastikan baris LAST_IMPORTED_ROW di file ini betul-betul
  // baris yang sama dengan yang terakhir sukses di-import sebelumnya. ---
  const checkRowIndex = LAST_IMPORTED_ROW - 5; // -5 karena data mulai row 5
  const checkRow = allDataRows[checkRowIndex];
  if (!checkRow || String(checkRow["KETERANGAN"]).trim() !== LAST_IMPORTED_KETERANGAN) {
    throw new Error(
      `Safety check gagal: baris ${LAST_IMPORTED_ROW} di sheet sekarang berisi ` +
      `KETERANGAN="${checkRow ? checkRow["KETERANGAN"] : "(tidak ada)"}", ` +
      `padahal harusnya "${LAST_IMPORTED_KETERANGAN}" (baris terakhir yang sudah ` +
      `ter-import). Ini tandanya ada baris yang disisipkan/dihapus di sheet sebelum ` +
      `baris tsb, atau LAST_IMPORTED_ROW/LAST_IMPORTED_KETERANGAN salah. ` +
      `Cek manual dulu sebelum lanjut -- JANGAN paksa jalan, resikonya dobel-posting.`
    );
  }

  // Hanya proses baris SETELAH baris terakhir yang sudah ter-import.
  const dataRows = allDataRows.slice(checkRowIndex + 1);
  console.log(
    `Safety check OK: baris ${LAST_IMPORTED_ROW} = "${LAST_IMPORTED_KETERANGAN}" cocok.\n` +
    `Mode CATCH-UP: akan memproses ${dataRows.length} baris baru ` +
    `(baris ${LAST_IMPORTED_ROW + 1} s/d ${LAST_IMPORTED_ROW + dataRows.length}).`
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

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const mapping = resolveAccounts(row, i);
    const arah = String(row["KELUAR / MASUK"] || "").trim();
    const amount = arah === "Masuk" ? Number(row["DEBET (Rp)"] || 0) : Number(row["KREDIT (Rp)"] || 0);

    if (!mapping || !amount) {
      skipped.push({ row: i + LAST_IMPORTED_ROW + 1, keterangan: row["KETERANGAN"], kategori: row["KATEGORI"], arah, amount });
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
      results.push({ row: i + LAST_IMPORTED_ROW + 1, entryDate, description, debit: mapping.debitCode, credit: mapping.creditCode, amount });
      continue;
    }

    try {
      await postJournal(token, payload);
      results.push({ row: i + LAST_IMPORTED_ROW + 1, status: "ok", description, amount });
      process.stdout.write(".");
    } catch (err) {
      results.push({ row: i + LAST_IMPORTED_ROW + 1, status: "error", description, amount, error: err.message });
      process.stdout.write("x");
    }

    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }

  console.log("\n\n=== RINGKASAN ===");
  console.log(`Total baris data     : ${dataRows.length}`);
  console.log(`Diproses/di-preview  : ${results.length}`);
  console.log(`Dilewati (tak dikenal / nominal 0): ${skipped.length}`);

  if (!DRY_RUN) {
    const errors = results.filter((r) => r.status === "error");
    console.log(`Berhasil dikirim     : ${results.length - errors.length}`);
    console.log(`Gagal dikirim        : ${errors.length}`);
  }

  const outDir = __dirname;
  fs.writeFileSync(path.join(outDir, "import-result.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, "import-skipped.json"), JSON.stringify(skipped, null, 2));
  console.log(`\nDetail lengkap disimpan di:\n  - ${path.join(outDir, "import-result.json")}\n  - ${path.join(outDir, "import-skipped.json")}`);

  if (skipped.length) {
    console.log("\nContoh baris yang dilewati (cek import-skipped.json untuk semua):");
    console.log(skipped.slice(0, 10));
  }
}

main().catch((err) => {
  console.error("GAGAL:", err);
  process.exit(1);
});
