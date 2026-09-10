import * as ReportExport from "./reportExport.js";

const ACCOUNT_TYPES = new Set(["asset", "liability", "equity", "revenue", "expense", "cogs"]);
const NORMAL_BALANCES = new Set(["debit", "credit"]);
const ROLES = new Set(["admin", "akuntan", "manajemen", "sales"]);

/**
 * Role "sales": akses HANYA untuk modul Piutang & Utang — boleh melihat,
 * membuat, dan mengedit kontak (customer/supplier), invoice piutang (AR),
 * dan tagihan utang (AP), plus melihat laporan umur piutang/utang (aging)
 * dan Chart of Accounts (read-only, untuk dropdown akun di form).
 * Role ini TIDAK boleh menghapus, membatalkan (void), atau mencatat
 * pembayaran invoice/tagihan — itu tetap khusus admin/akuntan.
 * Semua modul lain (jurnal, laporan keuangan, anggaran, tutup buku, aset,
 * marketplace) TIDAK diberi akses ke role ini.
 */
const encoder = new TextEncoder();

/**
 * Platform marketplace yang saldo piutangnya diinput manual tiap hari dari
 * menu "Piutang Marketplace" (lihat MARKETPLACE_RECEIVABLE_REVENUE_ACCOUNT_CODE
 * di bawah untuk akun pendapatan lawannya). Kalau nambah platform baru,
 * tambah entri di sini dan buat akun asetnya lebih dulu lewat menu Chart of
 * Accounts.
 */
const MARKETPLACE_PLATFORMS = [
  {
    key: "tokopedia_tiktok",
    label: "Tokopedia / TikTok Shop",
    account_code: "1036",
    dashboard_hint: 'Seller Center > Keuangan > Transaksi > tab "Untuk Dibayar"'
  },
  {
    key: "shopee",
    label: "Shopee",
    account_code: "1037",
    dashboard_hint: 'Seller Centre > Keuangan > Penghasilan Saya > kartu "Pending" > Total'
  }
];

const MARKETPLACE_RECEIVABLE_REVENUE_ACCOUNT_CODE = "4011";

/**
 * Akun "Pendapatan Diterima Dimuka" (liabilitas). Piutang marketplace yang
 * belum cair dijurnal ke sini dulu (BUKAN langsung ke akun pendapatan),
 * supaya tidak masuk Laba Rugi sebelum uangnya benar-benar diterima.
 * Baru dipindah ke akun pendapatan (4011) saat penarikan dana diproses
 * lewat /api/marketplace-withdrawals.
 */
const MARKETPLACE_DEFERRED_REVENUE_ACCOUNT_CODE = "2040";

/**
 * Piutang & Utang Umum (di luar marketplace) — mis. invoice wholesale/
 * reseller dan tagihan supplier kain/bahan baku. Akun kontrolnya akun COA
 * yang sudah ada; contacts/ar_invoices/ap_bills cuma buku pembantu di
 * atasnya supaya bisa dibuat laporan umur piutang/utang per pelanggan/
 * supplier.
 */
const AR_RECEIVABLE_ACCOUNT_CODE = "1030"; // Piutang Usaha
const AR_DEFAULT_REVENUE_ACCOUNT_CODE = "4010"; // Penjualan Barang Dagang
const AP_PAYABLE_ACCOUNT_CODE = "2010"; // Utang Usaha
const AP_DEFAULT_EXPENSE_ACCOUNT_CODE = "1040"; // Persediaan Barang Dagang

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const route = `${request.method} ${url.pathname}`;

      if (route === "GET /health" || route === "GET /api/health") {
        return json({ status: "ok" }, { corsHeaders });
      }

      if (route === "POST /api/auth/login") {
        return await handleLogin(request, env, corsHeaders);
      }

      if (route === "POST /api/auth/logout") {
        await requireUser(request, env);
        return json({ data: { message: "Logout successful. Remove the access token from the client." } }, { corsHeaders });
      }

      const user = await requireUser(request, env);

      if (route === "GET /api/auth/me") {
        return json({ data: { user: publicUser(user) } }, { corsHeaders });
      }

      if (route === "PUT /api/auth/me" || route === "PATCH /api/auth/me") {
        return await updateOwnProfile(user, request, env, corsHeaders);
      }

      if (url.pathname === "/api/chart-of-accounts") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "sales"]);
          return await listAccounts(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan"]);
          return await createAccount(request, env, corsHeaders);
        }
      }

      const accountMatch = url.pathname.match(/^\/api\/chart-of-accounts\/(\d+)$/);
      if (accountMatch) {
        authorize(user, ["admin", "akuntan"]);

        if (request.method === "GET") {
          return await getAccount(accountMatch[1], env, corsHeaders);
        }

        if (request.method === "PUT" || request.method === "PATCH") {
          return await updateAccount(accountMatch[1], request, env, corsHeaders);
        }

        if (request.method === "DELETE") {
          return await deleteAccount(accountMatch[1], env, corsHeaders);
        }
      }

      const accountTransactionsExportMatch = url.pathname.match(
        /^\/api\/chart-of-accounts\/(\d+)\/transactions\/export$/
      );
      if (accountTransactionsExportMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await exportAccountTransactions(accountTransactionsExportMatch[1], url, env, corsHeaders);
      }

      const accountTransactionsMatch = url.pathname.match(/^\/api\/chart-of-accounts\/(\d+)\/transactions$/);
      if (accountTransactionsMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await listAccountTransactions(accountTransactionsMatch[1], url, env, corsHeaders);
      }

      if (url.pathname === "/api/journals" && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await createJournal(request, env, user, corsHeaders);
      }

      if (url.pathname === "/api/journals/export" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await exportJournals(url, env, corsHeaders);
      }

      if (url.pathname === "/api/journals" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await listJournals(url, env, corsHeaders);
      }

      if (url.pathname === "/api/journals/tags" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await listJournalTags(env, corsHeaders);
      }

      const journalMatch = url.pathname.match(/^\/api\/journals\/(\d+)$/);
      if (journalMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan"]);
        return await getJournal(journalMatch[1], env, corsHeaders);
      }

      if (journalMatch && (request.method === "PUT" || request.method === "PATCH")) {
        authorize(user, ["admin", "akuntan"]);
        return await updateJournal(journalMatch[1], request, env, corsHeaders);
      }

      if (journalMatch && request.method === "DELETE") {
        authorize(user, ["admin"]);
        return await deleteJournal(journalMatch[1], env, corsHeaders);
      }

      const journalVoidMatch = url.pathname.match(/^\/api\/journals\/(\d+)\/void$/);
      if (journalVoidMatch && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await voidJournal(journalVoidMatch[1], request, env, user, corsHeaders);
      }

      if (url.pathname === "/api/journal-templates" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await listJournalTemplates(url, env, corsHeaders);
      }

      if (url.pathname === "/api/journal-templates" && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await createJournalTemplate(request, env, user, corsHeaders);
      }

      const templateMatch = url.pathname.match(/^\/api\/journal-templates\/(\d+)$/);
      if (templateMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await getJournalTemplate(templateMatch[1], env, corsHeaders);
      }

      if (templateMatch && (request.method === "PUT" || request.method === "PATCH")) {
        authorize(user, ["admin", "akuntan"]);
        return await updateJournalTemplate(templateMatch[1], request, env, corsHeaders);
      }

      if (templateMatch && request.method === "DELETE") {
        authorize(user, ["admin", "akuntan"]);
        return await deleteJournalTemplate(templateMatch[1], env, corsHeaders);
      }

      const templateGenerateMatch = url.pathname.match(/^\/api\/journal-templates\/(\d+)\/generate$/);
      if (templateGenerateMatch && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await generateJournalFromTemplate(templateGenerateMatch[1], request, env, user, corsHeaders);
      }

      if (url.pathname === "/api/reports/income-statement" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await incomeStatement(url, env, corsHeaders);
      }

      if (url.pathname === "/api/reports/balance-sheet" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await balanceSheet(url, env, corsHeaders);
      }

      if (url.pathname === "/api/reports/cash-flow" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await cashFlow(url, env, corsHeaders);
      }

      const exportMatch = url.pathname.match(/^\/api\/reports\/([a-z-]+)\/export$/);
      if (exportMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await exportReport(exportMatch[1], url, env, corsHeaders);
      }

      if (url.pathname === "/api/budgets" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await listBudgets(url, env, corsHeaders);
      }

      if (url.pathname === "/api/budgets" && request.method === "PUT") {
        authorize(user, ["admin", "akuntan"]);
        return await saveBudgets(request, env, user, corsHeaders);
      }

      if (url.pathname === "/api/book-closing" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen"]);
        return await getBookClosingStatus(env, corsHeaders);
      }

      if (url.pathname === "/api/book-closing" && request.method === "POST") {
        authorize(user, ["admin"]);
        return await closeBookPeriod(request, env, user, corsHeaders);
      }

      const bookClosingMatch = url.pathname.match(/^\/api\/book-closing\/(\d{4}-\d{2})$/);
      if (bookClosingMatch && request.method === "DELETE") {
        authorize(user, ["admin"]);
        return await reopenBookPeriod(bookClosingMatch[1], env, corsHeaders);
      }

      if (url.pathname === "/api/fixed-assets") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen"]);
          return await listFixedAssets(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan"]);
          return await createFixedAsset(request, env, corsHeaders);
        }
      }

      const fixedAssetMatch = url.pathname.match(/^\/api\/fixed-assets\/(\d+)$/);
      if (fixedAssetMatch) {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen"]);
          return await getFixedAsset(fixedAssetMatch[1], url, env, corsHeaders);
        }

        if (request.method === "PUT" || request.method === "PATCH") {
          authorize(user, ["admin", "akuntan"]);
          return await updateFixedAsset(fixedAssetMatch[1], request, env, corsHeaders);
        }

        if (request.method === "DELETE") {
          authorize(user, ["admin"]);
          return await deleteFixedAsset(fixedAssetMatch[1], env, corsHeaders);
        }
      }

      if (url.pathname === "/api/marketplace-receivables") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen"]);
          return await getMarketplaceReceivablesCurrent(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan"]);
          return await postMarketplaceReceivablesAdjustment(request, env, user, corsHeaders);
        }
      }

      if (url.pathname === "/api/marketplace-withdrawals") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen"]);
          return await getMarketplaceWithdrawalsForm(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan"]);
          return await postMarketplaceWithdrawal(request, env, user, corsHeaders);
        }
      }

      if (url.pathname === "/api/contacts") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
          return await listContacts(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan", "sales"]);
          return await createContact(request, env, corsHeaders);
        }
      }

      const contactMatch = url.pathname.match(/^\/api\/contacts\/(\d+)$/);
      if (contactMatch) {
        authorize(user, ["admin", "akuntan", "manajemen", "sales"]);

        if (request.method === "GET") {
          return await getContact(contactMatch[1], env, corsHeaders);
        }

        if (request.method === "PUT" || request.method === "PATCH") {
          authorize(user, ["admin", "akuntan", "sales"]);
          return await updateContact(contactMatch[1], request, env, corsHeaders);
        }

        if (request.method === "DELETE") {
          authorize(user, ["admin"]);
          return await deleteContact(contactMatch[1], env, corsHeaders);
        }
      }

      if (url.pathname === "/api/ar-invoices") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
          return await listArInvoices(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan", "sales"]);
          return await createArInvoice(request, env, user, corsHeaders);
        }
      }

      const arInvoiceMatch = url.pathname.match(/^\/api\/ar-invoices\/(\d+)$/);
      if (arInvoiceMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
        return await getArInvoice(arInvoiceMatch[1], env, corsHeaders);
      }
      if (arInvoiceMatch && (request.method === "PUT" || request.method === "PATCH")) {
        authorize(user, ["admin", "akuntan", "sales"]);
        return await updateArInvoice(arInvoiceMatch[1], request, env, user, corsHeaders);
      }
      if (arInvoiceMatch && request.method === "DELETE") {
        authorize(user, ["admin"]);
        return await deleteArInvoice(arInvoiceMatch[1], request, env, user, corsHeaders);
      }

      const arInvoiceExportMatch = url.pathname.match(/^\/api\/ar-invoices\/(\d+)\/export$/);
      if (arInvoiceExportMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
        return await exportArInvoice(arInvoiceExportMatch[1], env, corsHeaders);
      }

      const arInvoicePaymentMatch = url.pathname.match(/^\/api\/ar-invoices\/(\d+)\/payments$/);
      if (arInvoicePaymentMatch && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await createArInvoicePayment(arInvoicePaymentMatch[1], request, env, user, corsHeaders);
      }

      const arInvoiceVoidMatch = url.pathname.match(/^\/api\/ar-invoices\/(\d+)\/void$/);
      if (arInvoiceVoidMatch && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await voidArInvoice(arInvoiceVoidMatch[1], request, env, user, corsHeaders);
      }

      if (url.pathname === "/api/ap-bills") {
        if (request.method === "GET") {
          authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
          return await listApBills(url, env, corsHeaders);
        }

        if (request.method === "POST") {
          authorize(user, ["admin", "akuntan", "sales"]);
          return await createApBill(request, env, user, corsHeaders);
        }
      }

      const apBillMatch = url.pathname.match(/^\/api\/ap-bills\/(\d+)$/);
      if (apBillMatch && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
        return await getApBill(apBillMatch[1], env, corsHeaders);
      }
      if (apBillMatch && (request.method === "PUT" || request.method === "PATCH")) {
        authorize(user, ["admin", "akuntan", "sales"]);
        return await updateApBill(apBillMatch[1], request, env, user, corsHeaders);
      }
      if (apBillMatch && request.method === "DELETE") {
        authorize(user, ["admin"]);
        return await deleteApBill(apBillMatch[1], request, env, user, corsHeaders);
      }

      const apBillPaymentMatch = url.pathname.match(/^\/api\/ap-bills\/(\d+)\/payments$/);
      if (apBillPaymentMatch && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await createApBillPayment(apBillPaymentMatch[1], request, env, user, corsHeaders);
      }

      const apBillVoidMatch = url.pathname.match(/^\/api\/ap-bills\/(\d+)\/void$/);
      if (apBillVoidMatch && request.method === "POST") {
        authorize(user, ["admin", "akuntan"]);
        return await voidApBill(apBillVoidMatch[1], request, env, user, corsHeaders);
      }

      if (url.pathname === "/api/reports/aging" && request.method === "GET") {
        authorize(user, ["admin", "akuntan", "manajemen", "sales"]);
        return await agingReport(url, env, corsHeaders);
      }

      throw httpError(404, "Route not found");
    } catch (error) {
      return errorResponse(error, corsHeaders);
    }
  }
};

async function updateOwnProfile(user, request, env, corsHeaders) {
  const body = await readJson(request);
  const errors = {};

  const nextFullName = body.full_name !== undefined ? String(body.full_name).trim() : user.full_name;
  const nextEmail = body.email !== undefined ? String(body.email).trim() : user.email;
  const wantsPasswordChange = body.new_password !== undefined && body.new_password !== "";

  if (!nextFullName) {
    errors.full_name = "Nama lengkap tidak boleh kosong";
  }

  if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    errors.email = "Email tidak valid";
  }

  if (wantsPasswordChange) {
    if (!body.current_password) {
      errors.current_password = "Masukkan password saat ini untuk mengubah password";
    }

    if (String(body.new_password).length < 10) {
      errors.new_password = "Password baru minimal 10 karakter";
    }
  }

  if (Object.keys(errors).length > 0) {
    throw httpError(422, Object.values(errors)[0], errors);
  }

  const currentRow = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ? LIMIT 1")
    .bind(user.id)
    .first();

  if (!currentRow) {
    throw httpError(404, "User not found");
  }

  let nextPasswordHash = currentRow.password_hash;

  if (wantsPasswordChange) {
    const isCurrentPasswordValid = await verifyPassword(body.current_password, currentRow.password_hash);

    if (!isCurrentPasswordValid) {
      throw httpError(422, "Password saat ini salah", { current_password: "Password saat ini salah" });
    }

    nextPasswordHash = await hashPassword(String(body.new_password));
  }

  let updatedRow;
  try {
    updatedRow = await env.DB.prepare(
      `UPDATE users
       SET full_name = ?, email = ?, password_hash = ?, updated_at = datetime('now')
       WHERE id = ?
       RETURNING id, full_name, email, role`
    )
      .bind(nextFullName, nextEmail, nextPasswordHash, user.id)
      .first();
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw httpError(422, "Email sudah digunakan", { email: "Email sudah digunakan" });
    }
    throw error;
  }

  return json({ data: { user: publicUser(updatedRow) } }, { corsHeaders });
}

async function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);

  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function handleLogin(request, env, corsHeaders) {
  const body = await readJson(request);

  if (!body.email || !body.password) {
    throw httpError(422, "Invalid login payload", {
      email: "email is required",
      password: "password is required"
    });
  }

  const user = await env.DB.prepare(
    `SELECT id, full_name, email, password_hash, role, is_active
     FROM users
     WHERE lower(email) = lower(?)
     LIMIT 1`
  )
    .bind(body.email)
    .first();

  if (!user || !Number(user.is_active)) {
    throw httpError(401, "Invalid email or password");
  }

  const isPasswordValid = await verifyPassword(body.password, user.password_hash);

  if (!isPasswordValid) {
    throw httpError(401, "Invalid email or password");
  }

  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(user.id)
    .run();

  const expiresIn = env.JWT_EXPIRES_IN || "8h";
  const token = await signJwt(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email
    },
    env.JWT_SECRET,
    expiresIn
  );

  return json(
    {
      data: {
        access_token: token,
        token_type: "Bearer",
        expires_in: expiresIn,
        user: publicUser(user)
      }
    },
    { corsHeaders }
  );
}

