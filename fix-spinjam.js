/**
 * Perbaikan data: jurnal kategori "Spinjam Keluar" yang sudah terlanjur
 * di-import sebagai pelunasan utang (2110 Utang Bank Jangka Panjang),
 * dipindah menjadi beban (6090 Beban Lain-lain) supaya mempengaruhi
 * Laba/Rugi Bersih -- sesuai permintaan.
 *
 * CARA PAKAI: sama seperti fix-kemasan.js
 *   1. Dry run: set GUDARA_EMAIL/GUDARA_PASSWORD lalu `node fix-spinjam.js`
 *   2. Mode nyata: tambahkan `set DRY_RUN=false` lalu jalankan lagi
 */

const API_BASE_URL = process.env.API_BASE_URL || "https://api.gudara.id";
const EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const PASSWORD = process.env.GUDARA_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN !== "false";

const FROM_CODE = "2110"; // Utang Bank Jangka Panjang (akun lama, salah)
const TO_CODE = "6090"; // Beban Lain-lain (akun baru, benar -- masuk P&L)
const SEARCH_TERM = "(Spinjam Keluar)";

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
  const fromId = accountMap.get(FROM_CODE);
  const toId = accountMap.get(TO_CODE);
  if (!fromId || !toId) {
    throw new Error(`Kode akun ${FROM_CODE} atau ${TO_CODE} tidak ditemukan di chart of accounts.`);
  }

  console.log(`Mencari jurnal dengan deskripsi mengandung "${SEARCH_TERM}"...`);
  const journals = await fetchAllMatchingJournals(token);
  console.log(`Ditemukan ${journals.length} jurnal.`);

  const toFix = journals.filter((j) => j.lines.some((l) => l.account_id === fromId && Number(l.debit) > 0));
  console.log(`Dari situ, ${toFix.length} jurnal punya baris debit ke akun ${FROM_CODE} yang perlu dipindah ke ${TO_CODE}.`);

  const results = [];

  for (const entry of toFix) {
    const newLines = entry.lines.map((l) => ({
      account_id: l.account_id === fromId && Number(l.debit) > 0 ? toId : l.account_id,
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
