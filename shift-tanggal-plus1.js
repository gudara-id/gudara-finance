/**
 * KOREKSI TANGGAL: geser semua tanggal jurnal Agustus s/d sekarang MAJU 1 HARI.
 *
 * MASALAH: waktu import dulu, ada bug konversi tanggal Excel -> ISO yang
 * membuat SEMUA jurnal tercatat 1 hari LEBIH AWAL dari tanggal aslinya di
 * "REPORT_GUDARA.xlsx". Contoh: transaksi yang di spreadsheet sumber
 * tertanggal 03-Agustus, di aplikasi malah tersimpan 2026-08-02.
 *
 * Saldo akhir (Neraca) SUDAH benar sekarang -- script ini HANYA membetulkan
 * tanggal per transaksi, TIDAK mengubah nominal debit/kredit sama sekali.
 *
 * YANG DILEWATI (tidak digeser), supaya saldo yang sudah benar tidak berubah:
 *   - Jurnal "Saldo awal Kas/Bank per 2026-08-02" (JV-202608-280, JV-202608-281)
 *   - Jurnal apapun yang deskripsinya mengandung kata "saldo awal" atau "koreksi"
 *     (termasuk jurnal koreksi Rp 2.500.000 yang baru dibuat manual)
 *   - Jurnal berstatus "void"
 *   - Jurnal yang kalau digeser +1 hari akan LEWAT dari SHIFT_END_DATE
 *     (supaya tidak ada transaksi yang "hilang" dari Neraca per tanggal
 *     hari ini) -- ini akan muncul di daftar "DILEWATI (akan lewat batas)"
 *     dan HARUS dicek manual.
 *
 * PENGAMAN supaya tidak ke-run dua kali seperti kejadian sebelumnya:
 * script ini membuat file kunci (shift-tanggal-plus1.lock) setelah berhasil
 * jalan LIVE, dan akan MENOLAK jalan lagi selama file itu masih ada.
 *
 * CARA PAKAI:
 *   1. Preview dulu (aman, tidak mengubah apapun, tapi tetap login & ambil
 *      data asli supaya preview akurat):
 *          node shift-tanggal-plus1.js
 *   2. Periksa daftar "AKAN DIGESER" dan "DILEWATI (akan lewat batas)".
 *   3. Kalau sudah yakin:
 *          DRY_RUN=false GUDARA_PASSWORD=xxxx node shift-tanggal-plus1.js
 *   4. Cek lagi Neraca per 08/09/2026 -- Kas & Bank HARUS TETAP sama seperti
 *      sekarang (Rp 11.735.000 dan Rp 43.382.692). Kalau berubah, jangan
 *      lanjut apa-apa dulu, kirim ke saya hasilnya.
 *
 * Butuh Node.js 18+.
 */

const fs = require("fs");
const path = require("path");

const API_BASE_URL = process.env.API_BASE_URL || "https://api.gudara.id";
const EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const PASSWORD = process.env.GUDARA_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true
const DELAY_MS_BETWEEN_REQUESTS = 150;

const SHIFT_START_DATE = process.env.SHIFT_START_DATE || "2026-08-02";
const SHIFT_END_DATE = process.env.SHIFT_END_DATE || "2026-09-08"; // hari ini
const TODAY_CUTOFF = process.env.TODAY_CUTOFF || "2026-09-08"; // batas Neraca