async function listAccounts(url, env, corsHeaders) {
  const accountType = url.searchParams.get("account_type");
  const isActive = url.searchParams.get("is_active");
  const conditions = [];
  const values = [];

  if (accountType) {
    conditions.push("account_type = ?");
    values.push(accountType);
  }

  if (isActive !== null) {
    conditions.push("is_active = ?");
    values.push(isActive === "true" ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `SELECT id, account_code, account_name, account_type, normal_balance, parent_account_id, is_active, created_at, updated_at
     FROM chart_of_accounts
     ${where}
     ORDER BY account_code ASC`
  )
    .bind(...values)
    .all();

  return json({ data: result.results.map(normalizeBooleans) }, { corsHeaders });
}

async function getAccount(id, env, corsHeaders) {
  const account = await findAccountById(env, id);

  if (!account) {
    throw httpError(404, "Chart of account not found");
  }

  return json({ data: normalizeBooleans(account) }, { corsHeaders });
}

async function createAccount(request, env, corsHeaders) {
  const payload = await readJson(request);
  const errors = validateAccountPayload(payload);

  if (errors) {
    throw httpError(422, "Invalid chart of account payload", errors);
  }

  const account = await env.DB.prepare(
    `INSERT INTO chart_of_accounts (account_code, account_name, account_type, normal_balance, parent_account_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      String(payload.account_code).trim(),
      String(payload.account_name).trim(),
      payload.account_type,
      payload.normal_balance,
      payload.parent_account_id || null,
      payload.is_active === undefined ? 1 : payload.is_active ? 1 : 0
    )
    .first();

  return json({ data: normalizeBooleans(account) }, { status: 201, corsHeaders });
}

async function updateAccount(id, request, env, corsHeaders) {
  const current = await findAccountById(env, id);

  if (!current) {
    throw httpError(404, "Chart of account not found");
  }

  const payload = await readJson(request);
  const errors = validateAccountPayload(payload, true);

  if (errors) {
    throw httpError(422, "Invalid chart of account payload", errors);
  }

  const account = await env.DB.prepare(
    `UPDATE chart_of_accounts
     SET account_code = ?, account_name = ?, account_type = ?, normal_balance = ?,
         parent_account_id = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`
  )
    .bind(
      payload.account_code !== undefined ? String(payload.account_code).trim() : current.account_code,
      payload.account_name !== undefined ? String(payload.account_name).trim() : current.account_name,
      payload.account_type !== undefined ? payload.account_type : current.account_type,
      payload.normal_balance !== undefined ? payload.normal_balance : current.normal_balance,
      payload.parent_account_id !== undefined ? payload.parent_account_id : current.parent_account_id,
      payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : current.is_active,
      id
    )
    .first();

  return json({ data: normalizeBooleans(account) }, { corsHeaders });
}

async function deleteAccount(id, env, corsHeaders) {
  const result = await env.DB.prepare("DELETE FROM chart_of_accounts WHERE id = ?").bind(id).run();

  if (!result.meta.changes) {
    throw httpError(404, "Chart of account not found");
  }

  return new Response(null, { status: 204, headers: corsHeaders });
}

async function getAccountLedgerData(accountId, url, env) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  validatePeriod(startDate, endDate);

  const account = await findAccountById(env, accountId);
  if (!account) {
    throw httpError(404, "Chart of account not found");
  }

  const result = await env.DB.prepare(
    `SELECT
       je.id AS journal_entry_id,
       je.entry_date,
       je.reference_no,
       je.description AS entry_description,
       je.status,
       jl.id AS line_id,
       jl.memo,
       jl.debit,
       jl.credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.account_id = ?
       AND je.status = 'posted'
       AND je.entry_date BETWEEN ? AND ?
     ORDER BY je.entry_date ASC, je.id ASC, jl.id ASC`
  )
    .bind(accountId, startDate, endDate)
    .all();

  const isDebitNormal = account.normal_balance === "debit";
  let runningBalance = 0;

  const transactions = result.results.map((row) => {
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    runningBalance = roundMoney(runningBalance + (isDebitNormal ? debit - credit : credit - debit));

    return {
      journal_entry_id: row.journal_entry_id,
      entry_date: row.entry_date,
      reference_no: row.reference_no,
      description: row.entry_description,
      memo: row.memo,
      debit,
      credit,
      running_balance: runningBalance
    };
  });

  const totals = transactions.reduce(
    (acc, transaction) => {
      acc.total_debit = roundMoney(acc.total_debit + transaction.debit);
      acc.total_credit = roundMoney(acc.total_credit + transaction.credit);
      return acc;
    },
    { total_debit: 0, total_credit: 0 }
  );

  const meta = {
    account_id: account.id,
    account_code: account.account_code,
    account_name: account.account_name,
    account_type: account.account_type,
    normal_balance: account.normal_balance,
    period: { start_date: startDate, end_date: endDate },
    count: transactions.length,
    ...totals,
    ending_balance: runningBalance
  };

  return { transactions, meta };
}

async function listAccountTransactions(accountId, url, env, corsHeaders) {
  const { transactions, meta } = await getAccountLedgerData(accountId, url, env);
  return json({ data: transactions, meta }, { corsHeaders });
}

async function exportAccountTransactions(accountId, url, env, corsHeaders) {
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();

  if (format !== "xlsx" && format !== "pdf") {
    throw httpError(422, "Invalid export format", { format: "format must be xlsx or pdf" });
  }

  const { transactions, meta } = await getAccountLedgerData(accountId, url, env);

  const body =
    format === "pdf"
      ? await ReportExport.accountLedgerPdf(transactions, meta)
      : ReportExport.accountLedgerXlsx(transactions, meta);

  const filename = ReportExport.makeFileName(`buku-besar-${meta.account_code}`, format);

  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": ReportExport.contentTypeFor(format),
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

const ASSET_STATUSES = new Set(["aktif", "nonaktif", "dijual", "rusak"]);

// Menghitung penyusutan garis lurus (straight-line) & nilai buku per tanggal `asOfDate`.
function computeAssetDepreciation(asset, asOfDate) {
  const cost = Number(asset.acquisition_cost) || 0;
  const residual = Number(asset.residual_value) || 0;
  const usefulLifeMonths = Number(asset.useful_life_months) || 0;
  const depreciableBase = Math.max(cost - residual, 0);
  const monthlyDepreciation = usefulLifeMonths > 0 ? depreciableBase / usefulLifeMonths : 0;

  const acquired = new Date(`${asset.acquisition_date}T00:00:00Z`);
  const asOf = new Date(`${asOfDate}T00:00:00Z`);

  let monthsElapsed = 0;
  if (asOf > acquired) {
    monthsElapsed =
      (asOf.getUTCFullYear() - acquired.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - acquired.getUTCMonth());
    if (asOf.getUTCDate() < acquired.getUTCDate()) {
      monthsElapsed -= 1;
    }
    monthsElapsed = Math.max(0, monthsElapsed);
  }
  monthsElapsed = Math.min(monthsElapsed, usefulLifeMonths);

  const accumulatedDepreciation = roundMoney(Math.min(monthlyDepreciation * monthsElapsed, depreciableBase));
  const bookValue = roundMoney(cost - accumulatedDepreciation);
  const monthsRemaining = Math.max(usefulLifeMonths - monthsElapsed, 0);

  return {
    monthly_depreciation: roundMoney(monthlyDepreciation),
    months_elapsed: monthsElapsed,
    months_remaining: monthsRemaining,
    accumulated_depreciation: accumulatedDepreciation,
    book_value: bookValue,
    is_fully_depreciated: accumulatedDepreciation >= depreciableBase && depreciableBase > 0
  };
}

function serializeFixedAsset(asset, asOfDate) {
  return {
    id: asset.id,
    asset_code: asset.asset_code,
    asset_name: asset.asset_name,
    account_id: asset.account_id,
    account_code: asset.account_code,
    account_name: asset.account_name,
    quantity: asset.quantity,
    acquisition_date: asset.acquisition_date,
    acquisition_cost: Number(asset.acquisition_cost),
    residual_value: Number(asset.residual_value),
    useful_life_months: asset.useful_life_months,
    location: asset.location,
    status: asset.status,
    notes: asset.notes,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    ...computeAssetDepreciation(asset, asOfDate)
  };
}

function validateFixedAssetPayload(payload, partial = false) {
  const errors = {};

  if ((!partial || payload.asset_code !== undefined) && (!payload.asset_code || String(payload.asset_code).trim() === "")) {
    errors.asset_code = "asset_code is required";
  }

  if ((!partial || payload.asset_name !== undefined) && (!payload.asset_name || String(payload.asset_name).trim() === "")) {
    errors.asset_name = "asset_name is required";
  }

  if (!partial || payload.account_id !== undefined) {
    if (!payload.account_id) {
      errors.account_id = "account_id is required";
    }
  }

  if (!partial || payload.acquisition_date !== undefined) {
    if (!isValidDate(payload.acquisition_date)) {
      errors.acquisition_date = "acquisition_date is required in YYYY-MM-DD format";
    }
  }

  if (!partial || payload.acquisition_cost !== undefined) {
    const cost = parseMoney(payload.acquisition_cost ?? 0);
    if (cost === null || cost < 0) {
      errors.acquisition_cost = "acquisition_cost must be zero or a positive amount";
    }
  }

  if (payload.residual_value !== undefined) {
    const residual = parseMoney(payload.residual_value ?? 0);
    if (residual === null || residual < 0) {
      errors.residual_value = "residual_value must be zero or a positive amount";
    }
  }

  if (!partial || payload.useful_life_months !== undefined) {
    const months = Number(payload.useful_life_months);
    if (!Number.isFinite(months) || months <= 0) {
      errors.useful_life_months = "useful_life_months must be a positive number";
    }
  }

  if (payload.quantity !== undefined) {
    const quantity = Number(payload.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.quantity = "quantity must be a positive number";
    }
  }

  if (payload.status !== undefined && !ASSET_STATUSES.has(payload.status)) {
    errors.status = "status must be one of aktif, nonaktif, dijual, rusak";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

async function listFixedAssets(url, env, corsHeaders) {
  const status = url.searchParams.get("status");
  const accountId = url.searchParams.get("account_id");
  const search = url.searchParams.get("search");
  const asOfDate = isValidDate(url.searchParams.get("as_of_date")) ? url.searchParams.get("as_of_date") : todayDate();

  const conditions = [];
  const values = [];

  if (status) {
    conditions.push("fa.status = ?");
    values.push(status);
  }

  if (accountId) {
    conditions.push("fa.account_id = ?");
    values.push(accountId);
  }

  if (search) {
    conditions.push("(fa.asset_code LIKE ? OR fa.asset_name LIKE ?)");
    values.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await env.DB.prepare(
    `SELECT fa.*, coa.account_code AS account_code, coa.account_name AS account_name
     FROM fixed_assets fa
     JOIN chart_of_accounts coa ON coa.id = fa.account_id
     ${where}
     ORDER BY fa.asset_code ASC`
  )
    .bind(...values)
    .all();

  const data = result.results.map((asset) => serializeFixedAsset(asset, asOfDate));

  const summary = data.reduce(
    (acc, asset) => {
      acc.total_acquisition_cost = roundMoney(acc.total_acquisition_cost + asset.acquisition_cost);
      acc.total_accumulated_depreciation = roundMoney(acc.total_accumulated_depreciation + asset.accumulated_depreciation);
      acc.total_book_value = roundMoney(acc.total_book_value + asset.book_value);
      return acc;
    },
    { total_acquisition_cost: 0, total_accumulated_depreciation: 0, total_book_value: 0 }
  );

  return json({ data, meta: { as_of_date: asOfDate, count: data.length, ...summary } }, { corsHeaders });
}

async function getFixedAsset(id, url, env, corsHeaders) {
  const asOfDate = isValidDate(url.searchParams.get("as_of_date")) ? url.searchParams.get("as_of_date") : todayDate();
  const asset = await findFixedAssetById(env, id);

  if (!asset) {
    throw httpError(404, "Fixed asset not found");
  }

  return json({ data: serializeFixedAsset(asset, asOfDate) }, { corsHeaders });
}

async function createFixedAsset(request, env, corsHeaders) {
  const payload = await readJson(request);
  const errors = validateFixedAssetPayload(payload);

  if (errors) {
    throw httpError(422, "Invalid fixed asset payload", errors);
  }

  const account = await findAccountById(env, payload.account_id);
  if (!account || account.account_type !== "asset") {
    throw httpError(422, "Invalid fixed asset payload", { account_id: "account_id must reference an asset-type account" });
  }

  let created;
  try {
    created = await env.DB.prepare(
      `INSERT INTO fixed_assets
         (asset_code, asset_name, account_id, quantity, acquisition_date, acquisition_cost, residual_value, useful_life_months, location, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
      .bind(
        String(payload.asset_code).trim(),
        String(payload.asset_name).trim(),
        payload.account_id,
        payload.quantity ? Number(payload.quantity) : 1,
        payload.acquisition_date,
        parseMoney(payload.acquisition_cost),
        payload.residual_value !== undefined ? parseMoney(payload.residual_value) : 0,
        Number(payload.useful_life_months),
        payload.location ? String(payload.location).trim() : null,
        payload.status && ASSET_STATUSES.has(payload.status) ? payload.status : "aktif",
        payload.notes ? String(payload.notes).trim() : null
      )
      .first();
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) {
      throw httpError(409, "Kode aset sudah digunakan", { asset_code: "asset_code must be unique" });
    }
    throw error;
  }

  const asset = { ...created, account_code: account.account_code, account_name: account.account_name };
  return json({ data: serializeFixedAsset(asset, todayDate()) }, { status: 201, corsHeaders });
}

async function updateFixedAsset(id, request, env, corsHeaders) {
  const current = await findFixedAssetById(env, id);

  if (!current) {
    throw httpError(404, "Fixed asset not found");
  }

  const payload = await readJson(request);
  const errors = validateFixedAssetPayload(payload, true);

  if (errors) {
    throw httpError(422, "Invalid fixed asset payload", errors);
  }

  let accountId = current.account_id;
  if (payload.account_id !== undefined) {
    const account = await findAccountById(env, payload.account_id);
    if (!account || account.account_type !== "asset") {
      throw httpError(422, "Invalid fixed asset payload", { account_id: "account_id must reference an asset-type account" });
    }
    accountId = payload.account_id;
  }

  let updated;
  try {
    updated = await env.DB.prepare(
      `UPDATE fixed_assets
       SET asset_code = ?, asset_name = ?, account_id = ?, quantity = ?, acquisition_date = ?,
           acquisition_cost = ?, residual_value = ?, useful_life_months = ?, location = ?, status = ?, notes = ?,
           updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`
    )
      .bind(
        payload.asset_code !== undefined ? String(payload.asset_code).trim() : current.asset_code,
        payload.asset_name !== undefined ? String(payload.asset_name).trim() : current.asset_name,
        accountId,
        payload.quantity !== undefined ? Number(payload.quantity) : current.quantity,
        payload.acquisition_date !== undefined ? payload.acquisition_date : current.acquisition_date,
        payload.acquisition_cost !== undefined ? parseMoney(payload.acquisition_cost) : current.acquisition_cost,
        payload.residual_value !== undefined ? parseMoney(payload.residual_value) : current.residual_value,
        payload.useful_life_months !== undefined ? Number(payload.useful_life_months) : current.useful_life_months,
        payload.location !== undefined ? (payload.location ? String(payload.location).trim() : null) : current.location,
        payload.status !== undefined ? payload.status : current.status,
        payload.notes !== undefined ? (payload.notes ? String(payload.notes).trim() : null) : current.notes,
        id
      )
      .first();
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) {
      throw httpError(409, "Kode aset sudah digunakan", { asset_code: "asset_code must be unique" });
    }
    throw error;
  }

  const account = await findAccountById(env, accountId);
  const asset = { ...updated, account_code: account.account_code, account_name: account.account_name };
  return json({ data: serializeFixedAsset(asset, todayDate()) }, { corsHeaders });
}

async function deleteFixedAsset(id, env, corsHeaders) {
  const result = await env.DB.prepare("DELETE FROM fixed_assets WHERE id = ?").bind(id).run();

  if (!result.meta.changes) {
    throw httpError(404, "Fixed asset not found");
  }

  return new Response(null, { status: 204, headers: corsHeaders });
}

