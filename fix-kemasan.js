/**
 * Perbaikan data: jurnal kategori "Kemasan" yang sudah terlanjur di-import
 * salah masuk ke akun HPP (5010), padahal seharusnya Beban Operasional
 * (6090 Beban Lain-lain) -- sesuai klasifikasi di laporan Laba Rugi asli
 * ("Beban Kemasan & Aksesori" ada di bagian C. BEBAN OPERASIONAL, bukan
 * di bagian B. HPP).
 *
 * Script ini akan:
 *   1. Cari semua jurnal yang deskripsinya mengandung "(Kemasan)"
 *   2. Untuk tiap jurnal itu, ganti baris yang account-nya HPP (5010)
 *      menjadi Beban Lain-lain (6090)
 *   3. PUT jurnal yang sudah diperbaiki ke API
 *
 * CARA PAKAI (sama seperti import-journal.js):
 *   1. npm install (kalau belum ada folder node_modules dari sebelumnya, cukup pakai yang sudah ada)
 *   2. Dry run dulu:      node fix-kemasan.js
 *   3. Mode nyata:        set DRY_RUN=false / $env:DRY_RUN="false"  lalu jalankan lagi
 *                         (perlu GUDARA_EMAIL & GUDARA_PASSWORD seperti sebelumnya)
 */

const API_BASE_URL = process.env.API_BASE_URL || "https://api.gudara.id";
const EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const PASSWORD = process.env.GUDARA_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN !== "false";

const HPP_CODE = "5010";
const BEBAN_LAIN_CODE = "6090";
const SEARCH_TERM = "(Kemasan)";

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

async function fetchAllMatchingJournals(token) {
  let page = 1;
  const pageSize = 200;
  const all = [];
  while (true) {
    const res = await fetch(
      `${API_BASE_URL}/api/journals?search=${encodeURIComponent(SEARCH_TERM)}&page=${page}&page_size=${pageSize}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = await res.json();
    if (!res.ok) throw new Error(`Gagal ambil daftar jurnal: ${res.status} ${JSON.stringify(body)}`);
    all.push(...body.data);
    if (page >= body.meta.total_pages) break;
    page++;
  }
  return all;
}

async function updateJournal(token, id, payload) {
  const res = await fetch(`${API_BASE_URL}/api/journals/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
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
  console.log("Login...");
  const token = await login();

  console.log("Mengambil chart of accounts...");
  const accountMap = await fetchAccountMap(token);
  const hppId = accountMap.get(HPP_CODE);
  const bebanLainId = accountMap.get(BEBAN_LAIN_CODE);
  if (!hppId || !bebanLainId) {
    throw new Error(`Kode akun ${HPP_CODE} atau ${BEBAN_LAIN_CODE} tidak ditemukan di chart of accounts.`);
  }

  console.log(`Mencari jurnal dengan deskripsi mengandung "${SEARCH_TERM}"...`);
  const journals = await fetchAllMatchingJournals(token);
  console.log(`Ditemukan ${journals.length} jurnal.`);

  const toFix = journals.filter((j) => j.lines.some((l) => l.account_id === hppId && Number(l.debit) > 0));
  console.log(`Dari situ, ${toFix.length} jurnal punya baris debit ke akun HPP (${HPP_CODE}) yang perlu dipindah ke Beban Lain-lain (${BEBAN_LAIN_CODE}).`);

  const results = [];

  for (const entry of toFix) {
    const newLines = entry.lines.map((l) => ({
      account_id: l.account_id === hppId && Number(l.debit) > 0 ? bebanLainId : l.account_id,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      memo: l.memo || undefined
    }));

    const payload = {
      entry_date: entry.entry_date,
      description: entry.description,
      lines: newLines
    };

    if (DRY_RUN) {
      results.push({ id: entry.id, entry_date: entry.entry_date, description: entry.description, amount: entry.amount });
      continue;
    }

    try {
      await updateJournal(token, entry.id, payload);
      results.push({ id: entry.id, status: "ok" });
      process.stdout.write(".");
    } catch (err) {
      results.push({ id: entry.id, status: "error", error: err.message });
      process.stdout.write("x");
    }
    await sleep(150);
  }

  console.log("\n\n=== RINGKASAN ===");
  console.log(`Jurnal yang diperbaiki${DRY_RUN ? " (preview)" : ""}: ${results.length}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("GAGAL:", err);
  process.exit(1);
});
