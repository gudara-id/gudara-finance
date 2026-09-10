/**
 * KOREKSI: pindahkan awal periode laporan Agustus dari 1 Agustus -> 2 Agustus.
 *
 * Alasan: 1 Agustus 2026 seharusnya masuk ke laporan bulan Juli, bukan
 * Agustus. Jadi laporan Agustus harus mulai dari 2 Agustus s/d 1 September.
 *
 * APA YANG DILAKUKAN SCRIPT INI:
 *   1. Ambil semua jurnal yang tanggalnya persis 2026-08-01.
 *   2. Hapus semua jurnal itu (termasuk jurnal saldo awal lama yang
 *      sebelumnya dibuat di tanggal 1 Agustus).
 *   3. Buat 2 jurnal saldo awal baru bertanggal 2026-08-02:
 *        - Kas   : Rp 19.972.000
 *        - Bank  : Rp 34.758.711
 *      (debit ke akun Kas/Bank, kredit ke akun Modal Pemilik, sama seperti
 *      pola saldo awal yang sudah dipakai di import-journal-agustus-sekarang.js)
 *
 * CARA PAKAI:
 *   1. Jalankan dulu mode DRY RUN (default) untuk lihat preview -- TIDAK ADA
 *      perubahan yang dikirim ke server pada mode ini:
 *          node fix-mulai-2-agustus.js
 *   2. Periksa preview-nya: jurnal mana saja yang akan dihapus, dan saldo
 *      awal baru yang akan dibuat.
 *   3. Kalau sudah yakin, jalankan sungguhan:
 *          DRY_RUN=false GUDARA_PASSWORD=xxxx node fix-mulai-2-agustus.js
 *   4. SETELAH selesai, buka menu Neraca di aplikasi dan cek:
 *        - Saldo Kas sekarang harus  = Rp 11.735.000
 *        - Saldo Bank sekarang harus = Rp 43.382.692
 *      Kalau tidak cocok, JANGAN jalankan ulang -- screenshot hasilnya dan
 *      cek manual dulu, karena kemungkinan ada jurnal tanggal 1 Agustus yang
 *      gagal terhapus (lihat bagian "GAGAL DIHAPUS" di output).
 *
 * CATATAN PENTING:
 *   - Kalau ada jurnal 1 Agustus yang sebenarnya adalah invoice/tagihan
 *     Piutang & Utang, script ini TIDAK akan menghapusnya langsung (API
 *     memang melarang) -- akan muncul di daftar "GAGAL DIHAPUS" dengan
 *     pesan errornya. Batalkan (void) dulu dari menu Piutang & Utang,
 *     baru jalankan ulang script ini.
 *   - Kalau periode Agustus sudah "ditutup" (tutup buku), hapus/insert akan
 *     ditolak juga -- buka dulu dari menu Tutup Buku.
 *
 * Butuh Node.js 18+ (pakai fetch bawaan).
 */

const API_BASE_URL = process.env.API_BASE_URL || "https://api.gudara.id";
const EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const PASSWORD = process.env.GUDARA_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN !== "false"; // default true
const DELAY_MS_BETWEEN_REQUESTS = 150;

// Tanggal yang datanya mau dihapus (masuk laporan Juli, bukan Agustus).
const TARGET_DATE = process.env.TARGET_DATE || "2026-08-01";

// Tanggal saldo awal baru untuk periode Agustus.
const NEW_OPENING_DATE = process.env.NEW_OPENING_DATE || "2026-08-02";
const OPENING_BALANCE_KAS = Number(process.env.OPENING_BALANCE_KAS || 19972000);
const OPENING_BALANCE_BANK = Number(process.env.OPENING_BALANCE_BANK || 34758711);

// Saldo akhir yang diharapkan di Neraca setelah script ini selesai --
// hanya dipakai untuk ditampilkan sebagai pengingat, TIDAK divalidasi
// otomatis oleh script (script tidak menghitung ulang seluruh laporan).
const EXPECTED_ENDING_KAS = Number(process.env.EXPECTED_ENDING_KAS || 11735000);
const EXPECTED_ENDING_BANK = Number(process.env.EXPECTED_ENDING_BANK || 43382692);

// Kode akun COA. SESUAIKAN kalau kode di COA live berbeda.
const ACC = {
  KAS: "1010",
  BANK: "1020",
  MODAL_PEMILIK: "3010"
};

// =========================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
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

async function fetchJournalsOnDate(token, date) {
  const all = [];
  let page = 1;
  // page_size max di API adalah 200, cukup untuk satu hari transaksi.
  while (true) {
    const url = `${API_BASE_URL}/api/journals?start_date=${date}&end_date=${date}&page=${page}&page_size=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(`Gagal ambil daftar jurnal: ${res.status} ${JSON.stringify(body)}`);
    all.push(...body.data);
    if (page >= (body.meta?.total_pages || 1)) break;
    page += 1;
  }
  return all;
}

async function deleteJournal(token, id) {
  const res = await fetch(`${API_BASE_URL}/api/journals/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 204) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: `${res.status} ${JSON.stringify(body)}` };
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