async function findFixedAssetById(env, id) {
  return env.DB.prepare(
    `SELECT fa.*, coa.account_code AS account_code, coa.account_name AS account_name
     FROM fixed_assets fa
     JOIN chart_of_accounts coa ON coa.id = fa.account_id
     WHERE fa.id = ?`
  )
    .bind(id)
    .first();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function previousDay(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function findAccountByCode(env, code) {
  return env.DB.prepare(
    `SELECT id, account_code, account_name, account_type, normal_balance, parent_account_id, is_active, created_at, updated_at
     FROM chart_of_accounts
     WHERE account_code = ?`
  )
    .bind(code)
    .first();
}

/**
 * Saldo satu akun (debit - credit) dari semua jurnal posted sampai tanggal
 * tertentu (inklusif) — perhitungan yang sama seperti Neraca, tapi untuk
 * satu akun saja.
 */
async function getAccountBalanceAsOf(env, accountId, asOfDate) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(jl.debit), 0) AS total_debit, COALESCE(SUM(jl.credit), 0) AS total_credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.status = 'posted' AND je.entry_date <= ? AND jl.account_id = ?`
  )
    .bind(asOfDate, accountId)
    .first();

  return roundMoney(Number(row?.total_debit || 0) - Number(row?.total_credit || 0));
}

/**
 * Saldo piutang marketplace saat ini per platform, dipakai untuk mengisi
 * form input di halaman "Piutang Marketplace" sebelum admin memasukkan
 * angka terbaru dari dashboard.
 */
async function getMarketplaceReceivablesCurrent(url, env, corsHeaders) {
  const asOfDate = url.searchParams.get("as_of_date") || todayDate();

  if (!isValidDate(asOfDate)) {
    throw httpError(422, "Invalid query", { as_of_date: "as_of_date must be in YYYY-MM-DD format" });
  }

  const deferredRevenueAccount = await findAccountByCode(env, MARKETPLACE_DEFERRED_REVENUE_ACCOUNT_CODE);
  const platforms = [];

  for (const platform of MARKETPLACE_PLATFORMS) {
    const account = await findAccountByCode(env, platform.account_code);

    if (!account) {
      platforms.push({ ...platform, account_id: null, current_balance: null });
      continue;
    }

    const currentBalance = await getAccountBalanceAsOf(env, account.id, asOfDate);

    platforms.push({
      key: platform.key,
      label: platform.label,
      dashboard_hint: platform.dashboard_hint,
      account_code: platform.account_code,
      account_id: account.id,
      current_balance: currentBalance
    });
  }

  return noStoreJson(
    {
      data: {
        as_of_date: asOfDate,
        platforms,
        revenue_account_ready: Boolean(deferredRevenueAccount && Number(deferredRevenueAccount.is_active))
      }
    },
    corsHeaders
  );
}

/**
 * Terima saldo terbaru per platform (yang diketik admin dari dashboard
 * marketplace), hitung selisih (delta) terhadap saldo di buku per tanggal
 * sebelumnya, lalu posting SATU jurnal berisi selisih tsb untuk platform
 * yang berubah saja. Platform yang tidak diisi di payload dilewati.
 *
 * Selisih ini dijurnal ke akun "Pendapatan Diterima Dimuka" (liabilitas),
 * BUKAN ke akun pendapatan — supaya pesanan yang belum cair tidak dulu
 * masuk Laba Rugi. Pendapatan baru diakui saat dana benar-benar cair,
 * lewat endpoint /api/marketplace-withdrawals.
 */
async function postMarketplaceReceivablesAdjustment(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const entryDate = payload.entry_date;

  if (!isValidDate(entryDate)) {
    throw httpError(422, "Invalid payload", { entry_date: "entry_date is required in YYYY-MM-DD format" });
  }

  const deferredRevenueAccount = await findAccountByCode(env, MARKETPLACE_DEFERRED_REVENUE_ACCOUNT_CODE);

  if (!deferredRevenueAccount || !Number(deferredRevenueAccount.is_active)) {
    throw httpError(422, "Akun Pendapatan Diterima Dimuka belum tersedia", {
      account_code: `Buat dulu akun ${MARKETPLACE_DEFERRED_REVENUE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const comparisonDate = previousDay(entryDate);
  const errors = {};
  const breakdown = [];
  const lines = [];

  for (const platform of MARKETPLACE_PLATFORMS) {
    const rawValue = payload[platform.key];

    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
      continue;
    }

    const latestBalance = parseMoney(rawValue);

    if (latestBalance === null || latestBalance < 0) {
      errors[platform.key] = "harus berupa angka valid, tidak negatif, maksimal 2 desimal";
      continue;
    }

    const account = await findAccountByCode(env, platform.account_code);

    if (!account || !Number(account.is_active)) {
      errors[platform.key] = `Akun ${platform.account_code} (${platform.label}) belum tersedia`;
      continue;
    }

    const previousBalance = await getAccountBalanceAsOf(env, account.id, comparisonDate);
    const delta = roundMoney(latestBalance - previousBalance);

    breakdown.push({
      platform_key: platform.key,
      label: platform.label,
      account_code: platform.account_code,
      previous_balance: previousBalance,
      latest_balance: latestBalance,
      delta
    });

    if (delta === 0) {
      continue;
    }

    if (delta > 0) {
      lines.push({
        account_id: account.id,
        debit_amount: delta,
        credit_amount: 0,
        memo: `Penambahan piutang ${platform.label}`
      });
      lines.push({
        account_id: deferredRevenueAccount.id,
        debit_amount: 0,
        credit_amount: delta,
        memo: `Pendapatan diterima dimuka atas penambahan piutang ${platform.label} (belum cair)`
      });
    } else {
      // Piutang turun di luar penarikan dana (mis. retur/pesanan batal
      // sebelum sempat cair). Penarikan dana yang sah TIDAK lewat sini,
      // tapi lewat endpoint /api/marketplace-withdrawals.
      const amount = Math.abs(delta);
      lines.push({
        account_id: deferredRevenueAccount.id,
        debit_amount: amount,
        credit_amount: 0,
        memo: `Koreksi turunnya piutang ${platform.label} (mis. retur/pesanan batal, bukan pencairan)`
      });
      lines.push({
        account_id: account.id,
        debit_amount: 0,
        credit_amount: amount,
        memo: `Koreksi turunnya piutang ${platform.label}`
      });
    }
  }

  if (Object.keys(errors).length > 0) {
    throw httpError(422, "Invalid payload", errors);
  }

  if (lines.length === 0) {
    return json(
      { data: { journal: null, breakdown, message: "Tidak ada perubahan saldo piutang. Tidak ada jurnal yang dibuat." } },
      { corsHeaders }
    );
  }

  const referenceNo = `ADJ-PIUTANG-${entryDate.replace(/-/g, "")}`;
  const description = "Penyesuaian selisih saldo piutang marketplace";

  let entry;
  try {
    entry = await env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?)
       RETURNING *`
    )
      .bind(entryDate, referenceNo, description, user.id, user.id)
      .first();
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw httpError(409, "Sudah ada penyesuaian piutang marketplace untuk tanggal ini", {
        entry_date: `Sudah ada jurnal ${referenceNo}. Edit jurnal itu dari menu Jurnal, atau pilih tanggal lain.`
      });
    }
    throw error;
  }

  const statements = lines.map((line, index) =>
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(entry.id, line.account_id, index + 1, line.memo || null, line.debit_amount, line.credit_amount)
  );

  await env.DB.batch(statements);

  const lineRows = await env.DB.prepare(
    `SELECT jl.*, coa.account_code, coa.account_name, coa.account_type
     FROM journal_lines jl
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE jl.journal_entry_id = ?
     ORDER BY jl.line_no ASC`
  )
    .bind(entry.id)
    .all();

  return json(
    {
      data: {
        journal: { ...entry, lines: lineRows.results },
        breakdown,
        message: null
      }
    },
    { status: 201, corsHeaders }
  );
}

/**
 * Saldo piutang & rekening bank/kas yang tersedia, dipakai untuk mengisi
 * form "Penarikan Dana Marketplace" (pilihan akun tujuan pencairan).
 */
async function getMarketplaceWithdrawalsForm(url, env, corsHeaders) {
  const asOfDate = url.searchParams.get("as_of_date") || todayDate();

  if (!isValidDate(asOfDate)) {
    throw httpError(422, "Invalid query", { as_of_date: "as_of_date must be in YYYY-MM-DD format" });
  }

  const platforms = [];

  for (const platform of MARKETPLACE_PLATFORMS) {
    const account = await findAccountByCode(env, platform.account_code);

    if (!account) {
      platforms.push({ ...platform, account_id: null, current_balance: null });
      continue;
    }

    const currentBalance = await getAccountBalanceAsOf(env, account.id, asOfDate);

    platforms.push({
      key: platform.key,
      label: platform.label,
      dashboard_hint: platform.dashboard_hint,
      account_code: platform.account_code,
      account_id: account.id,
      current_balance: currentBalance
    });
  }

  const cashAccountsResult = await env.DB.prepare(
    `SELECT id, account_code, account_name
     FROM chart_of_accounts
     WHERE account_type = 'asset' AND is_active = 1 AND account_code IN ('1010', '1020')
     ORDER BY account_code ASC`
  ).all();

  return noStoreJson(
    {
      data: {
        as_of_date: asOfDate,
        platforms,
        destination_accounts: cashAccountsResult.results
      }
    },
    corsHeaders
  );
}

/**
 * Catat penarikan dana (pencairan) dari satu platform marketplace ke satu
 * akun kas/bank. Ini SATU-SATUNYA jalan yang boleh mengurangi piutang
 * marketplace karena pencairan, dan satu-satunya jalan pendapatan
 * marketplace (4011) diakui di Laba Rugi. Satu jurnal, 4 baris:
 *   Debit  Kas/Bank tujuan            sejumlah dana cair
 *   Kredit Piutang platform           sejumlah dana cair
 *   Debit  Pendapatan Diterima Dimuka sejumlah dana cair
 *   Kredit Penjualan Marketplace      sejumlah dana cair
 */
async function postMarketplaceWithdrawal(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const entryDate = payload.entry_date;

  if (!isValidDate(entryDate)) {
    throw httpError(422, "Invalid payload", { entry_date: "entry_date is required in YYYY-MM-DD format" });
  }

  const platform = MARKETPLACE_PLATFORMS.find((item) => item.key === payload.platform_key);

  if (!platform) {
    throw httpError(422, "Invalid payload", {
      platform_key: `platform_key harus salah satu dari: ${MARKETPLACE_PLATFORMS.map((item) => item.key).join(", ")}`
    });
  }

  const amount = parseMoney(payload.amount);

  if (amount === null || amount <= 0) {
    throw httpError(422, "Invalid payload", { amount: "amount harus angka lebih dari 0, maksimal 2 desimal" });
  }

  if (!payload.destination_account_id) {
    throw httpError(422, "Invalid payload", { destination_account_id: "destination_account_id wajib diisi" });
  }

  const receivableAccount = await findAccountByCode(env, platform.account_code);

  if (!receivableAccount || !Number(receivableAccount.is_active)) {
    throw httpError(422, "Akun piutang platform belum tersedia", {
      account_code: `Akun ${platform.account_code} (${platform.label}) tidak ditemukan atau nonaktif`
    });
  }

  const deferredRevenueAccount = await findAccountByCode(env, MARKETPLACE_DEFERRED_REVENUE_ACCOUNT_CODE);

  if (!deferredRevenueAccount || !Number(deferredRevenueAccount.is_active)) {
    throw httpError(422, "Akun Pendapatan Diterima Dimuka belum tersedia", {
      account_code: `Buat dulu akun ${MARKETPLACE_DEFERRED_REVENUE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const revenueAccount = await findAccountByCode(env, MARKETPLACE_RECEIVABLE_REVENUE_ACCOUNT_CODE);

  if (!revenueAccount || !Number(revenueAccount.is_active)) {
    throw httpError(422, "Akun Penjualan Marketplace belum tersedia", {
      account_code: `Buat dulu akun ${MARKETPLACE_RECEIVABLE_REVENUE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const destinationAccount = await findAccountById(env, payload.destination_account_id);

  if (!destinationAccount || !Number(destinationAccount.is_active) || destinationAccount.account_type !== "asset") {
    throw httpError(422, "Invalid payload", {
      destination_account_id: "Akun tujuan harus akun kas/bank (asset) yang aktif"
    });
  }

  const currentReceivableBalance = await getAccountBalanceAsOf(env, receivableAccount.id, previousDay(entryDate));

  if (amount > currentReceivableBalance) {
    throw httpError(422, "Invalid payload", {
      amount: `Jumlah pencairan (Rp${amount.toLocaleString("id-ID")}) melebihi saldo piutang ${platform.label} saat ini (Rp${currentReceivableBalance.toLocaleString("id-ID")}). Update dulu saldo piutang di menu Piutang Marketplace kalau memang sudah ada order baru.`
    });
  }

  const description = `Penarikan dana ${platform.label} ke ${destinationAccount.account_name}`;

  const lines = [
    {
      account_id: destinationAccount.id,
      debit_amount: amount,
      credit_amount: 0,
      memo: `Dana cair dari ${platform.label}`
    },
    {
      account_id: receivableAccount.id,
      debit_amount: 0,
      credit_amount: amount,
      memo: `Pelunasan piutang ${platform.label} (dana sudah cair)`
    },
    {
      account_id: deferredRevenueAccount.id,
      debit_amount: amount,
      credit_amount: 0,
      memo: `Pendapatan ${platform.label} diakui karena dana sudah cair`
    },
    {
      account_id: revenueAccount.id,
      debit_amount: 0,
      credit_amount: amount,
      memo: `Pengakuan pendapatan ${platform.label} (dana sudah cair)`
    }
  ];

  async function insertEntry(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?)
       RETURNING *`
    )
      .bind(entryDate, referenceNo, description, user.id, user.id)
      .first();
  }

  let entry;
  try {
    entry = await withGeneratedReferenceNo(env, entryDate, insertEntry);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw httpError(409, "Nomor referensi bentrok, coba lagi", {});
    }
    throw error;
  }

  const statements = lines.map((line, index) =>
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(entry.id, line.account_id, index + 1, line.memo || null, line.debit_amount, line.credit_amount)
  );

  await env.DB.batch(statements);

  return getJournal(entry.id, env, corsHeaders, 201);
}

// =====================================================================
// Kontak (Pelanggan / Supplier)
// =====================================================================

function validateContactPayload(payload, partial = false) {
  const errors = {};
  const result = {};

  if (!partial || payload.contact_type !== undefined) {
    if (!["customer", "supplier"].includes(payload.contact_type)) {
      errors.contact_type = "contact_type harus 'customer' atau 'supplier'";
    } else {
      result.contact_type = payload.contact_type;
    }
  }

  if (!partial || payload.name !== undefined) {
    if (typeof payload.name !== "string" || payload.name.trim() === "") {
      errors.name = "name wajib diisi";
    } else {
      result.name = payload.name.trim();
    }
  }

  result.phone = payload.phone ? String(payload.phone).trim() : null;
  result.address = payload.address ? String(payload.address).trim() : null;
  result.notes = payload.notes ? String(payload.notes).trim() : null;

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { result };
}

async function listContacts(url, env, corsHeaders) {
  const type = url.searchParams.get("type");
  const search = url.searchParams.get("search");
  const includeInactive = url.searchParams.get("include_inactive") === "true";

  const conditions = [];
  const params = [];

  if (type) {
    conditions.push("contact_type = ?");
    params.push(type);
  }

  if (!includeInactive) {
    conditions.push("is_active = 1");
  }

  if (search) {
    conditions.push("name LIKE ?");
    params.push(`%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await env.DB.prepare(
    `SELECT * FROM contacts ${where} ORDER BY name ASC`
  )
    .bind(...params)
    .all();

  return json({ data: rows.results.map(normalizeBooleans) }, { corsHeaders });
}

async function getContact(id, env, corsHeaders) {
  const contact = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();

  if (!contact) {
    throw httpError(404, "Contact not found");
  }

  return json({ data: normalizeBooleans(contact) }, { corsHeaders });
}

async function createContact(request, env, corsHeaders) {
  const payload = await readJson(request);
  const { errors, result } = validateContactPayload(payload);

  if (errors) {
    throw httpError(422, "Invalid contact payload", errors);
  }

  const contact = await env.DB.prepare(
    `INSERT INTO contacts (contact_type, name, phone, address, notes)
     VALUES (?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(result.contact_type, result.name, result.phone, result.address, result.notes)
    .first();

  return json({ data: normalizeBooleans(contact) }, { status: 201, corsHeaders });
}

async function updateContact(id, request, env, corsHeaders) {
  const current = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();

  if (!current) {
    throw httpError(404, "Contact not found");
  }

  const payload = await readJson(request);
  const { errors, result } = validateContactPayload(payload, true);

  if (errors) {
    throw httpError(422, "Invalid contact payload", errors);
  }

  const merged = { ...current, ...result };

  if (payload.is_active !== undefined) {
    merged.is_active = payload.is_active ? 1 : 0;
  }

  const contact = await env.DB.prepare(
    `UPDATE contacts
     SET contact_type = ?, name = ?, phone = ?, address = ?, notes = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`
  )
    .bind(merged.contact_type, merged.name, merged.phone, merged.address, merged.notes, merged.is_active, id)
    .first();

  return json({ data: normalizeBooleans(contact) }, { corsHeaders });
}

async function deleteContact(id, env, corsHeaders) {
  const current = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();

  if (!current) {
    throw httpError(404, "Contact not found");
  }

  const invoiceCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM ar_invoices WHERE contact_id = ?")
    .bind(id)
    .first();
  const billCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM ap_bills WHERE contact_id = ?")
    .bind(id)
    .first();

  if (Number(invoiceCount?.count) > 0 || Number(billCount?.count) > 0) {
    // Sudah punya riwayat transaksi — nonaktifkan saja supaya riwayat &
    // laporan lama tidak berubah, jangan dihapus permanen.
    await env.DB.prepare("UPDATE contacts SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
    return json(
      { data: { message: "Kontak sudah punya riwayat transaksi, dinonaktifkan (bukan dihapus)." } },
      { corsHeaders }
    );
  }

  await env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(id).run();
  return json({ data: { message: "Kontak dihapus." } }, { corsHeaders });
}

async function findContactById(env, id) {
  return env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
}

// =====================================================================
// Nomor urut invoice/tagihan: INV-YYYYMM-NNN / BILL-YYYYMM-NNN
// (pola yang sama dengan generateReferenceNo untuk jurnal, tapi kolom &
// tabelnya beda)
// =====================================================================

async function generateSequentialNo(env, table, column, prefix, dateStr) {
  const yyyymm = String(dateStr).replace(/-/g, "").slice(0, 6);
  const fullPrefix = `${prefix}-${yyyymm}-`;

  const row = await env.DB.prepare(
    `SELECT MAX(CAST(substr(${column}, ?) AS INTEGER)) AS max_seq
     FROM ${table}
     WHERE ${column} LIKE ?`
  )
    .bind(fullPrefix.length + 1, `${fullPrefix}%`)
    .first();

  const nextSeq = (Number(row?.max_seq) || 0) + 1;
  return `${fullPrefix}${String(nextSeq).padStart(3, "0")}`;
}

async function withGeneratedNo(env, table, column, prefix, dateStr, insertFn, attempts = 5) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const no = await generateSequentialNo(env, table, column, prefix, dateStr);

    try {
      return await insertFn(no);
    } catch (error) {
      const isUniqueConflict = String(error?.message || "").includes("UNIQUE");
      if (!isUniqueConflict) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

// =====================================================================
// Piutang Umum (AR Invoices) — invoice ke pelanggan non-marketplace
// =====================================================================

function validateInvoiceOrBillPayload(payload) {
  const errors = {};

  if (!payload.contact_id) {
    errors.contact_id = "contact_id wajib diisi";
  }

  if (!isValidDate(payload.invoice_date || payload.bill_date)) {
    errors[payload.invoice_date !== undefined ? "invoice_date" : "bill_date"] = "wajib diisi, format YYYY-MM-DD";
  }

  if (!isValidDate(payload.due_date)) {
    errors.due_date = "wajib diisi, format YYYY-MM-DD";
  }

  if (typeof payload.description !== "string" || payload.description.trim() === "") {
    errors.description = "description wajib diisi";
  }

  // Rincian item (opsional): kalau `items` dikirim sebagai array berisi
  // minimal satu baris, subtotal/amount dihitung dari situ (qty * harga
  // satuan per baris, dikurangi diskon, ditambah pajak) dan nilai `amount`
  // yang dikirim klien diabaikan — supaya server jadi satu-satunya sumber
  // kebenaran untuk nominal yang dijurnal, bukan hasil hitungan klien yang
  // bisa saja beda karena rounding atau race condition antar-request.
  // Dokumen lama (tanpa items) tetap didukung: `amount` dikirim langsung.
  let normalizedItems = null;
  let subtotalAmount = null;
  let discountAmount = 0;
  let taxAmount = 0;
  let amount;

  const hasItems = Array.isArray(payload.items) && payload.items.length > 0;

  if (hasItems) {
    normalizedItems = [];
    payload.items.forEach((rawItem, index) => {
      const itemDescription = typeof rawItem?.description === "string" ? rawItem.description.trim() : "";
      const qty = parseMoney(rawItem?.qty);
      const unitPrice = parseMoney(rawItem?.unit_price);

      if (!itemDescription) {
        errors[`items.${index}.description`] = "deskripsi item wajib diisi";
      }
      if (qty === null || qty <= 0) {
        errors[`items.${index}.qty`] = "qty harus angka lebih dari 0";
      }
      if (unitPrice === null || unitPrice < 0) {
        errors[`items.${index}.unit_price`] = "harga satuan harus angka 0 atau lebih";
      }

      if (itemDescription && qty !== null && qty > 0 && unitPrice !== null && unitPrice >= 0) {
        normalizedItems.push({ description: itemDescription, qty, unit_price: unitPrice });
      }
    });

    subtotalAmount = roundMoney(normalizedItems.reduce((sum, item) => sum + item.qty * item.unit_price, 0));

    const parsedDiscount = payload.discount_amount === undefined ? 0 : parseMoney(payload.discount_amount);
    if (parsedDiscount === null || parsedDiscount < 0) {
      errors.discount_amount = "diskon harus angka 0 atau lebih";
    } else if (parsedDiscount > subtotalAmount) {
      errors.discount_amount = "diskon tidak boleh melebihi subtotal";
    } else {
      discountAmount = parsedDiscount;
    }

    const parsedTax = payload.tax_amount === undefined ? 0 : parseMoney(payload.tax_amount);
    if (parsedTax === null || parsedTax < 0) {
      errors.tax_amount = "pajak harus angka 0 atau lebih";
    } else {
      taxAmount = parsedTax;
    }

    amount = roundMoney(subtotalAmount - discountAmount + taxAmount);
    if (amount <= 0) {
      errors.amount = "Total (subtotal - diskon + pajak) harus lebih dari 0";
    }
  } else {
    amount = parseMoney(payload.amount);
    if (amount === null || amount <= 0) {
      errors.amount = "amount harus angka lebih dari 0, maksimal 2 desimal";
    }
  }

  return {
    errors: Object.keys(errors).length > 0 ? errors : null,
    amount,
    items: normalizedItems,
    subtotalAmount,
    discountAmount,
    taxAmount
  };
}

async function listArInvoices(url, env, corsHeaders) {
  return listReceivablesOrPayables(url, env, corsHeaders, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    noColumn: "invoice_no",
    dateColumn: "invoice_date"
  });
}

async function listApBills(url, env, corsHeaders) {
  return listReceivablesOrPayables(url, env, corsHeaders, {
    table: "ap_bills",
    payments: "ap_bill_payments",
    fkColumn: "bill_id",
    noColumn: "bill_no",
    dateColumn: "bill_date"
  });
}

async function listReceivablesOrPayables(url, env, corsHeaders, { table, payments, fkColumn, noColumn, dateColumn }) {
  const contactId = url.searchParams.get("contact_id");
  const status = url.searchParams.get("status") || "all"; // all | open | paid | void
  const asOfDate = url.searchParams.get("as_of_date") || todayDate();
  const search = (url.searchParams.get("search") || "").trim();
  const startDate = url.searchParams.get("start_date") || "";
  const endDate = url.searchParams.get("end_date") || "";

  const conditions = [];
  const params = [];

  if (contactId) {
    conditions.push("t.contact_id = ?");
    params.push(contactId);
  }

  if (status === "void") {
    conditions.push("t.status = 'void'");
  } else if (status !== "all") {
    conditions.push("t.status = 'open'");
  }

  if (search) {
    conditions.push(`(t.${noColumn} LIKE ? OR t.description LIKE ? OR c.name LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  if (isValidDate(startDate)) {
    conditions.push(`t.${dateColumn} >= ?`);
    params.push(startDate);
  }

  if (isValidDate(endDate)) {
    conditions.push(`t.${dateColumn} <= ?`);
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await env.DB.prepare(
    `SELECT t.*, c.name AS contact_name, c.contact_type,
            COALESCE((SELECT SUM(p.amount) FROM ${payments} p WHERE p.${fkColumn} = t.id AND p.payment_date <= ?), 0) AS paid_amount
     FROM ${table} t
     JOIN contacts c ON c.id = t.contact_id
     ${where}
     ORDER BY t.${dateColumn} DESC, t.id DESC`
  )
    .bind(asOfDate, ...params)
    .all();

  let items = rows.results.map((row) => enrichReceivablePayable(row, asOfDate));

  if (status === "paid") {
    items = items.filter((row) => row.status !== "void" && row.balance <= 0);
  } else if (status === "open") {
    items = items.filter((row) => row.status !== "void" && row.balance > 0);
  }

  const openItems = items.filter((row) => row.status !== "void" && row.balance > 0);

  return json(
    {
      data: items,
      meta: {
        as_of_date: asOfDate,
        count: items.length,
        total_outstanding: roundMoney(openItems.reduce((sum, row) => sum + row.balance, 0))
      }
    },
    { corsHeaders }
  );
}

function enrichReceivablePayable(row, asOfDate) {
  const amount = Number(row.amount);
  const paidAmount = roundMoney(Number(row.paid_amount || 0));
  const balance = row.status === "void" ? 0 : roundMoney(amount - paidAmount);
  const daysOverdue = Math.floor((Date.parse(`${asOfDate}T00:00:00Z`) - Date.parse(`${row.due_date}T00:00:00Z`)) / 86400000);

  let paymentStatus = "belum_lunas";
  if (row.status === "void") paymentStatus = "void";
  else if (balance <= 0) paymentStatus = "lunas";
  else if (paidAmount > 0) paymentStatus = "sebagian";
  else if (daysOverdue > 0) paymentStatus = "jatuh_tempo";

  return {
    ...row,
    amount,
    paid_amount: paidAmount,
    balance,
    days_overdue: daysOverdue,
    payment_status: paymentStatus,
    items: parseItemsJson(row.items)
  };
}

// `items` is stored as a JSON string (or NULL for documents created before
// line items existed). Parsed defensively so a malformed/legacy value never
// crashes a list/detail response — it just falls back to "no items", which
// callers already treat as the single-line legacy display.
function parseItemsJson(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getArInvoice(id, env, corsHeaders) {
  return getReceivableOrPayable(id, env, corsHeaders, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    accountColumn: "revenue_account_id"
  });
}

async function getApBill(id, env, corsHeaders) {
  return getReceivableOrPayable(id, env, corsHeaders, {
    table: "ap_bills",
    payments: "ap_bill_payments",
    fkColumn: "bill_id",
    accountColumn: "expense_account_id"
  });
}

async function fetchReceivableOrPayableDetail(id, env, { table, payments, fkColumn, accountColumn }) {
  const row = await env.DB.prepare(
    `SELECT t.*, c.name AS contact_name, c.contact_type, c.phone AS contact_phone, c.address AS contact_address,
            coa.account_code, coa.account_name
     FROM ${table} t
     JOIN contacts c ON c.id = t.contact_id
     JOIN chart_of_accounts coa ON coa.id = t.${accountColumn}
     WHERE t.id = ?`
  )
    .bind(id)
    .first();

  if (!row) {
    throw httpError(404, "Not found");
  }

  const paymentRows = await env.DB.prepare(
    `SELECT p.*, coa.account_code, coa.account_name
     FROM ${payments} p
     JOIN chart_of_accounts coa ON coa.id = p.account_id
     WHERE p.${fkColumn} = ?
     ORDER BY p.payment_date ASC, p.id ASC`
  )
    .bind(id)
    .all();

  // Unlike the list query, `t.*` above doesn't include a computed
  // `paid_amount` (that's only ever a SUM() alias in listReceivablesOrPayables),
  // so it must be filled in here from the payments we just fetched —
  // otherwise enrichReceivablePayable() sees `row.paid_amount` as
  // undefined and reports every detail view as fully unpaid even when
  // payments exist.
  row.paid_amount = paymentRows.results.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const enriched = enrichReceivablePayable(row, todayDate());

  return { ...enriched, payments: paymentRows.results };
}

async function getReceivableOrPayable(id, env, corsHeaders, config, status = 200) {
  const detail = await fetchReceivableOrPayableDetail(id, env, config);
  return json({ data: detail }, { status, corsHeaders });
}

async function exportArInvoice(id, env, corsHeaders) {
  const invoice = await fetchReceivableOrPayableDetail(id, env, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    accountColumn: "revenue_account_id"
  });

  const body = await ReportExport.arInvoicePdf(invoice);
  const filename = ReportExport.makeFileName(`invoice-${invoice.invoice_no}`, "pdf");

  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": ReportExport.contentTypeFor("pdf"),
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

async function createArInvoice(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const { errors, amount, items, subtotalAmount, discountAmount, taxAmount } = validateInvoiceOrBillPayload({
    ...payload,
    invoice_date: payload.invoice_date
  });

  if (errors) {
    throw httpError(422, "Invalid invoice payload", errors);
  }

  const contact = await findContactById(env, payload.contact_id);
  if (!contact || !Number(contact.is_active) || contact.contact_type !== "customer") {
    throw httpError(422, "Invalid invoice payload", {
      contact_id: "Kontak tidak ditemukan, nonaktif, atau bukan tipe pelanggan (customer)"
    });
  }

  const receivableAccount = await findAccountByCode(env, AR_RECEIVABLE_ACCOUNT_CODE);
  if (!receivableAccount || !Number(receivableAccount.is_active)) {
    throw httpError(422, "Akun Piutang Usaha belum tersedia", {
      account_code: `Buat/aktifkan dulu akun ${AR_RECEIVABLE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const revenueAccountId = payload.revenue_account_id || null;
  const revenueAccount = revenueAccountId
    ? await findAccountById(env, revenueAccountId)
    : await findAccountByCode(env, AR_DEFAULT_REVENUE_ACCOUNT_CODE);

  if (!revenueAccount || !Number(revenueAccount.is_active) || !["revenue"].includes(revenueAccount.account_type)) {
    throw httpError(422, "Invalid invoice payload", {
      revenue_account_id: "Akun pendapatan tidak ditemukan, nonaktif, atau bukan tipe pendapatan (revenue)"
    });
  }

  await assertPeriodOpen(env, payload.invoice_date);

  const description = `Invoice ${contact.name}: ${String(payload.description).trim()}`;

  async function insertJournal(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?)
       RETURNING *`
    )
      .bind(payload.invoice_date, referenceNo, description, user.id, user.id)
      .first();
  }

  const journalEntry = await withGeneratedReferenceNo(env, payload.invoice_date, insertJournal);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 1, ?, ?, 0)`
    ).bind(journalEntry.id, receivableAccount.id, `Piutang ${contact.name}`, amount),
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 2, ?, 0, ?)`
    ).bind(journalEntry.id, revenueAccount.id, `Penjualan ke ${contact.name}`, amount)
  ]);

  async function insertInvoice(invoiceNo) {
    return env.DB.prepare(
      `INSERT INTO ar_invoices (invoice_no, contact_id, invoice_date, due_date, description, amount, items, subtotal_amount, discount_amount, tax_amount, revenue_account_id, journal_entry_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
      .bind(
        invoiceNo,
        contact.id,
        payload.invoice_date,
        payload.due_date,
        String(payload.description).trim(),
        amount,
        items ? JSON.stringify(items) : null,
        subtotalAmount,
        discountAmount,
        taxAmount,
        revenueAccount.id,
        journalEntry.id,
        user.id
      )
      .first();
  }

  const manualNo = payload.invoice_no ? String(payload.invoice_no).trim() : "";
  const inserted = manualNo
    ? await insertInvoice(manualNo)
    : await withGeneratedNo(env, "ar_invoices", "invoice_no", "INV", payload.invoice_date, insertInvoice);

  return getReceivableOrPayable(inserted.id, env, corsHeaders, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    accountColumn: "revenue_account_id"
  }, 201);
}

async function createApBill(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const { errors, amount, items, subtotalAmount, discountAmount, taxAmount } = validateInvoiceOrBillPayload({
    ...payload,
    bill_date: payload.bill_date
  });

  if (errors) {
    throw httpError(422, "Invalid bill payload", errors);
  }

  const contact = await findContactById(env, payload.contact_id);
  if (!contact || !Number(contact.is_active) || contact.contact_type !== "supplier") {
    throw httpError(422, "Invalid bill payload", {
      contact_id: "Kontak tidak ditemukan, nonaktif, atau bukan tipe supplier"
    });
  }

  const payableAccount = await findAccountByCode(env, AP_PAYABLE_ACCOUNT_CODE);
  if (!payableAccount || !Number(payableAccount.is_active)) {
    throw httpError(422, "Akun Utang Usaha belum tersedia", {
      account_code: `Buat/aktifkan dulu akun ${AP_PAYABLE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const expenseAccountId = payload.expense_account_id || null;
  const expenseAccount = expenseAccountId
    ? await findAccountById(env, expenseAccountId)
    : await findAccountByCode(env, AP_DEFAULT_EXPENSE_ACCOUNT_CODE);

  if (
    !expenseAccount ||
    !Number(expenseAccount.is_active) ||
    !["asset", "expense", "cogs"].includes(expenseAccount.account_type)
  ) {
    throw httpError(422, "Invalid bill payload", {
      expense_account_id: "Akun tidak ditemukan, nonaktif, atau bukan tipe aset/beban/HPP"
    });
  }

  await assertPeriodOpen(env, payload.bill_date);

  const description = `Tagihan ${contact.name}: ${String(payload.description).trim()}`;

  async function insertJournal(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?)
       RETURNING *`
    )
      .bind(payload.bill_date, referenceNo, description, user.id, user.id)
      .first();
  }

  const journalEntry = await withGeneratedReferenceNo(env, payload.bill_date, insertJournal);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 1, ?, ?, 0)`
    ).bind(journalEntry.id, expenseAccount.id, `Pembelian dari ${contact.name}`, amount),
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 2, ?, 0, ?)`
    ).bind(journalEntry.id, payableAccount.id, `Utang ke ${contact.name}`, amount)
  ]);

  async function insertBill(billNo) {
    return env.DB.prepare(
      `INSERT INTO ap_bills (bill_no, contact_id, bill_date, due_date, description, amount, items, subtotal_amount, discount_amount, tax_amount, expense_account_id, journal_entry_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
      .bind(
        billNo,
        contact.id,
        payload.bill_date,
        payload.due_date,
        String(payload.description).trim(),
        amount,
        items ? JSON.stringify(items) : null,
        subtotalAmount,
        discountAmount,
        taxAmount,
        expenseAccount.id,
        journalEntry.id,
        user.id
      )
      .first();
  }

  const manualNo = payload.bill_no ? String(payload.bill_no).trim() : "";
  const inserted = manualNo
    ? await insertBill(manualNo)
    : await withGeneratedNo(env, "ap_bills", "bill_no", "BILL", payload.bill_date, insertBill);

  return getReceivableOrPayable(
    inserted.id,
    env,
    corsHeaders,
    { table: "ap_bills", payments: "ap_bill_payments", fkColumn: "bill_id", accountColumn: "expense_account_id" },
    201
  );
}

/**
 * Edit & hapus untuk invoice/tagihan yang BELUM ada pembayaran dan belum
 * di-void tidak butuh apa-apa tambahan (jalur normal). Begitu ada uang
 * yang sudah bergerak (atau dokumennya sudah void), aksi tetap diizinkan
 * — tapi hanya kalau user memasukkan ulang password akunnya sendiri
 * sebagai konfirmasi, supaya perubahan/penghapusan yang menyentuh jejak
 * pembayaran tidak bisa kejadian tanpa sengaja/asal klik.
 */
async function verifyActionPassword(env, user, password) {
  if (!password) {
    throw httpError(422, "Konfirmasi password wajib diisi", {
      password: "Masukkan password akun kamu untuk konfirmasi tindakan ini"
    });
  }

  const row = await env.DB.prepare(`SELECT password_hash FROM users WHERE id = ?`).bind(user.id).first();
  if (!row) {
    throw httpError(401, "Sesi tidak valid, silakan login ulang");
  }

  const isValid = await verifyPassword(password, row.password_hash);
  if (!isValid) {
    throw httpError(401, "Password salah", { password: "Password yang kamu masukkan salah" });
  }
}

// Dipakai oleh update (PUT). Void tetap selalu diblokir — mengedit
// dokumen yang sudah dibatalkan tidak masuk akal — tapi kalau sudah ada
// pembayaran, edit tetap boleh asal password dikonfirmasi. Ikut
// dikembalikan info pembayaran supaya pemanggil bisa mencegah nominal
// baru jadi lebih kecil dari yang sudah dibayar (saldo negatif).
async function assertInvoiceOrBillEditable(env, id, table, payments, fkColumn, noun, user, password) {
  const existing = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!existing) throw httpError(404, `${noun} not found`);

  if (existing.status === "void") {
    throw httpError(422, `${noun} ini sudah dibatalkan (void) dan tidak bisa diubah`);
  }

  await assertPeriodOpen(env, existing.invoice_date || existing.bill_date);

  const paymentRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM ${payments} WHERE ${fkColumn} = ?`
  )
    .bind(id)
    .first();
  const hasPayments = Number(paymentRow?.count) > 0;
  const totalPaid = Number(paymentRow?.total) || 0;

  if (hasPayments) {
    await verifyActionPassword(env, user, password);
  }

  return { existing, hasPayments, totalPaid };
}

// Dipakai oleh delete (DELETE). Kalau sudah ada pembayaran dan/atau
// sudah void, tetap boleh dihapus permanen asal password dikonfirmasi.
// Pembayaran & jurnal terkait ikut dihapus supaya tidak ada baris
// journal_lines/journal_entries yatim yang merujuk ke dokumen yang
// sudah tidak ada.
async function assertInvoiceOrBillDeletable(env, id, table, payments, fkColumn, noun, user, password) {
  const existing = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!existing) throw httpError(404, `${noun} not found`);

  await assertPeriodOpen(env, existing.invoice_date || existing.bill_date);

  const paymentRows = await env.DB.prepare(`SELECT id, journal_entry_id FROM ${payments} WHERE ${fkColumn} = ?`)
    .bind(id)
    .all();
  const paymentList = paymentRows.results || [];
  const hasPayments = paymentList.length > 0;
  const isVoid = existing.status === "void";

  if (hasPayments || isVoid) {
    await verifyActionPassword(env, user, password);
  }

  return { existing, paymentList };
}

async function updateArInvoice(id, request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const { errors, amount, items, subtotalAmount, discountAmount, taxAmount } = validateInvoiceOrBillPayload({
    ...payload,
    invoice_date: payload.invoice_date
  });
  if (errors) throw httpError(422, "Invalid invoice payload", errors);

  const { existing, hasPayments, totalPaid } = await assertInvoiceOrBillEditable(
    env,
    id,
    "ar_invoices",
    "ar_invoice_payments",
    "invoice_id",
    "Invoice",
    user,
    payload.password
  );

  if (hasPayments && amount < totalPaid) {
    throw httpError(422, "Nominal invoice tidak boleh lebih kecil dari total yang sudah dibayar", {
      amount: `Sudah dibayar Rp${totalPaid.toLocaleString("id-ID")}, tidak bisa diubah jadi lebih kecil dari itu`
    });
  }

  await assertPeriodOpen(env, payload.invoice_date);

  const contact = await findContactById(env, payload.contact_id);
  if (!contact || !Number(contact.is_active) || contact.contact_type !== "customer") {
    throw httpError(422, "Invalid invoice payload", {
      contact_id: "Kontak tidak ditemukan, nonaktif, atau bukan tipe pelanggan (customer)"
    });
  }

  const receivableAccount = await findAccountByCode(env, AR_RECEIVABLE_ACCOUNT_CODE);
  if (!receivableAccount || !Number(receivableAccount.is_active)) {
    throw httpError(422, "Akun Piutang Usaha belum tersedia", {
      account_code: `Buat/aktifkan dulu akun ${AR_RECEIVABLE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const revenueAccountId = payload.revenue_account_id || null;
  const revenueAccount = revenueAccountId
    ? await findAccountById(env, revenueAccountId)
    : await findAccountByCode(env, AR_DEFAULT_REVENUE_ACCOUNT_CODE);

  if (!revenueAccount || !Number(revenueAccount.is_active) || !["revenue"].includes(revenueAccount.account_type)) {
    throw httpError(422, "Invalid invoice payload", {
      revenue_account_id: "Akun pendapatan tidak ditemukan, nonaktif, atau bukan tipe pendapatan (revenue)"
    });
  }

  const description = `Invoice ${contact.name}: ${String(payload.description).trim()}`;

  await env.DB.batch([
    env.DB.prepare(`UPDATE journal_entries SET entry_date = ?, description = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(payload.invoice_date, description, existing.journal_entry_id),
    env.DB.prepare(
      `UPDATE journal_lines SET account_id = ?, memo = ?, debit = ?, credit = 0 WHERE journal_entry_id = ? AND line_no = 1`
    ).bind(receivableAccount.id, `Piutang ${contact.name}`, amount, existing.journal_entry_id),
    env.DB.prepare(
      `UPDATE journal_lines SET account_id = ?, memo = ?, debit = 0, credit = ? WHERE journal_entry_id = ? AND line_no = 2`
    ).bind(revenueAccount.id, `Penjualan ke ${contact.name}`, amount, existing.journal_entry_id),
    env.DB.prepare(
      `UPDATE ar_invoices SET contact_id = ?, invoice_date = ?, due_date = ?, description = ?, amount = ?, items = ?, subtotal_amount = ?, discount_amount = ?, tax_amount = ?, revenue_account_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      contact.id,
      payload.invoice_date,
      payload.due_date,
      String(payload.description).trim(),
      amount,
      items ? JSON.stringify(items) : null,
      subtotalAmount,
      discountAmount,
      taxAmount,
      revenueAccount.id,
      id
    )
  ]);

  return getReceivableOrPayable(id, env, corsHeaders, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    accountColumn: "revenue_account_id"
  });
}

async function deleteArInvoice(id, request, env, user, corsHeaders) {
  const payload = await readJson(request).catch(() => ({}));

  const { existing, paymentList } = await assertInvoiceOrBillDeletable(
    env,
    id,
    "ar_invoices",
    "ar_invoice_payments",
    "invoice_id",
    "Invoice",
    user,
    payload.password
  );

  // Kalau invoice ini sudah pernah dibayar, pembayarannya (dan jurnal Kas/
  // Bank-nya) ikut dihapus permanen juga — bukan cuma invoice-nya. Ini
  // konsekuensi dari force-delete: uang yang "tercatat masuk" dari
  // pembayaran itu juga dianggap tidak pernah terjadi.
  const journalIdsToDelete = [existing.journal_entry_id, ...paymentList.map((payment) => payment.journal_entry_id)];

  await env.DB.batch([
    env.DB.prepare("DELETE FROM ar_invoice_payments WHERE invoice_id = ?").bind(id),
    env.DB.prepare("DELETE FROM ar_invoices WHERE id = ?").bind(id),
    ...journalIdsToDelete.map((journalId) => env.DB.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").bind(journalId)),
    ...journalIdsToDelete.map((journalId) => env.DB.prepare("DELETE FROM journal_entries WHERE id = ?").bind(journalId))
  ]);

  return new Response(null, { status: 204, headers: corsHeaders });
}

async function updateApBill(id, request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const { errors, amount, items, subtotalAmount, discountAmount, taxAmount } = validateInvoiceOrBillPayload({
    ...payload,
    bill_date: payload.bill_date
  });
  if (errors) throw httpError(422, "Invalid bill payload", errors);

  const { existing, hasPayments, totalPaid } = await assertInvoiceOrBillEditable(
    env,
    id,
    "ap_bills",
    "ap_bill_payments",
    "bill_id",
    "Tagihan",
    user,
    payload.password
  );

  if (hasPayments && amount < totalPaid) {
    throw httpError(422, "Nominal tagihan tidak boleh lebih kecil dari total yang sudah dibayar", {
      amount: `Sudah dibayar Rp${totalPaid.toLocaleString("id-ID")}, tidak bisa diubah jadi lebih kecil dari itu`
    });
  }

  await assertPeriodOpen(env, payload.bill_date);

  const contact = await findContactById(env, payload.contact_id);
  if (!contact || !Number(contact.is_active) || contact.contact_type !== "supplier") {
    throw httpError(422, "Invalid bill payload", {
      contact_id: "Kontak tidak ditemukan, nonaktif, atau bukan tipe supplier"
    });
  }

  const payableAccount = await findAccountByCode(env, AP_PAYABLE_ACCOUNT_CODE);
  if (!payableAccount || !Number(payableAccount.is_active)) {
    throw httpError(422, "Akun Utang Usaha belum tersedia", {
      account_code: `Buat/aktifkan dulu akun ${AP_PAYABLE_ACCOUNT_CODE} di menu Chart of Accounts`
    });
  }

  const expenseAccountId = payload.expense_account_id || null;
  const expenseAccount = expenseAccountId
    ? await findAccountById(env, expenseAccountId)
    : await findAccountByCode(env, AP_DEFAULT_EXPENSE_ACCOUNT_CODE);

  if (
    !expenseAccount ||
    !Number(expenseAccount.is_active) ||
    !["asset", "expense", "cogs"].includes(expenseAccount.account_type)
  ) {
    throw httpError(422, "Invalid bill payload", {
      expense_account_id: "Akun tidak ditemukan, nonaktif, atau bukan tipe aset/beban/HPP"
    });
  }

  const description = `Tagihan ${contact.name}: ${String(payload.description).trim()}`;

  await env.DB.batch([
    env.DB.prepare(`UPDATE journal_entries SET entry_date = ?, description = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(payload.bill_date, description, existing.journal_entry_id),
    env.DB.prepare(
      `UPDATE journal_lines SET account_id = ?, memo = ?, debit = ?, credit = 0 WHERE journal_entry_id = ? AND line_no = 1`
    ).bind(expenseAccount.id, `Pembelian dari ${contact.name}`, amount, existing.journal_entry_id),
    env.DB.prepare(
      `UPDATE journal_lines SET account_id = ?, memo = ?, debit = 0, credit = ? WHERE journal_entry_id = ? AND line_no = 2`
    ).bind(payableAccount.id, `Utang ke ${contact.name}`, amount, existing.journal_entry_id),
    env.DB.prepare(
      `UPDATE ap_bills SET contact_id = ?, bill_date = ?, due_date = ?, description = ?, amount = ?, items = ?, subtotal_amount = ?, discount_amount = ?, tax_amount = ?, expense_account_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      contact.id,
      payload.bill_date,
      payload.due_date,
      String(payload.description).trim(),
      amount,
      items ? JSON.stringify(items) : null,
      subtotalAmount,
      discountAmount,
      taxAmount,
      expenseAccount.id,
      id
    )
  ]);

  return getReceivableOrPayable(id, env, corsHeaders, {
    table: "ap_bills",
    payments: "ap_bill_payments",
    fkColumn: "bill_id",
    accountColumn: "expense_account_id"
  });
}

async function deleteApBill(id, request, env, user, corsHeaders) {
  const payload = await readJson(request).catch(() => ({}));

  const { existing, paymentList } = await assertInvoiceOrBillDeletable(
    env,
    id,
    "ap_bills",
    "ap_bill_payments",
    "bill_id",
    "Tagihan",
    user,
    payload.password
  );

  const journalIdsToDelete = [existing.journal_entry_id, ...paymentList.map((payment) => payment.journal_entry_id)];

  await env.DB.batch([
    env.DB.prepare("DELETE FROM ap_bill_payments WHERE bill_id = ?").bind(id),
    env.DB.prepare("DELETE FROM ap_bills WHERE id = ?").bind(id),
    ...journalIdsToDelete.map((journalId) => env.DB.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").bind(journalId)),
    ...journalIdsToDelete.map((journalId) => env.DB.prepare("DELETE FROM journal_entries WHERE id = ?").bind(journalId))
  ]);

  return new Response(null, { status: 204, headers: corsHeaders });
}

function validatePaymentPayload(payload) {
  const errors = {};

  if (!isValidDate(payload.payment_date)) {
    errors.payment_date = "wajib diisi, format YYYY-MM-DD";
  }

  const amount = parseMoney(payload.amount);
  if (amount === null || amount <= 0) {
    errors.amount = "amount harus angka lebih dari 0, maksimal 2 desimal";
  }

  if (!payload.account_id) {
    errors.account_id = "account_id (akun kas/bank) wajib diisi";
  }

  return { errors: Object.keys(errors).length > 0 ? errors : null, amount };
}

async function createArInvoicePayment(invoiceId, request, env, user, corsHeaders) {
  const invoice = await env.DB.prepare("SELECT * FROM ar_invoices WHERE id = ?").bind(invoiceId).first();
  if (!invoice) throw httpError(404, "Invoice not found");
  if (invoice.status === "void") throw httpError(422, "Invoice ini sudah dibatalkan (void)");

  const payload = await readJson(request);
  const { errors, amount } = validatePaymentPayload(payload);
  if (errors) throw httpError(422, "Invalid payment payload", errors);

  await assertPeriodOpen(env, payload.payment_date);

  const cashAccount = await findAccountById(env, payload.account_id);
  if (!cashAccount || !Number(cashAccount.is_active) || cashAccount.account_type !== "asset") {
    throw httpError(422, "Invalid payment payload", { account_id: "Akun harus akun kas/bank (asset) yang aktif" });
  }

  const contact = await findContactById(env, invoice.contact_id);
  const paidSoFar = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM ar_invoice_payments WHERE invoice_id = ?"
  )
    .bind(invoiceId)
    .first();
  const remaining = roundMoney(Number(invoice.amount) - Number(paidSoFar?.total || 0));

  if (amount > remaining) {
    throw httpError(422, "Invalid payment payload", {
      amount: `Jumlah pembayaran (${amount}) melebihi sisa piutang (${remaining})`
    });
  }

  const receivableAccount = await findAccountByCode(env, AR_RECEIVABLE_ACCOUNT_CODE);
  const description = `Pelunasan invoice ${invoice.invoice_no} - ${contact?.name || ""}`;

  async function insertJournal(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?)
       RETURNING *`
    )
      .bind(payload.payment_date, referenceNo, description, user.id, user.id)
      .first();
  }

  const journalEntry = await withGeneratedReferenceNo(env, payload.payment_date, insertJournal);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 1, ?, ?, 0)`
    ).bind(journalEntry.id, cashAccount.id, description, amount),
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 2, ?, 0, ?)`
    ).bind(journalEntry.id, receivableAccount.id, description, amount),
    env.DB.prepare(
      `INSERT INTO ar_invoice_payments (invoice_id, payment_date, amount, account_id, journal_entry_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(invoiceId, payload.payment_date, amount, cashAccount.id, journalEntry.id, payload.notes || null, user.id)
  ]);

  return getReceivableOrPayable(invoiceId, env, corsHeaders, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    accountColumn: "revenue_account_id"
  }, 201);
}

async function createApBillPayment(billId, request, env, user, corsHeaders) {
  const bill = await env.DB.prepare("SELECT * FROM ap_bills WHERE id = ?").bind(billId).first();
  if (!bill) throw httpError(404, "Bill not found");
  if (bill.status === "void") throw httpError(422, "Tagihan ini sudah dibatalkan (void)");

  const payload = await readJson(request);
  const { errors, amount } = validatePaymentPayload(payload);
  if (errors) throw httpError(422, "Invalid payment payload", errors);

  await assertPeriodOpen(env, payload.payment_date);

  const cashAccount = await findAccountById(env, payload.account_id);
  if (!cashAccount || !Number(cashAccount.is_active) || cashAccount.account_type !== "asset") {
    throw httpError(422, "Invalid payment payload", { account_id: "Akun harus akun kas/bank (asset) yang aktif" });
  }

  const contact = await findContactById(env, bill.contact_id);
  const paidSoFar = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM ap_bill_payments WHERE bill_id = ?"
  )
    .bind(billId)
    .first();
  const remaining = roundMoney(Number(bill.amount) - Number(paidSoFar?.total || 0));

  if (amount > remaining) {
    throw httpError(422, "Invalid payment payload", {
      amount: `Jumlah pembayaran (${amount}) melebihi sisa utang (${remaining})`
    });
  }

  const payableAccount = await findAccountByCode(env, AP_PAYABLE_ACCOUNT_CODE);
  const description = `Pembayaran tagihan ${bill.bill_no} - ${contact?.name || ""}`;

  async function insertJournal(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?)
       RETURNING *`
    )
      .bind(payload.payment_date, referenceNo, description, user.id, user.id)
      .first();
  }

  const journalEntry = await withGeneratedReferenceNo(env, payload.payment_date, insertJournal);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 1, ?, ?, 0)`
    ).bind(journalEntry.id, payableAccount.id, description, amount),
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit) VALUES (?, ?, 2, ?, 0, ?)`
    ).bind(journalEntry.id, cashAccount.id, description, amount),
    env.DB.prepare(
      `INSERT INTO ap_bill_payments (bill_id, payment_date, amount, account_id, journal_entry_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(billId, payload.payment_date, amount, cashAccount.id, journalEntry.id, payload.notes || null, user.id)
  ]);

  return getReceivableOrPayable(billId, env, corsHeaders, {
    table: "ap_bills",
    payments: "ap_bill_payments",
    fkColumn: "bill_id",
    accountColumn: "expense_account_id"
  }, 201);
}

async function voidArInvoice(id, request, env, user, corsHeaders) {
  return voidReceivableOrPayable(id, request, env, user, corsHeaders, {
    table: "ar_invoices",
    payments: "ar_invoice_payments",
    fkColumn: "invoice_id",
    noColumn: "invoice_no",
    accountColumn: "revenue_account_id"
  });
}

async function voidApBill(id, request, env, user, corsHeaders) {
  return voidReceivableOrPayable(id, request, env, user, corsHeaders, {
    table: "ap_bills",
    payments: "ap_bill_payments",
    fkColumn: "bill_id",
    noColumn: "bill_no",
    accountColumn: "expense_account_id"
  });
}

async function voidReceivableOrPayable(id, request, env, user, corsHeaders, { table, payments, fkColumn, noColumn, accountColumn }) {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) throw httpError(404, "Not found");
  if (row.status === "void") throw httpError(422, `${row[noColumn]} sudah dibatalkan sebelumnya`);

  await assertPeriodOpen(env, row.invoice_date || row.bill_date);

  const paymentCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${payments} WHERE ${fkColumn} = ?`)
    .bind(id)
    .first();

  if (Number(paymentCount?.count) > 0) {
    throw httpError(422, "Tidak bisa dibatalkan karena sudah ada pembayaran tercatat", {
      hint: "Batalkan/koreksi pembayarannya dulu lewat menu Jurnal sebelum membatalkan dokumen ini."
    });
  }

  const payload = await readJson(request).catch(() => ({}));
  const reason = payload?.reason ? String(payload.reason).trim() : null;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE journal_entries SET status = 'void', voided_at = datetime('now'), voided_by = ?, void_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(user.id, reason, row.journal_entry_id),
    env.DB.prepare(
      `UPDATE ${table} SET status = 'void', voided_at = datetime('now'), voided_by = ?, void_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(user.id, reason, id)
  ]);

  return getReceivableOrPayable(id, env, corsHeaders, { table, payments, fkColumn, accountColumn });
}

// =====================================================================
// Laporan Umur Piutang/Utang (Aging Report)
// =====================================================================

function agingBucketFor(daysOverdue) {
  if (daysOverdue <= 0) return "belum_jatuh_tempo";
  if (daysOverdue <= 30) return "1_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "90_plus";
}

async function agingReport(url, env, corsHeaders) {
  const type = url.searchParams.get("type") === "ap" ? "ap" : "ar";
  const asOfDate = url.searchParams.get("as_of_date") || todayDate();

  if (!isValidDate(asOfDate)) {
    throw httpError(422, "Invalid query", { as_of_date: "as_of_date must be in YYYY-MM-DD format" });
  }

  const config =
    type === "ap"
      ? { table: "ap_bills", payments: "ap_bill_payments", fkColumn: "bill_id", noColumn: "bill_no", dateColumn: "bill_date" }
      : { table: "ar_invoices", payments: "ar_invoice_payments", fkColumn: "invoice_id", noColumn: "invoice_no", dateColumn: "invoice_date" };

  const rows = await env.DB.prepare(
    `SELECT t.*, c.name AS contact_name,
            COALESCE((SELECT SUM(p.amount) FROM ${config.payments} p WHERE p.${config.fkColumn} = t.id AND p.payment_date <= ?), 0) AS paid_amount
     FROM ${config.table} t
     JOIN contacts c ON c.id = t.contact_id
     WHERE t.status = 'open'
     ORDER BY t.due_date ASC`
  )
    .bind(asOfDate)
    .all();

  const buckets = {
    belum_jatuh_tempo: 0,
    "1_30": 0,
    "31_60": 0,
    "61_90": 0,
    "90_plus": 0
  };

  const items = [];
  const byContact = new Map();

  for (const row of rows.results) {
    const enriched = enrichReceivablePayable(row, asOfDate);
    if (enriched.balance <= 0) continue;

    const bucket = agingBucketFor(enriched.days_overdue);
    buckets[bucket] = roundMoney(buckets[bucket] + enriched.balance);

    const item = {
      id: enriched.id,
      no: enriched[config.noColumn],
      contact_id: enriched.contact_id,
      contact_name: enriched.contact_name,
      [config.dateColumn]: enriched[config.dateColumn],
      due_date: enriched.due_date,
      amount: enriched.amount,
      paid_amount: enriched.paid_amount,
      balance: enriched.balance,
      days_overdue: enriched.days_overdue,
      bucket
    };
    items.push(item);

    const contactEntry = byContact.get(enriched.contact_id) || {
      contact_id: enriched.contact_id,
      contact_name: enriched.contact_name,
      belum_jatuh_tempo: 0,
      "1_30": 0,
      "31_60": 0,
      "61_90": 0,
      "90_plus": 0,
      total: 0
    };
    contactEntry[bucket] = roundMoney(contactEntry[bucket] + enriched.balance);
    contactEntry.total = roundMoney(contactEntry.total + enriched.balance);
    byContact.set(enriched.contact_id, contactEntry);
  }

  const total = roundMoney(Object.values(buckets).reduce((sum, value) => sum + value, 0));

  return json(
    {
      data: {
        type,
        as_of_date: asOfDate,
        buckets,
        total,
        items,
        by_contact: Array.from(byContact.values()).sort((a, b) => b.total - a.total)
      }
    },
    { corsHeaders }
  );
}

/**
 * Format nomor referensi jurnal otomatis: JV-YYYYMM-NNN
 * Contoh: JV-202608-001 (jurnal ke-1 di bulan Agustus 2026).
 *
 * Dipilih supaya mudah diingat/ditebak: langsung terlihat bulan
 * transaksinya dari nomornya sendiri, dan nomor urutnya kembali ke 001
 * setiap awal bulan (tidak terus membesar seperti nomor urut tahunan).
 */
function referenceNoPrefix(entryDate) {
  const yyyymm = String(entryDate).replace(/-/g, "").slice(0, 6);
  return `JV-${yyyymm}-`;
}

async function generateReferenceNo(env, entryDate) {
  const prefix = referenceNoPrefix(entryDate);

  const row = await env.DB.prepare(
    `SELECT MAX(CAST(substr(reference_no, ?) AS INTEGER)) AS max_seq
     FROM journal_entries
     WHERE reference_no LIKE ?`
  )
    .bind(prefix.length + 1, `${prefix}%`)
    .first();

  const nextSeq = (Number(row?.max_seq) || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

/**
 * Menjalankan `insertFn(referenceNo)` dengan reference_no yang sudah
 * digenerate. Kalau ternyata bentrok (dua request nyaris bersamaan
 * mengambil nomor urut yang sama), otomatis coba lagi dengan nomor
 * berikutnya, sampai beberapa kali percobaan.
 */
async function withGeneratedReferenceNo(env, entryDate, insertFn, attempts = 5) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const referenceNo = await generateReferenceNo(env, entryDate);

    try {
      return await insertFn(referenceNo);
    } catch (error) {
      const isUniqueConflict = String(error?.message || "").includes("UNIQUE");
      if (!isUniqueConflict) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

/* ------------------------------------------------------------------ */
/* Tutup Buku (Book Closing)                                           */
/* ------------------------------------------------------------------ */

/**
 * Tutup buku di sini mengunci PER BULAN KALENDER (tgl 1 s/d akhir bulan),
 * beda dari startOfAccountingPeriod di frontend (dipakai untuk laporan
 * budget vs actual, mulai tgl 2). Tombol "Tutup Buku" diklik admin di
 * awal bulan berikutnya untuk mengunci seluruh transaksi bulan yang baru
 * lewat, supaya tidak bisa diubah/dihapus lagi setelah laporan final.
 */
const MONTH_LABELS_ID_TUTUP_BUKU = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function formatPeriodLabel(periodMonth) {
  const [year, month] = String(periodMonth).split("-").map(Number);
  return `${MONTH_LABELS_ID_TUTUP_BUKU[month - 1] ?? month} ${year}`;
}

function calendarMonthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

async function latestClosedPeriod(env) {
  const row = await env.DB.prepare(
    `SELECT period_month FROM book_closings ORDER BY period_month DESC LIMIT 1`
  ).first();
  return row ? row.period_month : null;
}

/**
 * Lempar error kalau tanggal jatuh di bulan yang sudah ditutup bukunya.
 * Dipanggil di semua titik yang membuat/mengubah/menghapus/membatalkan
 * jurnal — langsung lewat menu Jurnal maupun otomatis lewat menu
 * Piutang & Utang — supaya tutup buku benar-benar mengunci transaksinya,
 * bukan cuma penanda/reminder visual di halaman Tutup Buku.
 */
async function assertPeriodOpen(env, dateStr) {
  if (!dateStr) return;
  const closed = await latestClosedPeriod(env);
  if (closed && calendarMonthOf(dateStr) <= closed) {
    throw httpError(
      422,
      `Periode ${formatPeriodLabel(calendarMonthOf(dateStr))} sudah ditutup (tutup buku) dan tidak bisa diubah. Buka kembali periode itu dari menu Tutup Buku kalau memang perlu koreksi.`,
      { entry_date: "Tanggal berada pada periode yang sudah ditutup" }
    );
  }
}

/** Data mentah status tutup buku, dipakai baik oleh endpoint GET maupun validasi POST. */
async function computeBookClosingStatus(env) {
  const result = await env.DB.prepare(
    `SELECT bc.period_month, bc.closed_at, bc.notes, u.full_name AS closed_by_name
     FROM book_closings bc
     LEFT JOIN users u ON u.id = bc.closed_by
     ORDER BY bc.period_month DESC`
  ).all();

  const closedPeriods = result.results || [];
  const latestClosed = closedPeriods[0]?.period_month || null;

  let nextToClose = null;
  if (latestClosed) {
    const [y, m] = latestClosed.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    nextToClose = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  } else {
    const earliest = await env.DB.prepare(
      `SELECT MIN(entry_date) AS min_date FROM journal_entries WHERE status != 'void'`
    ).first();
    if (earliest?.min_date) {
      nextToClose = calendarMonthOf(earliest.min_date);
    }
  }

  const currentMonth = calendarMonthOf(new Date().toISOString().slice(0, 10));
  const needsClosingReminder = Boolean(nextToClose && nextToClose < currentMonth);

  return {
    closedPeriods,
    latestClosed,
    nextToClose,
    currentMonth,
    needsClosingReminder
  };
}

async function getBookClosingStatus(env, corsHeaders) {
  const status = await computeBookClosingStatus(env);

  return json(
    {
      data: {
        closed_periods: status.closedPeriods.map((row) => ({
          period_month: row.period_month,
          period_label: formatPeriodLabel(row.period_month),
          closed_at: row.closed_at,
          closed_by_name: row.closed_by_name,
          notes: row.notes
        })),
        latest_closed_period: status.latestClosed,
        next_to_close: status.nextToClose,
        next_to_close_label: status.nextToClose ? formatPeriodLabel(status.nextToClose) : null,
        current_month: status.currentMonth,
        needs_closing_reminder: status.needsClosingReminder
      }
    },
    { corsHeaders }
  );
}

/**
 * Tutup buku satu periode ('YYYY-MM'). Harus persis periode berikutnya
 * setelah yang terakhir ditutup (tidak boleh loncat bulan / ada gap),
 * dan tidak boleh menutup bulan yang masih berjalan atau bulan depan.
 */
async function closeBookPeriod(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const periodMonth = payload.period_month;

  if (!/^\d{4}-\d{2}$/.test(String(periodMonth || ""))) {
    throw httpError(422, "Invalid payload", { period_month: "wajib diisi, format YYYY-MM" });
  }

  const status = await computeBookClosingStatus(env);

  if (!status.nextToClose) {
    throw httpError(422, "Belum ada transaksi jurnal untuk ditutup bukunya.");
  }

  if (periodMonth !== status.nextToClose) {
    throw httpError(
      422,
      `Periode yang bisa ditutup sekarang hanya ${formatPeriodLabel(status.nextToClose)}. Tutup buku harus berurutan, tidak boleh loncat bulan.`,
      { period_month: `Harus ${status.nextToClose}` }
    );
  }

  if (periodMonth >= status.currentMonth) {
    throw httpError(422, "Tidak bisa menutup buku untuk bulan yang masih berjalan atau bulan depan.", {
      period_month: "Bulan ini/depan belum bisa ditutup"
    });
  }

  const notes = payload.notes ? String(payload.notes).trim().slice(0, 500) : null;

  try {
    await env.DB.prepare(`INSERT INTO book_closings (period_month, closed_by, notes) VALUES (?, ?, ?)`)
      .bind(periodMonth, user.id, notes)
      .run();
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw httpError(409, "Periode ini sudah pernah ditutup");
    }
    throw error;
  }

  return await getBookClosingStatus(env, corsHeaders);
}

/**
 * Buka kembali (undo) tutup buku. Hanya periode yang PALING BARU ditutup
 * yang boleh dibuka kembali, supaya tidak ada periode terbuka "di
 * tengah-tengah" beberapa periode yang sudah tertutup.
 */
async function reopenBookPeriod(periodMonth, env, corsHeaders) {
  const latest = await latestClosedPeriod(env);

  if (!latest || latest !== periodMonth) {
    throw httpError(
      422,
      `Hanya periode yang terakhir ditutup (${latest ? formatPeriodLabel(latest) : "-"}) yang bisa dibuka kembali.`
    );
  }

  await env.DB.prepare(`DELETE FROM book_closings WHERE period_month = ?`).bind(periodMonth).run();

  return await getBookClosingStatus(env, corsHeaders);
}

async function createJournal(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const { errors, normalizedLines, tags } = validateJournalPayload(payload);

  if (errors) {
    throw httpError(422, "Invalid journal entry payload", errors);
  }

  await assertPeriodOpen(env, payload.entry_date);

  for (const line of normalizedLines) {
    const account = await findAccountById(env, line.account_id);

    if (!account || !Number(account.is_active)) {
      throw httpError(422, "Invalid journal entry payload", {
        account_id: `Account ${line.account_id} does not exist or is inactive`
      });
    }
  }

  const manualReferenceNo = payload.reference_no ? String(payload.reference_no).trim() : "";
  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

  async function insertEntry(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by, tags)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?, ?)
       RETURNING *`
    )
      .bind(payload.entry_date, referenceNo, String(payload.description).trim(), user.id, user.id, tagsJson)
      .first();
  }

  let entry;
  try {
    entry = manualReferenceNo
      ? await insertEntry(manualReferenceNo)
      : await withGeneratedReferenceNo(env, payload.entry_date, insertEntry);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw httpError(409, "Nomor referensi sudah digunakan", { reference_no: "reference_no must be unique" });
    }
    throw error;
  }

  const statements = normalizedLines.map((line, index) =>
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(entry.id, line.account_id, index + 1, line.memo || null, line.debit_amount, line.credit_amount)
  );

  await env.DB.batch(statements);

  return getJournal(entry.id, env, corsHeaders, 201);
}