const EXCLUDE_REF_NOS = new Set(
  (process.env.EXCLUDE_REF_NOS || "JV-202608-280,JV-202608-281")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const EXCLUDE_DESCRIPTION_KEYWORDS = ["saldo awal", "koreksi"];

const LOCK_FILE = path.join(__dirname, "shift-tanggal-plus1.lock");

// =========================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function addOneDay(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shouldExclude(entry) {
  if (entry.status !== "posted") return true;
  if (EXCLUDE_REF_NOS.has(entry.reference_no)) return true;
  const desc = String(entry.description || "").toLowerCase();
  return EXCLUDE_DESCRIPTION_KEYWORDS.some((kw) => desc.includes(kw));
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

async function fetchJournalsInRange(token, startDate, endDate) {
  const all = [];
  let page = 1;
  while (true) {
    const url = `${API_BASE_URL}/api/journals?start_date=${startDate}&end_date=${endDate}&page=${page}&page_size=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(`Gagal ambil daftar jurnal: ${res.status} ${JSON.stringify(body)}`);
    all.push(...body.data);
    if (page >= (body.meta?.total_pages || 1)) break;
    page += 1;
  }
  return all;
}

async function updateJournalDate(token, entry, newDate) {
  const payload = {
    entry_date: newDate,
    description: entry.description,
    reference_no: entry.reference_no,
    tags: entry.tags || [],
    lines: entry.lines.map((line) => ({
      account_id: line.account_id,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo || undefined
    }))
  };

  const res = await fetch(`${API_BASE_URL}/api/journals/${entry.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(body)}` };
  return { ok: true };
}

async function main() {
  if (!DRY_RUN) {
    if (!PASSWORD) {
      throw new Error("Set GUDARA_PASSWORD (env var) sebelum menjalankan mode nyata (DRY_RUN=false).");
    }
    if (fs.existsSync(LOCK_FILE)) {
      const info = fs.readFileSync(LOCK_FILE, "utf8");
      throw new Error(
        `Script ini SUDAH PERNAH dijalankan sukses sebelumnya (lihat ${LOCK_FILE}):\n${info}\n` +
        `Kalau memang mau jalan lagi (mis. ada entri baru yang belum tergeser), hapus dulu file lock-nya SETELAH memastikan tidak akan ada yang tergeser dua kali, baru jalankan ulang.`
      );
    }
  }

  console.log(`Mode              : ${DRY_RUN ? "DRY RUN (preview saja)" : "LIVE (mengubah data sungguhan)"}`);
  console.log(`Rentang tanggal   : ${SHIFT_START_DATE} s/d ${SHIFT_END_DATE}`);
  console.log(`Batas Neraca      : ${TODAY_CUTOFF} (jurnal yang hasil geser > tanggal ini akan DILEWATI)`);
  console.log("");

  const token = await login();
  const entries = await fetchJournalsInRange(token, SHIFT_START_DATE, SHIFT_END_DATE);

  console.log(`Total jurnal ditemukan pada rentang ini: ${entries.length}`);

  const toShift = [];
  const excluded = [];
  const skippedFuture = [];

  for (const entry of entries) {
    if (shouldExclude(entry)) {
      excluded.push(entry);
      continue;
    }
    const newDate = addOneDay(entry.entry_date);
    if (newDate > TODAY_CUTOFF) {
      skippedFuture.push({ ...entry, newDate });
      continue;
    }
    toShift.push({ ...entry, newDate });
  }

  console.log(`Dilewati (saldo awal/koreksi/void) : ${excluded.length}`);
  console.log(`DILEWATI (akan lewat batas Neraca)  : ${skippedFuture.length}`);
  if (skippedFuture.length) {
    for (const e of skippedFuture) {
      console.log(`   #${e.id} [${e.reference_no}] ${e.entry_date} -> ${e.newDate} : ${e.description} (${formatRupiah(e.amount)})`);
    }
  }
  console.log(`AKAN DIGESER (+1 hari)              : ${toShift.length}`);
  console.log("");

  if (DRY_RUN) {
    console.log("Contoh 10 pertama yang akan digeser:");
    for (const e of toShift.slice(0, 10)) {
      console.log(`   #${e.id} [${e.reference_no}] ${e.entry_date} -> ${e.newDate} : ${e.description}`);
    }
    console.log("\nIni baru preview. Jalankan dengan DRY_RUN=false GUDARA_PASSWORD=... untuk eksekusi sungguhan.");
    return;
  }

  let okCount = 0;
  const failed = [];
  for (const entry of toShift) {
    const result = await updateJournalDate(token, entry, entry.newDate);
    if (result.ok) {
      okCount += 1;
      process.stdout.write(".");
    } else {
      failed.push({ ...entry, error: result.error });
      process.stdout.write("x");
    }
    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }
  console.log("\n");

  console.log("=== RINGKASAN ===");
  console.log(`Berhasil digeser : ${okCount}/${toShift.length}`);
  if (failed.length) {
    console.log(`GAGAL digeser    : ${failed.length}`);
    for (const f of failed) {
      console.log(`   #${f.id} [${f.reference_no}] ${f.entry_date} -> ${f.newDate} : ${f.error}`);
    }
  }

  fs.writeFileSync(
    LOCK_FILE,
    `Dijalankan: ${new Date().toISOString()}\nBerhasil digeser: ${okCount}/${toShift.length}\nGagal: ${failed.length}\n`
  );
  console.log(`\nFile kunci dibuat: ${LOCK_FILE} (hapus manual kalau memang perlu jalan ulang).`);
  console.log("\nLANGKAH TERAKHIR (wajib): cek ulang Neraca per 08/09/2026 -- Kas dan Bank HARUS TETAP:");
  console.log("   Kas  = Rp 11.735.000");
  console.log("   Bank = Rp 43.382.692");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