async function main() {
  if (!DRY_RUN && !PASSWORD) {
    throw new Error("Set GUDARA_PASSWORD (env var) sebelum menjalankan mode nyata (DRY_RUN=false).");
  }

  console.log(`Mode           : ${DRY_RUN ? "DRY RUN (preview saja)" : "LIVE (mengubah data sungguhan)"}`);
  console.log(`API_BASE_URL   : ${API_BASE_URL}`);
  console.log(`Hapus tanggal  : ${TARGET_DATE}`);
  console.log(`Saldo awal baru: ${NEW_OPENING_DATE} -> Kas ${formatRupiah(OPENING_BALANCE_KAS)}, Bank ${formatRupiah(OPENING_BALANCE_BANK)}`);
  console.log("");

  const token = DRY_RUN ? null : await login();
  const accountMap = DRY_RUN ? null : await fetchAccountMap(token);

  // --- 1. Cari jurnal tanggal TARGET_DATE ---
  let toDelete = [];
  if (!DRY_RUN) {
    toDelete = await fetchJournalsOnDate(token, TARGET_DATE);
  } else {
    console.log("(DRY RUN: tidak login/mengambil data live -- set DRY_RUN=false untuk melihat daftar jurnal tanggal ini secara nyata)");
  }

  if (!DRY_RUN) {
    console.log(`Ditemukan ${toDelete.length} jurnal pada ${TARGET_DATE}:`);
    for (const j of toDelete) {
      console.log(`  #${j.id} [${j.reference_no || "-"}] ${j.description} -- ${formatRupiah(j.amount)} (Debit: ${j.debit_accounts}, Kredit: ${j.credit_accounts})`);
    }
    console.log("");
  }

  // --- 2. Hapus jurnal tanggal TARGET_DATE ---
  const deletedOk = [];
  const deletedFail = [];
  if (!DRY_RUN) {
    for (const j of toDelete) {
      const result = await deleteJournal(token, j.id);
      if (result.ok) {
        deletedOk.push(j);
        process.stdout.write(".");
      } else {
        deletedFail.push({ ...j, error: result.error });
        process.stdout.write("x");
      }
      await sleep(DELAY_MS_BETWEEN_REQUESTS);
    }
    console.log("\n");
  }

  // --- 3. Buat saldo awal baru di NEW_OPENING_DATE ---
  const openingEntries = [
    {
      description: `Saldo awal Kas per ${NEW_OPENING_DATE} (koreksi: 1 Agustus masuk laporan Juli)`,
      debitCode: ACC.KAS,
      creditCode: ACC.MODAL_PEMILIK,
      amount: OPENING_BALANCE_KAS
    },
    {
      description: `Saldo awal Bank per ${NEW_OPENING_DATE} (koreksi: 1 Agustus masuk laporan Juli)`,
      debitCode: ACC.BANK,
      creditCode: ACC.MODAL_PEMILIK,
      amount: OPENING_BALANCE_BANK
    }
  ];

  const createdOk = [];
  const createdFail = [];
  for (const entry of openingEntries) {
    const payload = {
      entry_date: NEW_OPENING_DATE,
      description: entry.description,
      lines: [
        { account_id: DRY_RUN ? entry.debitCode : accountMap.get(entry.debitCode), debit: entry.amount, credit: 0 },
        { account_id: DRY_RUN ? entry.creditCode : accountMap.get(entry.creditCode), debit: 0, credit: entry.amount }
      ]
    };

    if (DRY_RUN) {
      console.log(`[PREVIEW] Akan membuat jurnal: ${entry.description} -- ${formatRupiah(entry.amount)}`);
      continue;
    }

    try {
      await postJournal(token, payload);
      createdOk.push(entry);
      process.stdout.write(".");
    } catch (err) {
      createdFail.push({ ...entry, error: err.message });
      process.stdout.write("x");
    }
    await sleep(DELAY_MS_BETWEEN_REQUESTS);
  }
  if (!DRY_RUN) console.log("\n");

  // --- Ringkasan ---
  console.log("=== RINGKASAN ===");
  if (!DRY_RUN) {
    console.log(`Jurnal ${TARGET_DATE} berhasil dihapus : ${deletedOk.length}`);
    if (deletedFail.length) {
      console.log(`Jurnal ${TARGET_DATE} GAGAL DIHAPUS    : ${deletedFail.length}`);
      for (const f of deletedFail) {
        console.log(`  #${f.id} ${f.description} -> ${f.error}`);
      }
    }
    console.log(`Saldo awal baru berhasil dibuat      : ${createdOk.length}/${openingEntries.length}`);
    if (createdFail.length) {
      console.log("Saldo awal GAGAL dibuat:");
      for (const f of createdFail) {
        console.log(`  ${f.description} -> ${f.error}`);
      }
    }
    console.log("");
    console.log("LANGKAH TERAKHIR (wajib): buka menu Neraca di aplikasi dan pastikan:");
    console.log(`  Kas  = ${formatRupiah(EXPECTED_ENDING_KAS)}`);
    console.log(`  Bank = ${formatRupiah(EXPECTED_ENDING_BANK)}`);
    console.log("Kalau ada baris GAGAL DIHAPUS di atas, itu kemungkinan penyebab utama kalau angkanya belum cocok.");
  } else {
    console.log("Ini baru preview. Jalankan dengan DRY_RUN=false GUDARA_PASSWORD=... untuk eksekusi sungguhan.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