async function updateJournal(id, request, env, corsHeaders) {
  const current = await env.DB.prepare("SELECT * FROM journal_entries WHERE id = ?").bind(id).first();

  if (!current) {
    throw httpError(404, "Journal entry not found");
  }

  if (current.status === "void") {
    throw httpError(422, "Jurnal yang berstatus void tidak dapat diedit");
  }

  await assertPeriodOpen(env, current.entry_date);

  const payload = await readJson(request);
  const { errors, normalizedLines, tags } = validateJournalPayload(payload);

  if (errors) {
    throw httpError(422, "Invalid journal entry payload", errors);
  }

  await assertPeriodOpen(env, payload.entry_date);

  for (const line of normalizedLines) {
    const account = await findAccountById(env, line.account_id);

    if (!account || !Number(account.is_active)) {
      throw httpError(422, "Invalid journal entry payload", {
        account_id: `Account ${line.account_id} does not exist or is inactive`
      });
    }
  }

  const manualReferenceNo = payload.reference_no ? String(payload.reference_no).trim() : "";
  const referenceNo =
    manualReferenceNo || current.reference_no || (await generateReferenceNo(env, payload.entry_date));
  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

  const statements = [
    env.DB.prepare(
      `UPDATE journal_entries
       SET entry_date = ?, reference_no = ?, description = ?, tags = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(payload.entry_date, referenceNo, String(payload.description).trim(), tagsJson, id),
    env.DB.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").bind(id),
    ...normalizedLines.map((line, index) =>
      env.DB.prepare(
        `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, line.account_id, index + 1, line.memo || null, line.debit_amount, line.credit_amount)
    )
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw httpError(409, "Nomor referensi sudah digunakan", { reference_no: "reference_no must be unique" });
    }
    throw error;
  }

  return getJournal(id, env, corsHeaders);
}

