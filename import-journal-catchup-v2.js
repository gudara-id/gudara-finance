/**
 * Import SUSULAN (catch-up) dari spreadsheet ke aplikasi keuangan GUDARA,
 * versi CONTENT-MATCHING -- aman walau ada baris yang disisipkan di tengah
 * sheet (bukan cuma ditambah di akhir).
 *
 * CARA KERJA:
 *   1. Baca REFERENCE_XLSX_PATH = file snapshot LAMA yang isinya SUDAH
 *      100% ter-import ke aplikasi (default: "REPORT GUDARA (1).xlsx",
 *      619 baris, sampai 1 Sept 2026).
 *   2. Baca XLSX_PATH = file export TERBARU dari Google Sheets (yang mau
 *      kamu proses sekarang, bisa punya baris baru DI MANA SAJA -- awal,
 *      tengah, atau akhir).
 *   3. Cocokkan tiap baris di file baru terhadap baris di file lama
 *      berdasarkan ISI-nya (tanggal + arah + keterangan + kategori +
 *      nominal), bukan posisi baris. Baris di file baru yang TIDAK
 *      match sama sekali dengan baris manapun di file lama = baris BARU,
 *      itu yang akan diproses.
 *   4. Kalau ada baris di file LAMA yang tidak ketemu pasangannya di file
 *      baru -- itu tanda ada baris lama yang KEHAPUS/DIUBAH di sheet.
 *      Script akan berhenti dan tampilkan detailnya (jangan lanjut kalau
 *      ini terjadi -- cek manual dulu).
 *
 * CARA PAKAI: sama seperti import-journal.js (DRY_RUN dulu, baru DRY_RUN=false).
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// ============================= KONFIGURASI =============================

const API_BASE_URL = process.env.API_BASE_URL || "https://api.gudara.id";
const EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const PASSWORD = process.env.GUDARA_PASSWORD || "";

const REFERENCE_XLSX_PATH =
  process.env.REFERENCE_XLSX_PATH || path.join(__dirname, "REPORT GUDARA (1).xlsx");
const XLSX_PATH = process.env.XLSX_PATH || path.join(__dirname, "REPORT_GUDARA.xlsx");
const SHEET_NAME = "📅 Jurnal Harian";
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true
const DELAY_MS_BETWEEN_REQUESTS = 150;

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
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new Error(`Tanggal tidak valid: ${value}`);
}

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

// --- Content-matching helpers -------------------------------------------

/**
 * Kunci unik per baris, dibangun dari kolom yang seharusnya TIDAK berubah
 * walau baris lain disisipkan/dipindah: tanggal, arah, keterangan,
 * kategori, dan nominal (debet ATAU kredit, mana yang terisi).
 */
function rowKey(row) {
  const tanggal = row["TANGGAL"] instanceof Date
    ? row["TANGGAL"].toISOString().slice(0, 10)
    : String(row["TANGGAL"] || "");
  const arah = String(row["KELUAR / MASUK"] || "").trim();
  const keterangan = String(row["KETERANGAN"] || "").trim();
  const kategori = String(row["KATEGORI"] || "").trim();
  const debet = Number(row["DEBET (Rp)"] || 0);
  const kredit = Number(row["KREDIT (Rp)"] || 0);
  return `${tanggal}|${arah}|${keterangan}|${kategori}|${debet}|${kredit}`;
}

function loadDataRows(xlsxPath) {
  const workbook = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan di ${xlsxPath}. Sheet yang ada: ${workbook.SheetNames.join(", ")}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 3, defval: null });
  return rows.filter((r) => r["TANGGAL"] && r["KETERANGAN"]);
}

/**
 * Diff dua daftar baris berdasarkan multiset key (menangani duplikat --
 * misal ada 2 baris persis sama isinya, keduanya tetap dihitung terpisah).
 * Mengembalikan { newRows, missingFromNew } -- newRows = baris di `newList`
 * yang tidak ada pasangannya di `refList`; missingFromNew = baris di
 * `refList` yang tidak ketemu di `newList` (harusnya kosong kalau aman).
 */
