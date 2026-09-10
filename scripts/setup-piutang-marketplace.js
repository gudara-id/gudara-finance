/**
 * update-piutang-marketplace.js
 *
 * Dipakai BERULANG (mingguan/harian) setelah setup awal selesai.
 * Anda cukup masukkan saldo "pending/untuk dibayar" TERBARU dari dashboard
 * marketplace. Script ini akan:
 *   1. Ambil saldo Piutang Marketplace per platform SAAT INI dari buku Anda
 *      (lewat laporan Neraca /api/reports/balance-sheet).
 *   2. Hitung selisih (delta) = saldo baru (dashboard) - saldo lama (buku).
 *   3. Posting satu jurnal penyesuaian untuk selisih itu saja.
 *      - Selisih naik  -> Debit Piutang, Kredit Penjualan Marketplace
 *      - Selisih turun -> Debit Penjualan Marketplace, Kredit Piutang
 *   4. Kalau selisihnya 0, tidak ada jurnal yang dibuat.
 *
 * CARA PAKAI:
 *   1. Isi KONFIGURASI di bawah: API_BASE_URL, EMAIL, PASSWORD.
 *   2. Setiap mau update, ganti SALDO_TOKOPEDIA_TIKTOK_TERBARU dan
 *      SALDO_SHOPEE_TERBARU sesuai angka yang tampil di dashboard hari itu,
 *      dan ENTRY_DATE ke tanggal hari itu.
 *   3. Jalankan: node update-piutang-marketplace.js
 */

// ============ KONFIGURASI — SESUAIKAN DULU ============
const API_BASE_URL = process.env.GUDARA_API_URL || "https://api.gudara.id";
const LOGIN_EMAIL = process.env.GUDARA_EMAIL || "admin@gudara.id";
const LOGIN_PASSWORD = process.env.GUDARA_PASSWORD || "RahasiaKuat2026!"; // isi password admin/akuntan

// Kode akun yang dibuat lewat setup-piutang-marketplace.js sebelumnya.
const ACCOUNT_CODE_PIUTANG_TOKPED = "1036";
const ACCOUNT_CODE_PIUTANG_SHOPEE = "1037";
const ACCOUNT_CODE_PENJUALAN_MARKETPLACE = "4011";

// >>> GANTI TIAP KALI UPDATE <<<
const ENTRY_DATE = "2026-08-22"; // tanggal hari ini saat cek dashboard
const SALDO_TOKOPEDIA_TIKTOK_TERBARU = 26744387; // angka "Untuk Dibayar" hari ini
const SALDO_SHOPEE_TERBARU = 2280035; // angka "Pending" hari ini
// =======================================================