/**
 * Batalkan (void) satu jurnal tanpa menghapusnya secara permanen. Jurnal
 * yang di-void tidak lagi ikut dihitung di laporan manapun (semua laporan
 * hanya membaca baris dengan status 'posted'), tapi datanya tetap ada
 * untuk jejak audit dan bisa dilihat lagi lewat riwayat jurnal.
 *
 * Kalau jurnal ini adalah penyesuaian piutang marketplace atau penarikan
 * dana yang salah posting, ini jalan yang aman untuk membersihkannya dari
 * Laba Rugi/Neraca tanpa kehilangan riwayatnya.
 */
async function voidJournal(id, request, env, user, corsHeaders) {
  const current = await env.DB.prepare("SELECT * FROM journal_entries WHERE id = ?").bind(id).first();

  if (!current) {
    throw httpError(404, "Journal entry not found");
  }

  if (current.status === "void") {
    throw httpError(422, "Jurnal ini sudah berstatus void");
  }

  await assertPeriodOpen(env, current.entry_date);

  const payload = await readJson(request).catch(() => ({}));
  const reason = payload && payload.reason ? String(payload.reason).trim().slice(0, 500) : null;

  await env.DB.prepare(
    `UPDATE journal_entries
     SET status = 'void', voided_at = datetime('now'), voided_by = ?, void_reason = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(user.id, reason, id)
    .run();

  return getJournal(id, env, corsHeaders);
}

/**
 * Daftar tag unik yang pernah dipakai, untuk autocomplete di form
 * jurnal umum dan di filter riwayat jurnal (mirip Mekari Jurnal).
 * Diurutkan dari yang paling sering dipakai.
 */
async function listJournalTags(env, corsHeaders) {
  const result = await env.DB.prepare(
    `SELECT tags FROM journal_entries WHERE tags IS NOT NULL AND status != 'void' LIMIT 5000`
  ).all();

  const counts = new Map();
  for (const row of result.results) {
    for (const tag of parseTagsColumn(row.tags)) {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { tag, count: 1 });
      }
    }
  }

  const tags = Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((entry) => entry.tag);

  return json({ data: tags }, { corsHeaders });
}

/**
 * Hapus jurnal secara permanen (beserta baris-barisnya lewat ON DELETE
 * CASCADE). Dibatasi untuk role admin saja karena tindakan ini tidak bisa
 * dibatalkan — untuk koreksi jurnal yang masih perlu jejak audit, gunakan
 * void, bukan delete.
 */
async function deleteJournal(id, env, corsHeaders) {
  const current = await env.DB.prepare("SELECT id, entry_date FROM journal_entries WHERE id = ?").bind(id).first();

  if (!current) {
    throw httpError(404, "Journal entry not found");
  }

  await assertPeriodOpen(env, current.entry_date);

  // Jurnal yang dibuat otomatis dari Piutang & Utang (invoice, tagihan, atau
  // pembayarannya) tidak boleh dihapus langsung dari sini — akan melanggar
  // foreign key (ar_invoices/ap_bills/*_payments.journal_entry_id) dan gagal
  // dengan "Internal server error" yang membingungkan. Deteksi dulu dan
  // kasih pesan yang jelas, arahkan ke tempat yang benar untuk membatalkannya.
  const [arInvoice, arPayment, apBill, apPayment] = await Promise.all([
    env.DB.prepare("SELECT invoice_no FROM ar_invoices WHERE journal_entry_id = ?").bind(id).first(),
    env.DB.prepare(
      `SELECT i.invoice_no FROM ar_invoice_payments p
       JOIN ar_invoices i ON i.id = p.invoice_id
       WHERE p.journal_entry_id = ?`
    ).bind(id).first(),
    env.DB.prepare("SELECT bill_no FROM ap_bills WHERE journal_entry_id = ?").bind(id).first(),
    env.DB.prepare(
      `SELECT b.bill_no FROM ap_bill_payments p
       JOIN ap_bills b ON b.id = p.bill_id
       WHERE p.journal_entry_id = ?`
    ).bind(id).first()
  ]);

  if (arInvoice) {
    throw httpError(422, `Jurnal ini adalah invoice ${arInvoice.invoice_no}. Batalkan (void) invoice-nya dari menu Piutang & Utang, bukan dari sini.`);
  }
  if (arPayment) {
    throw httpError(422, `Jurnal ini adalah pembayaran untuk invoice ${arPayment.invoice_no}. Kelola dari menu Piutang & Utang.`);
  }
  if (apBill) {
    throw httpError(422, `Jurnal ini adalah tagihan ${apBill.bill_no}. Batalkan (void) tagihannya dari menu Piutang & Utang, bukan dari sini.`);
  }
  if (apPayment) {
    throw httpError(422, `Jurnal ini adalah pembayaran untuk tagihan ${apPayment.bill_no}. Kelola dari menu Piutang & Utang.`);
  }

  await env.DB.prepare("DELETE FROM journal_entries WHERE id = ?").bind(id).run();

  return new Response(null, { status: 204, headers: corsHeaders });
}

/* ------------------------------------------------------------------ */
/* Template Jurnal Berulang (Recurring)                                */
/* ------------------------------------------------------------------ */

/**
 * period_month ('YYYY-MM') periode akuntansi saat ini, dihitung server-
 * side sebagai fallback kalau frontend tidak mengirim period_month.
 * Konsisten dengan startOfAccountingPeriod di frontend: periode dimulai
 * tanggal 2, jadi tanggal 1 masih masuk periode bulan sebelumnya.
 */
function currentPeriodMonthUTC() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (today.getUTCDate() === 1) {
    today.setUTCMonth(today.getUTCMonth() - 1);
  }

  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Validasi payload template: mirip validateJournalPayload tapi tanpa entry_date. */
function validateTemplatePayload(payload) {
  const errors = {};

  if (!payload.name || String(payload.name).trim() === "") {
    errors.name = "name is required";
  }

  const { tags, error: tagsError } = normalizeTags(payload.tags);
  if (tagsError) {
    errors.tags = tagsError;
  }

  if (!Array.isArray(payload.lines) || payload.lines.length < 2) {
    errors.lines = "template must contain at least two lines";
    return { errors, normalizedLines: [], tags };
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const normalizedLines = [];

  payload.lines.forEach((line, index) => {
    const lineErrors = {};

    if (!line.account_id) {
      lineErrors.account_id = "account_id is required";
    }

    const debit = parseMoney(line.debit ?? 0);
    const credit = parseMoney(line.credit ?? 0);

    if (debit === null || credit === null) {
      lineErrors.amount = "debit and credit must be valid monetary amounts with max 2 decimals";
    } else if (debit < 0 || credit < 0) {
      lineErrors.amount = "debit and credit must be zero or positive";
    } else if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
      lineErrors.amount = "each line must contain either debit or credit, not both";
    }

    if (Object.keys(lineErrors).length > 0) {
      errors[`lines[${index}]`] = lineErrors;
    }

    totalDebit = roundMoney(totalDebit + (debit || 0));
    totalCredit = roundMoney(totalCredit + (credit || 0));
    normalizedLines.push({ ...line, debit_amount: debit || 0, credit_amount: credit || 0 });
  });

  if (totalDebit !== totalCredit) {
    errors.balance = "total debit must equal total credit";
    errors.total_debit = totalDebit;
    errors.total_credit = totalCredit;
  }

  return { errors: Object.keys(errors).length > 0 ? errors : null, normalizedLines, tags };
}

async function listJournalTemplates(url, env, corsHeaders) {
  const periodMonth = isValidPeriodMonth(url.searchParams.get("period_month"))
    ? url.searchParams.get("period_month")
    : currentPeriodMonthUTC();

  const templates = await env.DB.prepare(
    `SELECT * FROM journal_templates ORDER BY is_active DESC, name COLLATE NOCASE ASC`
  ).all();

  if (templates.results.length === 0) {
    return json({ data: [], period_month: periodMonth }, { corsHeaders });
  }

  const templateIds = templates.results.map((t) => t.id);
  const lines = await fetchTemplateLinesForIds(env, templateIds);
  const runs = await env.DB.prepare(
    `SELECT tr.template_id, tr.period_month, tr.generated_at, je.id AS journal_entry_id, je.reference_no
     FROM journal_template_runs tr
     JOIN journal_entries je ON je.id = tr.journal_entry_id
     WHERE tr.period_month = ?`
  )
    .bind(periodMonth)
    .all();

  const linesByTemplate = new Map();
  for (const line of lines) {
    if (!linesByTemplate.has(line.template_id)) linesByTemplate.set(line.template_id, []);
    linesByTemplate.get(line.template_id).push(line);
  }

  const runByTemplate = new Map(runs.results.map((run) => [run.template_id, run]));

  const data = templates.results.map((template) => {
    const templateLines = linesByTemplate.get(template.id) || [];
    const totalAmount = roundMoney(templateLines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
    const run = runByTemplate.get(template.id);

    return {
      ...template,
      is_active: Boolean(template.is_active),
      tags: parseTagsColumn(template.tags),
      lines: templateLines,
      total_amount: totalAmount,
      generated_this_period: Boolean(run),
      last_run_this_period: run
        ? { journal_entry_id: run.journal_entry_id, reference_no: run.reference_no, generated_at: run.generated_at }
        : null
    };
  });

  return json({ data, period_month: periodMonth }, { corsHeaders });
}

async function fetchTemplateLinesForIds(env, templateIds) {
  if (templateIds.length === 0) return [];

  const allLines = [];
  for (const chunk of chunkArray(templateIds, 90)) {
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT tl.*, coa.account_code, coa.account_name, coa.account_type
       FROM journal_template_lines tl
       JOIN chart_of_accounts coa ON coa.id = tl.account_id
       WHERE tl.template_id IN (${placeholders})
       ORDER BY tl.template_id ASC, tl.line_no ASC`
    )
      .bind(...chunk)
      .all();
    allLines.push(...result.results);
  }
  return allLines;
}