function diffByKey(refList, newList) {
  const refCount = new Map();
  for (const r of refList) {
    const k = rowKey(r);
    refCount.set(k, (refCount.get(k) || 0) + 1);
  }

  const newRows = [];
  for (const r of newList) {
    const k = rowKey(r);
    const remaining = refCount.get(k) || 0;
    if (remaining > 0) {
      refCount.set(k, remaining - 1); // konsumsi satu match
    } else {
      newRows.push(r); // tidak ada match tersisa -> baris baru
    }
  }

  const missingFromNew = [];
  for (const [k, count] of refCount.entries()) {
    if (count > 0) {
      for (let i = 0; i < count; i++) missingFromNew.push(k);
    }
  }

  return { newRows, missingFromNew };
}

// --- API helpers ----------------------------------------------------------

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

// --- Main -------------------------------------------------------------

async function main() {
  if (!DRY_RUN && !PASSWORD) {
    throw new Error("Set GUDARA_PASSWORD (env var) sebelum menjalankan mode nyata (DRY_RUN=false).");
  }

  console.log(`Membaca file referensi (sudah ter-import): ${REFERENCE_XLSX_PATH} ...`);
  const refRows = loadDataRows(REFERENCE_XLSX_PATH);
  console.log(`  -> ${refRows.length} baris.`);

  console.log(`Membaca file terbaru: ${XLSX_PATH} ...`);
  const newRowsAll = loadDataRows(XLSX_PATH);
  console.log(`  -> ${newRowsAll.length} baris.`);

  const { newRows: dataRows, missingFromNew } = diffByKey(refRows, newRowsAll);

  if (missingFromNew.length > 0) {
    console.log(`\n⚠️  PERINGATAN: ${missingFromNew.length} baris dari file referensi TIDAK ketemu di file terbaru.`);
    console.log("Ini tandanya ada baris LAMA (yang sudah ter-import) yang kehapus/berubah isinya di sheet.");
    console.log("Contoh key yang hilang:");
    for (const k of missingFromNew.slice(0, 15)) console.log(`  - ${k}`);
    throw new Error(
      "Berhenti demi keamanan -- cek manual dulu baris-baris di atas sebelum lanjut. " +
      "Kalau memang itu perubahan yang disengaja (misal koreksi nominal), tangani manual, jangan lewat script ini."
    );
  }

  console.log(
    `\nDiff OK. Ditemukan ${dataRows.length} baris BARU yang belum ter-import ` +
    `(dari ${newRowsAll.length} total, ${refRows.length} sudah match dengan yang lama).`
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
        throw new Error(`Kode akun ${code} tidak ditemukan di chart of accounts live.`);
      }
    }
  }

  const skipped = [];
  const results = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const mapping = resolveAccounts(row);
    const arah = String(row["KELUAR / MASUK"] || "").trim();
    const amount = arah === "Masuk" ? Number(row["DEBET (Rp)"] || 0) : Number(row["KREDIT (Rp)"] || 0);

    if (!mapping || !amount) {
      skipped.push({ keterangan: row["KETERANGAN"], kategori: row["KATEGORI"], arah, amount, tanggal: row["TANGGAL"] });
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
      results.push({ entryDate, description, debit: mapping.debitCode, credit: mapping.creditCode, amount });
      continue;
    }

    try {
      await postJournal(token, payload);
      results.push({ status: "ok", entryDate, description, amount });
      process.stdout.write(".");
    } catch (err) {
      results.push({ status: "error", entryDate, description, amount, error: err.message });
      process.stdout.write("x");
    }

    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }

  console.log("\n\n=== RINGKASAN ===");
  console.log(`Baris baru ditemukan  : ${dataRows.length}`);
  console.log(`Diproses/di-preview   : ${results.length}`);
  console.log(`Dilewati (tak dikenal / nominal 0): ${skipped.length}`);

  if (!DRY_RUN) {
    const errors = results.filter((r) => r.status === "error");
    console.log(`Berhasil dikirim      : ${results.length - errors.length}`);
    console.log(`Gagal dikirim         : ${errors.length}`);
  }

  const outDir = __dirname;
  fs.writeFileSync(path.join(outDir, "catchup-result.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, "catchup-skipped.json"), JSON.stringify(skipped, null, 2));
  console.log(`\nDetail lengkap disimpan di:\n  - ${path.join(outDir, "catchup-result.json")}\n  - ${path.join(outDir, "catchup-skipped.json")}`);

  if (skipped.length) {
    console.log("\nContoh baris yang dilewati (cek catchup-skipped.json untuk semua):");
    console.log(skipped.slice(0, 10));
  }
}

main().catch((err) => {
  console.error("GAGAL:", err.message || err);
  process.exit(1);
});