async function apiFetch(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function login() {
  if (!LOGIN_PASSWORD) {
    throw new Error("Isi dulu LOGIN_PASSWORD (atau set env GUDARA_PASSWORD).");
  }

  const { data } = await apiFetch("/api/auth/login", {
    method: "POST",
    body: { email: LOGIN_EMAIL, password: LOGIN_PASSWORD }
  });

  const token = data.access_token || data.token || data.accessToken || data.jwt;

  if (!token) {
    throw new Error(`Login berhasil tapi token tidak ditemukan: ${JSON.stringify(data)}`);
  }

  console.log(`   Login sukses sebagai ${data.user?.email || LOGIN_EMAIL}`);
  return token;
}

async function getAccounts(token) {
  const { data } = await apiFetch("/api/chart-of-accounts", { token });
  return data;
}

async function getCurrentBalance(token, asOfDate) {
  const { data } = await apiFetch(`/api/reports/balance-sheet?as_of_date=${asOfDate}`, { token });

  const findBalance = (code) => {
    const item = data.assets.find((a) => a.account_code === code);
    return item ? Number(item.ending_balance) : 0;
  };

  return {
    tokopedia: findBalance(ACCOUNT_CODE_PIUTANG_TOKPED),
    shopee: findBalance(ACCOUNT_CODE_PIUTANG_SHOPEE)
  };
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildDeltaLines(accountId, revenueAccountId, delta, label) {
  const amount = round2(Math.abs(delta));

  if (amount === 0) {
    return [];
  }

  if (delta > 0) {
    // Piutang naik -> Debit Piutang, Kredit Penjualan Marketplace
    return [
      {
        account_id: accountId,
        debit: amount,
        credit: 0,
        memo: `Penambahan piutang ${label} (order baru > pencairan)`
      },
      {
        account_id: revenueAccountId,
        debit: 0,
        credit: amount,
        memo: `Pengakuan pendapatan atas penambahan piutang ${label}`
      }
    ];
  }

  // Piutang turun (di luar pencairan normal) -> Debit Penjualan, Kredit Piutang
  return [
    {
      account_id: revenueAccountId,
      debit: amount,
      credit: 0,
      memo: `Koreksi turunnya piutang ${label} (mis. retur/refund)`
    },
    {
      account_id: accountId,
      debit: 0,
      credit: amount,
      memo: `Koreksi turunnya piutang ${label}`
    }
  ];
}

async function main() {
  console.log("1. Login...");
  const token = await login();

  console.log("2. Mengambil akun & saldo piutang saat ini dari Neraca...");
  const accounts = await getAccounts(token);
  const previousDate = new Date(new Date(ENTRY_DATE).getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const currentBalance = await getCurrentBalance(token, previousDate);

  console.log(`   Saldo buku per ${previousDate}:`);
  console.log(`     - Piutang Tokopedia/TikTok Shop: Rp${currentBalance.tokopedia.toLocaleString("id-ID")}`);
  console.log(`     - Piutang Shopee: Rp${currentBalance.shopee.toLocaleString("id-ID")}`);

  const deltaTokped = round2(SALDO_TOKOPEDIA_TIKTOK_TERBARU - currentBalance.tokopedia);
  const deltaShopee = round2(SALDO_SHOPEE_TERBARU - currentBalance.shopee);

  console.log(`   Selisih Tokopedia/TikTok Shop: ${deltaTokped >= 0 ? "+" : ""}Rp${deltaTokped.toLocaleString("id-ID")}`);
  console.log(`   Selisih Shopee: ${deltaShopee >= 0 ? "+" : ""}Rp${deltaShopee.toLocaleString("id-ID")}`);

  if (deltaTokped === 0 && deltaShopee === 0) {
    console.log("Tidak ada perubahan saldo piutang. Tidak ada jurnal yang dibuat.");
    return;
  }

  const piutangTokped = accounts.find((a) => a.account_code === ACCOUNT_CODE_PIUTANG_TOKPED);
  const piutangShopee = accounts.find((a) => a.account_code === ACCOUNT_CODE_PIUTANG_SHOPEE);
  const penjualanMarketplace = accounts.find((a) => a.account_code === ACCOUNT_CODE_PENJUALAN_MARKETPLACE);

  if (!piutangTokped || !piutangShopee || !penjualanMarketplace) {
    throw new Error(
      "Akun piutang/penjualan marketplace tidak ditemukan. Jalankan dulu setup-piutang-marketplace.js."
    );
  }

  const lines = [
    ...buildDeltaLines(piutangTokped.id, penjualanMarketplace.id, deltaTokped, "Tokopedia/TikTok Shop"),
    ...buildDeltaLines(piutangShopee.id, penjualanMarketplace.id, deltaShopee, "Shopee")
  ];

  console.log("3. Memposting jurnal penyesuaian selisih...");

  const { data: journal } = await apiFetch("/api/journals", {
    method: "POST",
    token,
    body: {
      entry_date: ENTRY_DATE,
      description: "Penyesuaian selisih saldo piutang marketplace",
      reference_no: `ADJ-PIUTANG-${ENTRY_DATE.replace(/-/g, "")}`,
      lines
    }
  });

  console.log(`Selesai. Jurnal ${journal.reference_no} berhasil diposting (id: ${journal.id}).`);
}

main().catch((error) => {
  console.error("Gagal menjalankan skrip:", error.message);
  process.exit(1);
});