async function getJournalTemplate(id, env, corsHeaders) {
  const template = await env.DB.prepare("SELECT * FROM journal_templates WHERE id = ?").bind(id).first();
  if (!template) {
    throw httpError(404, "Journal template not found");
  }

  const lines = await env.DB.prepare(
    `SELECT tl.*, coa.account_code, coa.account_name, coa.account_type
     FROM journal_template_lines tl
     JOIN chart_of_accounts coa ON coa.id = tl.account_id
     WHERE tl.template_id = ?
     ORDER BY tl.line_no ASC`
  )
    .bind(id)
    .all();

  const runs = await env.DB.prepare(
    `SELECT tr.period_month, tr.generated_at, je.id AS journal_entry_id, je.reference_no
     FROM journal_template_runs tr
     JOIN journal_entries je ON je.id = tr.journal_entry_id
     WHERE tr.template_id = ?
     ORDER BY tr.period_month DESC
     LIMIT 12`
  )
    .bind(id)
    .all();

  return json(
    {
      data: {
        ...template,
        is_active: Boolean(template.is_active),
        tags: parseTagsColumn(template.tags),
        lines: lines.results,
        recent_runs: runs.results
      }
    },
    { corsHeaders }
  );
}

async function createJournalTemplate(request, env, user, corsHeaders) {
  const payload = await readJson(request);
  const { errors, normalizedLines, tags } = validateTemplatePayload(payload);

  if (errors) {
    throw httpError(422, "Invalid journal template payload", errors);
  }

  for (const line of normalizedLines) {
    const account = await findAccountById(env, line.account_id);
    if (!account || !Number(account.is_active)) {
      throw httpError(422, "Invalid journal template payload", {
        account_id: `Account ${line.account_id} does not exist or is inactive`
      });
    }
  }

  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

  const template = await env.DB.prepare(
    `INSERT INTO journal_templates (name, description, tags, created_by)
     VALUES (?, ?, ?, ?)
     RETURNING *`
  )
    .bind(String(payload.name).trim(), payload.description ? String(payload.description).trim() : null, tagsJson, user.id)
    .first();

  const statements = normalizedLines.map((line, index) =>
    env.DB.prepare(
      `INSERT INTO journal_template_lines (template_id, line_no, account_id, memo, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(template.id, index + 1, line.account_id, line.memo || null, line.debit_amount, line.credit_amount)
  );
  await env.DB.batch(statements);

  return getJournalTemplate(template.id, env, corsHeaders);
}

async function updateJournalTemplate(id, request, env, corsHeaders) {
  const current = await env.DB.prepare("SELECT id FROM journal_templates WHERE id = ?").bind(id).first();
  if (!current) {
    throw httpError(404, "Journal template not found");
  }

  const payload = await readJson(request);

  // Toggle aktif/nonaktif saja (tanpa mengubah nama/baris) — dipakai
  // tombol "Nonaktifkan" di daftar template tanpa perlu buka form penuh.
  if (typeof payload.is_active === "boolean" && payload.lines === undefined) {
    await env.DB.prepare("UPDATE journal_templates SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(payload.is_active ? 1 : 0, id)
      .run();
    return getJournalTemplate(id, env, corsHeaders);
  }

  const { errors, normalizedLines, tags } = validateTemplatePayload(payload);
  if (errors) {
    throw httpError(422, "Invalid journal template payload", errors);
  }

  for (const line of normalizedLines) {
    const account = await findAccountById(env, line.account_id);
    if (!account || !Number(account.is_active)) {
      throw httpError(422, "Invalid journal template payload", {
        account_id: `Account ${line.account_id} does not exist or is inactive`
      });
    }
  }

  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;
  const isActive = typeof payload.is_active === "boolean" ? (payload.is_active ? 1 : 0) : 1;

  const statements = [
    env.DB.prepare(
      `UPDATE journal_templates SET name = ?, description = ?, tags = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(String(payload.name).trim(), payload.description ? String(payload.description).trim() : null, tagsJson, isActive, id),
    env.DB.prepare("DELETE FROM journal_template_lines WHERE template_id = ?").bind(id),
    ...normalizedLines.map((line, index) =>
      env.DB.prepare(
        `INSERT INTO journal_template_lines (template_id, line_no, account_id, memo, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, index + 1, line.account_id, line.memo || null, line.debit_amount, line.credit_amount)
    )
  ];

  await env.DB.batch(statements);

  return getJournalTemplate(id, env, corsHeaders);
}

async function deleteJournalTemplate(id, env, corsHeaders) {
  const current = await env.DB.prepare("SELECT id FROM journal_templates WHERE id = ?").bind(id).first();
  if (!current) {
    throw httpError(404, "Journal template not found");
  }

  // Jurnal yang sudah pernah di-generate dari template ini TIDAK ikut
  // terhapus — hanya baris tracking di journal_template_runs (via ON
  // DELETE CASCADE) dan template_lines yang hilang. Jurnalnya sendiri
  // jadi berdiri sendiri seperti jurnal manual biasa.
  await env.DB.prepare("DELETE FROM journal_templates WHERE id = ?").bind(id).run();

  return new Response(null, { status: 204, headers: corsHeaders });
}

async function generateJournalFromTemplate(id, request, env, user, corsHeaders) {
  const template = await env.DB.prepare("SELECT * FROM journal_templates WHERE id = ?").bind(id).first();
  if (!template) {
    throw httpError(404, "Journal template not found");
  }
  if (!Number(template.is_active)) {
    throw httpError(422, "Template nonaktif tidak dapat digenerate. Aktifkan dulu template ini.");
  }

  const payload = await readJson(request).catch(() => ({}));
  const periodMonth = isValidPeriodMonth(payload.period_month) ? payload.period_month : currentPeriodMonthUTC();
  const entryDate = isValidDate(payload.entry_date) ? payload.entry_date : new Date().toISOString().slice(0, 10);

  const existingRun = await env.DB.prepare(
    "SELECT tr.*, je.reference_no FROM journal_template_runs tr JOIN journal_entries je ON je.id = tr.journal_entry_id WHERE tr.template_id = ? AND tr.period_month = ?"
  )
    .bind(id, periodMonth)
    .first();

  if (existingRun) {
    throw httpError(409, `Template ini sudah digenerate untuk periode ${periodMonth} (jurnal ${existingRun.reference_no})`, {
      journal_entry_id: existingRun.journal_entry_id,
      reference_no: existingRun.reference_no
    });
  }

  const lines = await env.DB.prepare(
    "SELECT * FROM journal_template_lines WHERE template_id = ? ORDER BY line_no ASC"
  )
    .bind(id)
    .all();

  if (lines.results.length < 2) {
    throw httpError(422, "Template belum punya minimal 2 baris jurnal");
  }

  for (const line of lines.results) {
    const account = await findAccountById(env, line.account_id);
    if (!account || !Number(account.is_active)) {
      throw httpError(422, `Akun pada template ini sudah tidak aktif (account_id: ${line.account_id})`);
    }
  }

  const description = template.description?.trim() || template.name;
  const tagsJson = template.tags || null;

  async function insertEntry(referenceNo) {
    return env.DB.prepare(
      `INSERT INTO journal_entries (entry_date, reference_no, description, status, posted_at, created_by, posted_by, tags)
       VALUES (?, ?, ?, 'posted', datetime('now'), ?, ?, ?)
       RETURNING *`
    )
      .bind(entryDate, referenceNo, description, user.id, user.id, tagsJson)
      .first();
  }

  const entry = await withGeneratedReferenceNo(env, entryDate, insertEntry);

  const statements = lines.results.map((line, index) =>
    env.DB.prepare(
      `INSERT INTO journal_lines (journal_entry_id, account_id, line_no, memo, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(entry.id, line.account_id, index + 1, line.memo, line.debit, line.credit)
  );
  statements.push(
    env.DB.prepare(
      `INSERT INTO journal_template_runs (template_id, period_month, journal_entry_id, generated_by)
       VALUES (?, ?, ?, ?)`
    ).bind(id, periodMonth, entry.id, user.id)
  );

  await env.DB.batch(statements);

  return getJournal(entry.id, env, corsHeaders, 201);
}

// D1 (Cloudflare's SQLite) rejects a query with more than ~100 bound
// parameters ("too many SQL variables"). Fetching journal_lines with
// `WHERE journal_entry_id IN (...)` breaks once more than ~100 journal
// entries are involved — which happens easily on "export all" with
// hundreds of transactions. Split the id list into safe-sized batches
// and merge the results instead of binding them all in one query.
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function fetchJournalLinesForEntryIds(env, ids) {
  if (ids.length === 0) {
    return [];
  }

  const CHUNK_SIZE = 90; // safely under D1's ~100 bound-parameter limit
  const chunks = chunkArray(ids, CHUNK_SIZE);
  const allLines = [];

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT jl.*, coa.account_code, coa.account_name, coa.account_type
       FROM journal_lines jl
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       WHERE jl.journal_entry_id IN (${placeholders})
       ORDER BY jl.journal_entry_id ASC, jl.line_no ASC`
    )
      .bind(...chunk)
      .all();
    allLines.push(...result.results);
  }

  return allLines;
}

async function fetchJournalEntriesByIds(env, ids) {
  if (ids.length === 0) {
    return [];
  }

  const CHUNK_SIZE = 90; // safely under D1's ~100 bound-parameter limit
  const chunks = chunkArray(ids, CHUNK_SIZE);
  const allEntries = [];

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `SELECT * FROM journal_entries WHERE id IN (${placeholders})`
    )
      .bind(...chunk)
      .all();
    allEntries.push(...result.results);
  }

  allEntries.sort((a, b) => {
    if (a.entry_date === b.entry_date) return a.id - b.id;
    return a.entry_date < b.entry_date ? -1 : 1;
  });

  return allEntries;
}

async function listJournals(url, env, corsHeaders) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const tag = url.searchParams.get("tag");
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") || 50) || 50));

  const conditions = [];
  const values = [];

  if (startDate) {
    conditions.push("entry_date >= ?");
    values.push(startDate);
  }

  if (endDate) {
    conditions.push("entry_date <= ?");
    values.push(endDate);
  }

  if (status) {
    conditions.push("status = ?");
    values.push(status);
  }

  if (search) {
    conditions.push("(description LIKE ? OR reference_no LIKE ?)");
    values.push(`%${search}%`, `%${search}%`);
  }

  if (tag) {
    // tags disimpan sebagai JSON array text mis. ["Proyek A","Cabang B"];
    // cocokkan literal tag di antara tanda kutip supaya "Proyek A" tidak
    // ikut cocok saat filter tag-nya cuma "Proyek".
    conditions.push("tags LIKE ?");
    values.push(`%"${tag}"%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM journal_entries ${where}`)
    .bind(...values)
    .first();
  const total = Number(countRow?.total || 0);

  const offset = (page - 1) * pageSize;
  const entriesResult = await env.DB.prepare(
    `SELECT * FROM journal_entries
     ${where}
     ORDER BY entry_date DESC, id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...values, pageSize, offset)
    .all();

  const entries = entriesResult.results;

  if (entries.length === 0) {
    return json(
      { data: [], meta: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) || 0 } },
      { corsHeaders }
    );
  }

  const ids = entries.map((entry) => entry.id);
  const lines = await fetchJournalLinesForEntryIds(env, ids);

  const linesByEntry = new Map();
  for (const line of lines) {
    if (!linesByEntry.has(line.journal_entry_id)) {
      linesByEntry.set(line.journal_entry_id, []);
    }
    linesByEntry.get(line.journal_entry_id).push(line);
  }

  const data = entries.map((entry) => {
    const entryLines = linesByEntry.get(entry.id) || [];
    const debitLines = entryLines.filter((line) => Number(line.debit) > 0);
    const creditLines = entryLines.filter((line) => Number(line.credit) > 0);
    const amount = debitLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);

    return {
      ...entry,
      tags: parseTagsColumn(entry.tags),
      lines: entryLines,
      debit_accounts: debitLines.map((line) => line.account_name).join(", "),
      credit_accounts: creditLines.map((line) => line.account_name).join(", "),
      amount: roundMoney(amount)
    };
  });

  return json(
    { data, meta: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) || 0 } },
    { corsHeaders }
  );
}

async function exportJournals(url, env, corsHeaders) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
  const idsParam = url.searchParams.get("ids");

  if (format !== "xlsx" && format !== "pdf") {
    throw httpError(422, "Invalid export format", { format: "format must be xlsx or pdf" });
  }

  // Export is capped at 5000 rows to stay well within Workers' CPU/memory limits.
  const EXPORT_ROW_CAP = 5000;

  let entries;
  let isSelection = false;

  if (idsParam) {
    // User picked specific rows to export (checkbox selection in the UI)
    // instead of exporting everything matching the filters.
    isSelection = true;
    const ids = [...new Set(idsParam.split(",").map((value) => Number(value.trim())))].filter(
      (value) => Number.isInteger(value) && value > 0
    );

    if (ids.length === 0) {
      throw httpError(422, "Invalid export selection", { ids: "ids must contain at least one valid journal id" });
    }

    if (ids.length > EXPORT_ROW_CAP) {
      throw httpError(422, "Invalid export selection", {
        ids: `cannot export more than ${EXPORT_ROW_CAP} entries at once`
      });
    }

    entries = await fetchJournalEntriesByIds(env, ids);
  } else {
    const conditions = [];
    const values = [];

    if (startDate) {
      conditions.push("entry_date >= ?");
      values.push(startDate);
    }

    if (endDate) {
      conditions.push("entry_date <= ?");
      values.push(endDate);
    }

    if (status) {
      conditions.push("status = ?");
      values.push(status);
    }

    if (search) {
      conditions.push("(description LIKE ? OR reference_no LIKE ?)");
      values.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const entriesResult = await env.DB.prepare(
      `SELECT * FROM journal_entries
       ${where}
       ORDER BY entry_date ASC, id ASC
       LIMIT ?`
    )
      .bind(...values, EXPORT_ROW_CAP)
      .all();

    entries = entriesResult.results;
  }

  let data = [];

  if (entries.length > 0) {
    const ids = entries.map((entry) => entry.id);
    const lines = await fetchJournalLinesForEntryIds(env, ids);

    const linesByEntry = new Map();
    for (const line of lines) {
      if (!linesByEntry.has(line.journal_entry_id)) {
        linesByEntry.set(line.journal_entry_id, []);
      }
      linesByEntry.get(line.journal_entry_id).push(line);
    }

    data = entries.map((entry) => {
      const lines = linesByEntry.get(entry.id) || [];
      const debitLines = lines.filter((line) => Number(line.debit) > 0);
      const creditLines = lines.filter((line) => Number(line.credit) > 0);
      const amount = debitLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);

      return {
        ...entry,
        debit_accounts: debitLines.map((line) => line.account_name).join(", "),
        credit_accounts: creditLines.map((line) => line.account_name).join(", "),
        amount: roundMoney(amount)
      };
    });
  }

  const subtitleParts = [];
  if (isSelection) {
    subtitleParts.push(`${entries.length} transaksi terpilih`);
  } else {
    if (startDate) subtitleParts.push(`Dari ${startDate}`);
    if (endDate) subtitleParts.push(`Sampai ${endDate}`);
    if (search) subtitleParts.push(`Pencarian: "${search}"`);
  }
  const meta = { subtitle: subtitleParts.length ? subtitleParts.join(" · ") : "Seluruh Transaksi" };

  const body = format === "pdf" ? await ReportExport.journalPdf(data, meta) : ReportExport.journalXlsx(data, meta);
  const filename = ReportExport.makeFileName("jurnal-harian", format);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": ReportExport.contentTypeFor(format),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      ...corsHeaders
    }
  });
}

async function getJournal(id, env, corsHeaders, status = 200) {
  const entry = await env.DB.prepare("SELECT * FROM journal_entries WHERE id = ?").bind(id).first();

  if (!entry) {
    throw httpError(404, "Journal entry not found");
  }

  const result = await env.DB.prepare(
    `SELECT jl.*, coa.account_code, coa.account_name, coa.account_type
     FROM journal_lines jl
     JOIN chart_of_accounts coa ON coa.id = jl.account_id
     WHERE jl.journal_entry_id = ?
     ORDER BY jl.line_no ASC`
  )
    .bind(id)
    .all();

  return json(
    { data: { ...entry, tags: parseTagsColumn(entry.tags), lines: result.results } },
    { status, corsHeaders }
  );
}

/** Parse kolom journal_entries.tags (JSON array text, bisa null) jadi array string. */
function parseTagsColumn(rawTags) {
  if (!rawTags) return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function incomeStatement(url, env, corsHeaders) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const report = await buildIncomeStatementReport(startDate, endDate, env);
  return noStoreJson({ data: { report_type: "income_statement", ...report } }, corsHeaders);
}

async function buildIncomeStatementReport(startDate, endDate, env) {
  validatePeriod(startDate, endDate);

  const result = await env.DB.prepare(
    `SELECT
       coa.id AS account_id,
       coa.account_code,
       coa.account_name,
       coa.account_type,
       COALESCE(SUM(jl.debit), 0) AS total_debit,
       COALESCE(SUM(jl.credit), 0) AS total_credit,
       CASE
         WHEN coa.account_type = 'revenue' THEN COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
         WHEN coa.account_type IN ('expense', 'cogs') THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
         ELSE 0
       END AS amount
     FROM chart_of_accounts coa
     JOIN journal_lines jl ON jl.account_id = coa.id
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.status = 'posted'
       AND je.entry_date BETWEEN ? AND ?
       AND coa.account_type IN ('revenue', 'expense', 'cogs')
     GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
     ORDER BY
       CASE account_type WHEN 'revenue' THEN 1 WHEN 'cogs' THEN 2 WHEN 'expense' THEN 3 ELSE 4 END,
       account_code ASC`
  )
    .bind(startDate, endDate)
    .all();

  return splitIncomeRows(result.results, startDate, endDate);
}

/* ------------------------------------------------------------------ */
/* Anggaran (Budget vs Actual)                                         */
/* ------------------------------------------------------------------ */

const PERIOD_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function isValidPeriodMonth(value) {
  return typeof value === "string" && PERIOD_MONTH_PATTERN.test(value);
}

/**
 * Rentang tanggal aktual periode akuntansi untuk period_month 'YYYY-MM'.
 * Konsisten dengan startOfAccountingPeriod di frontend: periode dimulai
 * tanggal 2 bulan tsb dan berakhir tanggal 1 bulan berikutnya.
 */
function accountingPeriodRangeForMonth(periodMonth) {
  const [year, month] = periodMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 2));
  const end = new Date(Date.UTC(year, month, 1));

  const format = (date) => date.toISOString().slice(0, 10);
  return { start: format(start), end: format(end) };
}

async function listBudgets(url, env, corsHeaders) {
  const periodMonth = url.searchParams.get("period_month");

  if (!isValidPeriodMonth(periodMonth)) {
    throw httpError(422, "Invalid period_month", { period_month: "period_month is required in YYYY-MM format" });
  }

  const { start, end } = accountingPeriodRangeForMonth(periodMonth);

  // Semua akun pendapatan/HPP/beban aktif, LEFT JOIN ke anggaran periode
  // ini (kalau belum diset, budget_amount tampil 0) dan realisasi aktual
  // dari jurnal yang sudah posted dalam rentang tanggal periode tsb.
  const result = await env.DB.prepare(
    `SELECT
       coa.id AS account_id,
       coa.account_code,
       coa.account_name,
       coa.account_type,
       COALESCE(b.amount, 0) AS budget_amount,
       b.notes AS notes,
       COALESCE(actual.amount, 0) AS actual_amount
     FROM chart_of_accounts coa
     LEFT JOIN budgets b ON b.account_id = coa.id AND b.period_month = ?
     LEFT JOIN (
       SELECT
         jl.account_id,
         CASE
           WHEN coa2.account_type = 'revenue' THEN COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
           ELSE COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
         END AS amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts coa2 ON coa2.id = jl.account_id
       WHERE je.status = 'posted' AND je.entry_date BETWEEN ? AND ?
       GROUP BY jl.account_id
     ) actual ON actual.account_id = coa.id
     WHERE coa.account_type IN ('revenue', 'cogs', 'expense') AND coa.is_active = 1
     ORDER BY
       CASE coa.account_type WHEN 'revenue' THEN 1 WHEN 'cogs' THEN 2 WHEN 'expense' THEN 3 ELSE 4 END,
       coa.account_code ASC`
  )
    .bind(periodMonth, start, end)
    .all();

  const items = result.results.map((row) => {
    const budgetAmount = roundMoney(row.budget_amount);
    const actualAmount = roundMoney(row.actual_amount);
    const variance = roundMoney(actualAmount - budgetAmount);
    const variancePercent = budgetAmount !== 0 ? roundMoney((variance / budgetAmount) * 100) : null;

    return {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      budget_amount: budgetAmount,
      actual_amount: actualAmount,
      variance,
      variance_percent: variancePercent,
      notes: row.notes ?? null
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.total_budget = roundMoney(acc.total_budget + item.budget_amount);
      acc.total_actual = roundMoney(acc.total_actual + item.actual_amount);
      return acc;
    },
    { total_budget: 0, total_actual: 0 }
  );

  return json(
    {
      data: {
        period_month: periodMonth,
        period_start: start,
        period_end: end,
        items,
        totals: { ...totals, total_variance: roundMoney(totals.total_actual - totals.total_budget) }
      }
    },
    { corsHeaders }
  );
}

async function saveBudgets(request, env, user, corsHeaders) {
  const payload = await readJson(request);

  if (!isValidPeriodMonth(payload.period_month)) {
    throw httpError(422, "Invalid payload", { period_month: "period_month is required in YYYY-MM format" });
  }

  if (!Array.isArray(payload.items)) {
    throw httpError(422, "Invalid payload", { items: "items must be an array" });
  }

  const statements = [];

  for (const item of payload.items) {
    const accountId = Number(item.account_id);
    const amount = Number(item.amount);

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw httpError(422, "Invalid payload", { account_id: `Invalid account_id: ${item.account_id}` });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw httpError(422, "Invalid payload", { amount: `Invalid amount for account ${accountId}` });
    }

    const notes = item.notes ? String(item.notes).trim().slice(0, 500) : null;

    statements.push(
      env.DB.prepare(
        `INSERT INTO budgets (account_id, period_month, amount, notes, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (account_id, period_month)
         DO UPDATE SET amount = excluded.amount, notes = excluded.notes, updated_at = datetime('now')`
      ).bind(accountId, payload.period_month, amount, notes, user.id)
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return await listBudgets(new URL(`https://internal/?period_month=${payload.period_month}`), env, corsHeaders);
}

async function balanceSheet(url, env, corsHeaders) {
  const asOfDate = url.searchParams.get("as_of_date");
  const report = await buildBalanceSheetReport(asOfDate, env);
  return noStoreJson({ data: { report_type: "balance_sheet", ...report } }, corsHeaders);
}

async function buildBalanceSheetReport(asOfDate, env) {
  if (!isValidDate(asOfDate)) {
    throw httpError(422, "Invalid report date", {
      as_of_date: "as_of_date is required in YYYY-MM-DD format"
    });
  }

  const rows = await env.DB.prepare(
    `WITH posted_lines AS (
       SELECT jl.account_id, COALESCE(SUM(jl.debit), 0) AS total_debit, COALESCE(SUM(jl.credit), 0) AS total_credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.status = 'posted' AND je.entry_date <= ?
       GROUP BY jl.account_id
     )
     SELECT
       coa.id AS account_id,
       coa.account_code,
       coa.account_name,
       coa.account_type,
       COALESCE(pl.total_debit, 0) AS total_debit,
       COALESCE(pl.total_credit, 0) AS total_credit,
       CASE
         WHEN coa.account_type = 'asset' THEN COALESCE(pl.total_debit, 0) - COALESCE(pl.total_credit, 0)
         WHEN coa.account_type IN ('liability', 'equity') THEN COALESCE(pl.total_credit, 0) - COALESCE(pl.total_debit, 0)
         ELSE 0
       END AS ending_balance
     FROM chart_of_accounts coa
     LEFT JOIN posted_lines pl ON pl.account_id = coa.id
     WHERE coa.account_type IN ('asset', 'liability', 'equity')
     ORDER BY CASE account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 ELSE 4 END, account_code ASC`
  )
    .bind(asOfDate)
    .all();

  const earnings = await env.DB.prepare(
  `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS current_period_earnings
   FROM journal_lines jl
   JOIN journal_entries je ON je.id = jl.journal_entry_id
   JOIN chart_of_accounts coa ON coa.id = jl.account_id
   WHERE je.status = 'posted'
     AND je.entry_date <= ?
     AND coa.account_type IN ('revenue', 'expense', 'cogs')`
  )
    .bind(asOfDate)
    .first();

  return splitBalanceRows(rows.results, asOfDate, Number(earnings?.current_period_earnings || 0));
}

async function cashFlow(url, env, corsHeaders) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const report = await buildCashFlowReport(startDate, endDate, env);
  return noStoreJson({ data: { report_type: "cash_flow", ...report } }, corsHeaders);
}

async function buildCashFlowReport(startDate, endDate, env) {
  validatePeriod(startDate, endDate);

  const result = await env.DB.prepare(
    `WITH cash_accounts AS (
       SELECT id FROM chart_of_accounts
       WHERE account_type = 'asset'
         AND (lower(account_name) LIKE '%kas%' OR lower(account_name) LIKE '%bank%' OR account_code LIKE '10%')
     )
     SELECT
       coa.id AS account_id,
       coa.account_code,
       coa.account_name,
       coa.account_type,
       CASE
         WHEN coa.account_type IN ('revenue', 'expense', 'cogs') THEN 'operating'
         WHEN coa.account_type = 'asset' THEN 'investing'
         WHEN coa.account_type IN ('liability', 'equity') THEN 'financing'
         ELSE 'operating'
       END AS cash_flow_category,
       SUM(opposite_line.credit - opposite_line.debit) AS cash_flow_amount
     FROM journal_lines cash_line
     JOIN cash_accounts cash_account ON cash_account.id = cash_line.account_id
     JOIN journal_entries je ON je.id = cash_line.journal_entry_id
     JOIN journal_lines opposite_line ON opposite_line.journal_entry_id = je.id AND opposite_line.id <> cash_line.id
     JOIN chart_of_accounts coa ON coa.id = opposite_line.account_id AND coa.id NOT IN (SELECT id FROM cash_accounts)
     WHERE je.status = 'posted' AND je.entry_date BETWEEN ? AND ?
     GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, cash_flow_category
     ORDER BY CASE cash_flow_category WHEN 'operating' THEN 1 WHEN 'investing' THEN 2 WHEN 'financing' THEN 3 ELSE 4 END, account_code ASC`
  )
    .bind(startDate, endDate)
    .all();

  return splitCashFlowRows(result.results, startDate, endDate);
}

const EXPORT_BUILDERS = {
  "income-statement": {
    reportType: "income_statement",
    buildReport: (url, env) =>
      buildIncomeStatementReport(url.searchParams.get("start_date"), url.searchParams.get("end_date"), env),
    xlsx: ReportExport.incomeStatementXlsx,
    pdf: ReportExport.incomeStatementPdf
  },
  "balance-sheet": {
    reportType: "balance_sheet",
    buildReport: (url, env) => buildBalanceSheetReport(url.searchParams.get("as_of_date"), env),
    xlsx: ReportExport.balanceSheetXlsx,
    pdf: ReportExport.balanceSheetPdf
  },
  "cash-flow": {
    reportType: "cash_flow",
    buildReport: (url, env) =>
      buildCashFlowReport(url.searchParams.get("start_date"), url.searchParams.get("end_date"), env),
    xlsx: ReportExport.cashFlowXlsx,
    pdf: ReportExport.cashFlowPdf
  }
};

async function exportReport(reportSlug, url, env, corsHeaders) {
  const builder = EXPORT_BUILDERS[reportSlug];

  if (!builder) {
    throw httpError(404, "Unknown report export type");
  }

  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();

  if (format !== "xlsx" && format !== "pdf") {
    throw httpError(422, "Invalid export format", { format: "format must be xlsx or pdf" });
  }

  const report = await builder.buildReport(url, env);
  const body = format === "pdf" ? await builder.pdf(report) : builder.xlsx(report);
  const filename = ReportExport.makeFileName(reportSlug, format);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": ReportExport.contentTypeFor(format),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      ...corsHeaders
    }
  });
}

async function requireUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) {
    throw httpError(401, "Authentication token is required");
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  const user = await env.DB.prepare(
    `SELECT id, full_name, email, role, is_active, last_login_at, created_at, updated_at
     FROM users
     WHERE id = ?
     LIMIT 1`
  )
    .bind(payload.sub)
    .first();

  if (!user || !Number(user.is_active)) {
    throw httpError(401, "Invalid authentication token");
  }

  return normalizeBooleans(user);
}

function authorize(user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    throw httpError(403, "You do not have permission to access this resource");
  }
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role
  };
}

function validateAccountPayload(payload, partial = false) {
  const errors = {};

  if ((!partial || payload.account_code !== undefined) && (!payload.account_code || String(payload.account_code).trim() === "")) {
    errors.account_code = "account_code is required";
  }

  if ((!partial || payload.account_name !== undefined) && (!payload.account_name || String(payload.account_name).trim() === "")) {
    errors.account_name = "account_name is required";
  }

  if ((!partial || payload.account_type !== undefined) && !ACCOUNT_TYPES.has(payload.account_type)) {
    errors.account_type = "account_type must be one of asset, liability, equity, revenue, expense, cogs";
  }

  if ((!partial || payload.normal_balance !== undefined) && !NORMAL_BALANCES.has(payload.normal_balance)) {
    errors.normal_balance = "normal_balance must be debit or credit";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

function validateJournalPayload(payload) {
  const errors = {};

  if (!isValidDate(payload.entry_date)) {
    errors.entry_date = "entry_date is required in YYYY-MM-DD format";
  }

  if (!payload.description || String(payload.description).trim() === "") {
    errors.description = "description is required";
  }

  const { tags, error: tagsError } = normalizeTags(payload.tags);
  if (tagsError) {
    errors.tags = tagsError;
  }

  if (!Array.isArray(payload.lines) || payload.lines.length < 2) {
    errors.lines = "journal entry must contain at least two lines";
    return { errors, normalizedLines: [], tags };
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const normalizedLines = [];

  payload.lines.forEach((line, index) => {
    const lineErrors = {};

    if (!line.account_id) {
      lineErrors.account_id = "account_id is required";
    }

    const debit = parseMoney(line.debit ?? 0);
    const credit = parseMoney(line.credit ?? 0);

    if (debit === null || credit === null) {
      lineErrors.amount = "debit and credit must be valid monetary amounts with max 2 decimals";
    } else if (debit < 0 || credit < 0) {
      lineErrors.amount = "debit and credit must be zero or positive";
    } else if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
      lineErrors.amount = "each line must contain either debit or credit, not both";
    }

    if (Object.keys(lineErrors).length > 0) {
      errors[`lines[${index}]`] = lineErrors;
    }

    totalDebit = roundMoney(totalDebit + (debit || 0));
    totalCredit = roundMoney(totalCredit + (credit || 0));
    normalizedLines.push({
      ...line,
      debit_amount: debit || 0,
      credit_amount: credit || 0
    });
  });

  if (totalDebit !== totalCredit) {
    errors.balance = "total debit must equal total credit";
    errors.total_debit = totalDebit;
    errors.total_credit = totalCredit;
  }

  return { errors: Object.keys(errors).length > 0 ? errors : null, normalizedLines, tags };
}

/**
 * Tag jurnal umum (mis. per proyek/cabang) disimpan sebagai JSON array
 * text di kolom journal_entries.tags. Dinormalisasi di sini: trim,
 * buang yang kosong, dedupe (case-insensitive), batasi jumlah & panjang
 * supaya kolomnya tidak membengkak tak terkendali.
 */
function normalizeTags(rawTags) {
  if (rawTags === undefined || rawTags === null) {
    return { tags: [] };
  }

  if (!Array.isArray(rawTags)) {
    return { tags: [], error: "tags must be an array of strings" };
  }

  const seen = new Set();
  const tags = [];

  for (const rawTag of rawTags) {
    const tag = String(rawTag ?? "").trim();
    if (!tag) continue;
    if (tag.length > 40) {
      return { tags: [], error: "each tag must be 40 characters or fewer" };
    }

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);

    if (tags.length > 10) {
      return { tags: [], error: "a journal entry can have at most 10 tags" };
    }
  }

  return { tags };
}

async function findAccountById(env, id) {
  return env.DB.prepare(
    `SELECT id, account_code, account_name, account_type, normal_balance, parent_account_id, is_active, created_at, updated_at
     FROM chart_of_accounts
     WHERE id = ?`
  )
    .bind(id)
    .first();
}

async function signJwt(payload, secret, expiresIn) {
  assertSecret(secret);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iss: "gudara-finance-api",
    aud: "gudara-finance-app",
    iat: now,
    exp: now + parseDurationSeconds(expiresIn)
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  const signature = await hmacSha256(unsigned, secret);

  return `${unsigned}.${base64Url(signature)}`;
}

async function verifyJwt(token, secret) {
  assertSecret(secret);
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw httpError(401, "Invalid authentication token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const expected = base64Url(await hmacSha256(`${encodedHeader}.${encodedPayload}`, secret));

  if (!timingSafeEqual(encodedSignature, expected)) {
    throw httpError(401, "Invalid authentication token");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (payload.iss !== "gudara-finance-api" || payload.aud !== "gudara-finance-app" || payload.exp <= now) {
    throw httpError(401, "Invalid authentication token");
  }

  return payload;
}

async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");

  if (parts[0] !== "pbkdf2" || parts.length !== 4) {
    throw httpError(500, "Unsupported password hash format");
  }

  const iterations = Number(parts[1]);
  const salt = base64ToBytes(parts[2]);
  const expected = base64ToBytes(parts[3]);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8);

  return timingSafeBytesEqual(new Uint8Array(bits), expected);
}

function parseDurationSeconds(value) {
  const match = String(value || "8h").match(/^(\d+)([smhd])$/);

  if (!match) return 8 * 60 * 60;

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}

function splitIncomeRows(rows, startDate, endDate) {
  const revenue = [];
  const cogs = [];
  const expenses = [];
  let totalRevenue = 0;
  let totalCogs = 0;
  let totalExpenses = 0;

  for (const row of rows) {
    const item = moneyRow(row, "amount");

    if (row.account_type === "revenue") {
      revenue.push(item);
      totalRevenue = roundMoney(totalRevenue + item.amount);
    } else if (row.account_type === "cogs") {
      cogs.push(item);
      totalCogs = roundMoney(totalCogs + item.amount);
    } else if (row.account_type === "expense") {
      expenses.push(item);
      totalExpenses = roundMoney(totalExpenses + item.amount);
    }
  }

  return {
    period: { start_date: startDate, end_date: endDate },
    revenue,
    cogs,
    expenses,
    totals: {
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_profit: roundMoney(totalRevenue - totalCogs),
      total_expenses: totalExpenses,
      net_income: roundMoney(totalRevenue - totalCogs - totalExpenses)
    }
  };
}

function splitBalanceRows(rows, asOfDate, currentPeriodEarnings) {
  const assets = [];
  const liabilities = [];
  const equity = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const row of rows) {
    if (Number(row.ending_balance) === 0) continue;

    const item = moneyRow(row, "ending_balance");

    if (row.account_type === "asset") {
      assets.push(item);
      totalAssets = roundMoney(totalAssets + item.ending_balance);
    } else if (row.account_type === "liability") {
      liabilities.push(item);
      totalLiabilities = roundMoney(totalLiabilities + item.ending_balance);
    } else if (row.account_type === "equity") {
      equity.push(item);
      totalEquity = roundMoney(totalEquity + item.ending_balance);
    }
  }

  if (currentPeriodEarnings !== 0) {
    const earningsItem = {
      account_id: null,
      account_code: "CURRENT_EARNINGS",
      account_name: "Current Period Earnings",
      account_type: "equity",
      total_debit: 0,
      total_credit: 0,
      ending_balance: roundMoney(currentPeriodEarnings),
      is_system_generated: true
    };

    equity.push(earningsItem);
    totalEquity = roundMoney(totalEquity + earningsItem.ending_balance);
  }

  const totalLiabilitiesAndEquity = roundMoney(totalLiabilities + totalEquity);
  const difference = roundMoney(totalAssets - totalLiabilitiesAndEquity);

  return {
    as_of_date: asOfDate,
    assets,
    liabilities,
    equity,
    totals: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      is_balanced: difference === 0,
      difference
    }
  };
}

function splitCashFlowRows(rows, startDate, endDate) {
  const operating = [];
  const investing = [];
  const financing = [];
  let netOperatingCashFlow = 0;
  let netInvestingCashFlow = 0;
  let netFinancingCashFlow = 0;

  for (const row of rows) {
    const item = {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      cash_flow_category: row.cash_flow_category,
      cash_flow_amount: Number(row.cash_flow_amount || 0)
    };

    if (row.cash_flow_category === "operating") {
      operating.push(item);
      netOperatingCashFlow = roundMoney(netOperatingCashFlow + item.cash_flow_amount);
    } else if (row.cash_flow_category === "investing") {
      investing.push(item);
      netInvestingCashFlow = roundMoney(netInvestingCashFlow + item.cash_flow_amount);
    } else if (row.cash_flow_category === "financing") {
      financing.push(item);
      netFinancingCashFlow = roundMoney(netFinancingCashFlow + item.cash_flow_amount);
    }
  }

  return {
    period: { start_date: startDate, end_date: endDate },
    method: "direct",
    operating,
    investing,
    financing,
    totals: {
      net_operating_cash_flow: netOperatingCashFlow,
      net_investing_cash_flow: netInvestingCashFlow,
      net_financing_cash_flow: netFinancingCashFlow,
      net_cash_flow: roundMoney(netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow)
    },
    classification_note: "Cash accounts are inferred from asset accounts named Kas/Bank or account codes starting with 10."
  };
}

function moneyRow(row, amountKey) {
  return {
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    account_type: row.account_type,
    total_debit: Number(row.total_debit || 0),
    total_credit: Number(row.total_credit || 0),
    [amountKey]: Number(row[amountKey] || 0)
  };
}

function validatePeriod(startDate, endDate) {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw httpError(422, "Invalid report date range", {
      start_date: "start_date is required in YYYY-MM-DD format",
      end_date: "end_date is required in YYYY-MM-DD format"
    });
  }

  if (startDate > endDate) {
    throw httpError(422, "Invalid report date range", {
      date_range: "start_date must be earlier than or equal to end_date"
    });
  }
}

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function parseMoney(value) {
  const normalized = String(value ?? "0").trim();

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  return roundMoney(Number(normalized));
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeBooleans(row) {
  return {
    ...row,
    is_active: Boolean(Number(row.is_active))
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "Request body must be valid JSON");
  }
}

function getCorsHeaders(request, env) {
  const allowedOrigins = String(env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function json(data, { status = 200, corsHeaders = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function noStoreJson(data, corsHeaders) {
  return json(data, {
    corsHeaders: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      ...corsHeaders
    }
  });
}

function errorResponse(error, corsHeaders) {
  const status = error.status || 500;
  const message = status === 500 ? "Internal server error" : error.message;
  const details = error.details;

  // Temporary debug logging: unhandled (500) errors don't expose their real
  // message/stack to the client on purpose, so log them here to inspect via
  // `wrangler tail`. Safe to remove once the export bug is confirmed fixed.
  if (status === 500) {
    console.error("Unhandled error:", error && error.stack ? error.stack : error);
  }

  return json({ error: { message, details } }, { status, corsHeaders });
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function assertSecret(secret) {
  if (!secret || String(secret).length < 32) {
    throw httpError(500, "JWT_SECRET must be configured with at least 32 characters");
  }
}

function base64UrlJson(value) {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

function base64Url(bytes) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  return timingSafeBytesEqual(encoder.encode(a), encoder.encode(b));
}

function timingSafeBytesEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a[index] ^ b[index];
  }

  return result === 0;
}
