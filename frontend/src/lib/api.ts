import type {
  Account,
  AccountPayload,
  AccountTransaction,
  AccountTransactionsMeta,
  AgingReport,
  ApBill,
  ArInvoice,
  AuthUser,
  BalanceSheetReport,
  BookClosingStatus,
  BudgetReport,
  CashFlowReport,
  Contact,
  ContactType,
  FixedAsset,
  FixedAssetListMeta,
  FixedAssetPayload,
  IncomeStatementReport,
  JournalLine,
  JournalEntryDetail,
  JournalEntrySummary,
  JournalListMeta,
  JournalTemplate,
  JournalTemplateDetail,
  JournalTemplateLine,
  MarketplaceReceivablesCurrent,
  MarketplaceReceivableResult,
  MarketplaceWithdrawalsForm,
  MarketplaceWithdrawalResult,
  ReceivablePayableListMeta
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("gudara_access_token");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers
    },
    ...options
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error?.message ?? "Request failed";
    throw new Error(message);
  }

  return body as T;
}

export async function fetchAccounts() {
  const result = await request<{ data: Account[] }>("/api/chart-of-accounts?is_active=true");
  return result.data;
}

export async function fetchChartOfAccounts(params: { isActive?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.isActive !== undefined) query.set("is_active", String(params.isActive));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await request<{ data: Account[] }>(`/api/chart-of-accounts${suffix}`);
  return result.data;
}

export async function createAccount(payload: AccountPayload) {
  const result = await request<{ data: Account }>("/api/chart-of-accounts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateAccount(id: number | string, payload: Partial<AccountPayload>) {
  const result = await request<{ data: Account }>(`/api/chart-of-accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function deleteAccount(id: number | string) {
  await request<void>(`/api/chart-of-accounts/${id}`, { method: "DELETE" });
}

export async function createJournal(payload: {
  entry_date: string;
  reference_no?: string;
  description: string;
  tags?: string[];
  lines: JournalLine[];
}) {
  return request<{ data: { id: number | string; reference_no: string | null } }>("/api/journals", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      lines: payload.lines.map((line) => ({
        account_id: Number(line.account_id),
        memo: line.memo,
        debit: line.debit || "0",
        credit: line.credit || "0"
      }))
    })
  });
}

export async function fetchJournalById(id: number | string) {
  const result = await request<{ data: JournalEntryDetail }>(`/api/journals/${id}`);
  return result.data;
}

export async function updateJournal(
  id: number | string,
  payload: {
    entry_date: string;
    reference_no?: string;
    description: string;
    tags?: string[];
    lines: JournalLine[];
  }
) {
  return request<{ data: JournalEntryDetail }>(`/api/journals/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      lines: payload.lines.map((line) => ({
        account_id: Number(line.account_id),
        memo: line.memo,
        debit: line.debit || "0",
        credit: line.credit || "0"
      }))
    })
  });
}

export async function voidJournal(id: number | string, reason?: string) {
  const result = await request<{ data: JournalEntryDetail }>(`/api/journals/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || undefined })
  });
  return result.data;
}

export async function deleteJournal(id: number | string) {
  const token = localStorage.getItem("gudara_access_token");
  const response = await fetch(`${API_BASE_URL}/api/journals/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal menghapus jurnal");
  }
}

export async function fetchJournals(params: {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  tag?: string;
} = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("page_size", String(params.pageSize));
  if (params.startDate) query.set("start_date", params.startDate);
  if (params.endDate) query.set("end_date", params.endDate);
  if (params.search) query.set("search", params.search);
  if (params.tag) query.set("tag", params.tag);

  const result = await request<{ data: JournalEntrySummary[]; meta: JournalListMeta }>(
    `/api/journals?${query.toString()}`
  );
  return result;
}

export async function fetchJournalTags() {
  const result = await request<{ data: string[] }>("/api/journals/tags");
  return result.data;
}

export async function fetchBudgets(periodMonth: string) {
  const result = await request<{ data: BudgetReport }>(`/api/budgets?period_month=${periodMonth}`);
  return result.data;
}

export async function saveBudgets(periodMonth: string, items: { account_id: number | string; amount: number; notes?: string }[]) {
  const result = await request<{ data: BudgetReport }>("/api/budgets", {
    method: "PUT",
    body: JSON.stringify({ period_month: periodMonth, items })
  });
  return result.data;
}

export async function fetchJournalTemplates(periodMonth?: string) {
  const query = periodMonth ? `?period_month=${periodMonth}` : "";
  const result = await request<{ data: JournalTemplate[]; period_month: string }>(`/api/journal-templates${query}`);
  return result;
}

export async function fetchJournalTemplateById(id: number | string) {
  const result = await request<{ data: JournalTemplateDetail }>(`/api/journal-templates/${id}`);
  return result.data;
}

export async function createJournalTemplate(payload: {
  name: string;
  description?: string;
  tags?: string[];
  lines: JournalTemplateLine[];
}) {
  const result = await request<{ data: JournalTemplateDetail }>("/api/journal-templates", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateJournalTemplate(
  id: number | string,
  payload: { name: string; description?: string; tags?: string[]; is_active?: boolean; lines: JournalTemplateLine[] }
) {
  const result = await request<{ data: JournalTemplateDetail }>(`/api/journal-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function setJournalTemplateActive(id: number | string, isActive: boolean) {
  const result = await request<{ data: JournalTemplateDetail }>(`/api/journal-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify({ is_active: isActive })
  });
  return result.data;
}

export async function deleteJournalTemplate(id: number | string) {
  await request<void>(`/api/journal-templates/${id}`, { method: "DELETE" });
}

export async function generateJournalFromTemplate(
  id: number | string,
  payload: { period_month?: string; entry_date?: string } = {}
) {
  const result = await request<{ data: JournalEntryDetail }>(`/api/journal-templates/${id}/generate`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function login(payload: { email: string; password: string }) {
  const result = await request<{
    data: {
      access_token: string;
      token_type: "Bearer";
      expires_in: string;
      user: AuthUser;
    };
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  localStorage.setItem("gudara_access_token", result.data.access_token);
  return result.data;
}

export async function getMe() {
  const result = await request<{ data: { user: AuthUser } }>("/api/auth/me");
  return result.data.user;
}

export async function updateProfile(payload: {
  full_name?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}) {
  const result = await request<{ data: { user: AuthUser } }>("/api/auth/me", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return result.data.user;
}

export function logout() {
  localStorage.removeItem("gudara_access_token");
}

export async function fetchIncomeStatement(startDate: string, endDate: string) {
  const result = await request<{ data: IncomeStatementReport }>(
    `/api/reports/income-statement?start_date=${startDate}&end_date=${endDate}`
  );
  return result.data;
}

export async function fetchBalanceSheet(asOfDate: string) {
  const result = await request<{ data: BalanceSheetReport }>(`/api/reports/balance-sheet?as_of_date=${asOfDate}`);
  return result.data;
}

export async function fetchCashFlow(startDate: string, endDate: string) {
  const result = await request<{ data: CashFlowReport }>(
    `/api/reports/cash-flow?start_date=${startDate}&end_date=${endDate}`
  );
  return result.data;
}

export type ExportFormat = "xlsx" | "pdf";
export type ReportSlug = "income-statement" | "balance-sheet" | "cash-flow";

export async function downloadReportExport(reportSlug: ReportSlug, format: ExportFormat, params: Record<string, string>) {
  const token = localStorage.getItem("gudara_access_token");
  const query = new URLSearchParams({ ...params, format }).toString();
  const response = await fetch(`${API_BASE_URL}/api/reports/${reportSlug}/export?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal mengunduh laporan");
  }

  await triggerDownload(response, `gudara-${reportSlug}.${format}`);
}

export async function downloadJournalsExport(
  format: ExportFormat,
  params: { startDate?: string; endDate?: string; search?: string; ids?: number[] } = {}
) {
  const token = localStorage.getItem("gudara_access_token");
  const query = new URLSearchParams({ format });

  if (params.ids && params.ids.length > 0) {
    // Export only the rows the user selected — takes priority over the
    // date/search filters below.
    query.set("ids", params.ids.join(","));
  } else {
    if (params.startDate) query.set("start_date", params.startDate);
    if (params.endDate) query.set("end_date", params.endDate);
    if (params.search) query.set("search", params.search);
  }

  const response = await fetch(`${API_BASE_URL}/api/journals/export?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal mengunduh jurnal");
  }

  await triggerDownload(response, `gudara-jurnal-harian.${format}`);
}

export async function fetchAccountTransactions(accountId: number | string, startDate: string, endDate: string) {
  const result = await request<{ data: AccountTransaction[]; meta: AccountTransactionsMeta }>(
    `/api/chart-of-accounts/${accountId}/transactions?start_date=${startDate}&end_date=${endDate}`
  );
  return result;
}

export async function downloadAccountLedgerExport(
  accountId: number | string,
  format: ExportFormat,
  startDate: string,
  endDate: string
) {
  const token = localStorage.getItem("gudara_access_token");
  const query = new URLSearchParams({ start_date: startDate, end_date: endDate, format }).toString();
  const response = await fetch(`${API_BASE_URL}/api/chart-of-accounts/${accountId}/transactions/export?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal mengunduh buku besar akun");
  }

  await triggerDownload(response, `gudara-buku-besar-${accountId}.${format}`);
}

export async function downloadArInvoiceExport(id: number | string) {
  const token = localStorage.getItem("gudara_access_token");
  const response = await fetch(`${API_BASE_URL}/api/ar-invoices/${id}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal mengunduh invoice");
  }

  await triggerDownload(response, `gudara-invoice-${id}.pdf`);
}

export async function fetchFixedAssets(params: {
  status?: string;
  accountId?: string;
  search?: string;
  asOfDate?: string;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.accountId) query.set("account_id", params.accountId);
  if (params.search) query.set("search", params.search);
  if (params.asOfDate) query.set("as_of_date", params.asOfDate);

  const result = await request<{ data: FixedAsset[]; meta: FixedAssetListMeta }>(
    `/api/fixed-assets?${query.toString()}`
  );
  return result;
}

export async function fetchFixedAssetById(id: number | string) {
  const result = await request<{ data: FixedAsset }>(`/api/fixed-assets/${id}`);
  return result.data;
}

export async function createFixedAsset(payload: FixedAssetPayload) {
  const result = await request<{ data: FixedAsset }>("/api/fixed-assets", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateFixedAsset(id: number | string, payload: Partial<FixedAssetPayload>) {
  const result = await request<{ data: FixedAsset }>(`/api/fixed-assets/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function deleteFixedAsset(id: number | string) {
  const token = localStorage.getItem("gudara_access_token");
  const response = await fetch(`${API_BASE_URL}/api/fixed-assets/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal menghapus aset");
  }
}

export async function fetchMarketplaceReceivablesCurrent(asOfDate?: string) {
  const query = asOfDate ? `?as_of_date=${asOfDate}` : "";
  const result = await request<{ data: MarketplaceReceivablesCurrent }>(`/api/marketplace-receivables${query}`);
  return result.data;
}

export async function saveMarketplaceReceivables(payload: {
  entry_date: string;
  tokopedia_tiktok?: string;
  shopee?: string;
}) {
  const result = await request<{ data: MarketplaceReceivableResult }>("/api/marketplace-receivables", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function fetchMarketplaceWithdrawalsForm(asOfDate?: string) {
  const query = asOfDate ? `?as_of_date=${asOfDate}` : "";
  const result = await request<{ data: MarketplaceWithdrawalsForm }>(`/api/marketplace-withdrawals${query}`);
  return result.data;
}

export async function saveMarketplaceWithdrawal(payload: {
  entry_date: string;
  platform_key: string;
  amount: string;
  destination_account_id: string | number;
}) {
  const result = await request<{ data: MarketplaceWithdrawalResult }>("/api/marketplace-withdrawals", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

// =====================================================================
// Kontak (Pelanggan / Supplier)
// =====================================================================

export async function fetchContacts(params: { type?: ContactType; search?: string; includeInactive?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.search) query.set("search", params.search);
  if (params.includeInactive) query.set("include_inactive", "true");

  const result = await request<{ data: Contact[] }>(`/api/contacts?${query.toString()}`);
  return result.data;
}

export async function createContact(payload: { contact_type: ContactType; name: string; phone?: string; address?: string; notes?: string }) {
  const result = await request<{ data: Contact }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateContact(id: number | string, payload: Partial<{ name: string; phone: string; address: string; notes: string; is_active: boolean }>) {
  const result = await request<{ data: Contact }>(`/api/contacts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function deleteContact(id: number | string) {
  await request<{ data: { message: string } }>(`/api/contacts/${id}`, { method: "DELETE" });
}

// =====================================================================
// Piutang Umum (AR Invoices)
// =====================================================================

export async function fetchArInvoices(params: { contactId?: string; status?: "all" | "open" | "paid" | "void"; asOfDate?: string; search?: string; startDate?: string; endDate?: string } = {}) {
  const query = new URLSearchParams();
  if (params.contactId) query.set("contact_id", params.contactId);
  if (params.status) query.set("status", params.status);
  if (params.asOfDate) query.set("as_of_date", params.asOfDate);
  if (params.search) query.set("search", params.search);
  if (params.startDate) query.set("start_date", params.startDate);
  if (params.endDate) query.set("end_date", params.endDate);

  const result = await request<{ data: ArInvoice[]; meta: ReceivablePayableListMeta }>(`/api/ar-invoices?${query.toString()}`);
  return result;
}

export async function fetchArInvoiceById(id: number | string) {
  const result = await request<{ data: ArInvoice }>(`/api/ar-invoices/${id}`);
  return result.data;
}

export async function createArInvoice(payload: {
  invoice_no?: string;
  contact_id: number | string;
  invoice_date: string;
  due_date: string;
  description: string;
  amount?: string | number;
  items?: { description: string; qty: number; unit_price: number }[];
  discount_amount?: string | number;
  tax_amount?: string | number;
  revenue_account_id?: number | string;
}) {
  const result = await request<{ data: ArInvoice }>("/api/ar-invoices", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateArInvoice(id: number | string, payload: {
  contact_id: number | string;
  invoice_date: string;
  due_date: string;
  description: string;
  amount?: string | number;
  items?: { description: string; qty: number; unit_price: number }[];
  discount_amount?: string | number;
  tax_amount?: string | number;
  revenue_account_id?: number | string;
  // Wajib diisi kalau invoice ini sudah ada pembayaran tercatat — server
  // akan menolak dengan 422 kalau kosong dalam kondisi itu.
  password?: string;
}) {
  const result = await request<{ data: ArInvoice }>(`/api/ar-invoices/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function deleteArInvoice(id: number | string, password?: string) {
  await request<void>(`/api/ar-invoices/${id}`, { method: "DELETE", body: JSON.stringify({ password }) });
}

export async function payArInvoice(id: number | string, payload: { payment_date: string; amount: string | number; account_id: number | string; notes?: string }) {
  const result = await request<{ data: ArInvoice }>(`/api/ar-invoices/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function voidArInvoice(id: number | string, reason?: string) {
  const result = await request<{ data: ArInvoice }>(`/api/ar-invoices/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return result.data;
}

// =====================================================================
// Utang Umum (AP Bills)
// =====================================================================

export async function fetchApBills(params: { contactId?: string; status?: "all" | "open" | "paid" | "void"; asOfDate?: string; search?: string; startDate?: string; endDate?: string } = {}) {
  const query = new URLSearchParams();
  if (params.contactId) query.set("contact_id", params.contactId);
  if (params.status) query.set("status", params.status);
  if (params.asOfDate) query.set("as_of_date", params.asOfDate);
  if (params.search) query.set("search", params.search);
  if (params.startDate) query.set("start_date", params.startDate);
  if (params.endDate) query.set("end_date", params.endDate);

  const result = await request<{ data: ApBill[]; meta: ReceivablePayableListMeta }>(`/api/ap-bills?${query.toString()}`);
  return result;
}

export async function fetchApBillById(id: number | string) {
  const result = await request<{ data: ApBill }>(`/api/ap-bills/${id}`);
  return result.data;
}

export async function createApBill(payload: {
  bill_no?: string;
  contact_id: number | string;
  bill_date: string;
  due_date: string;
  description: string;
  amount?: string | number;
  items?: { description: string; qty: number; unit_price: number }[];
  discount_amount?: string | number;
  tax_amount?: string | number;
  expense_account_id?: number | string;
}) {
  const result = await request<{ data: ApBill }>("/api/ap-bills", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateApBill(id: number | string, payload: {
  contact_id: number | string;
  bill_date: string;
  due_date: string;
  description: string;
  amount?: string | number;
  items?: { description: string; qty: number; unit_price: number }[];
  discount_amount?: string | number;
  tax_amount?: string | number;
  expense_account_id?: number | string;
  // Wajib diisi kalau tagihan ini sudah ada pembayaran tercatat — server
  // akan menolak dengan 422 kalau kosong dalam kondisi itu.
  password?: string;
}) {
  const result = await request<{ data: ApBill }>(`/api/ap-bills/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function deleteApBill(id: number | string, password?: string) {
  await request<void>(`/api/ap-bills/${id}`, { method: "DELETE", body: JSON.stringify({ password }) });
}

export async function payApBill(id: number | string, payload: { payment_date: string; amount: string | number; account_id: number | string; notes?: string }) {
  const result = await request<{ data: ApBill }>(`/api/ap-bills/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function voidApBill(id: number | string, reason?: string) {
  const result = await request<{ data: ApBill }>(`/api/ap-bills/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return result.data;
}

// =====================================================================
// Laporan Umur Piutang/Utang (Aging Report)
// =====================================================================

export async function fetchAgingReport(type: "ar" | "ap", asOfDate?: string) {
  const query = new URLSearchParams({ type });
  if (asOfDate) query.set("as_of_date", asOfDate);

  const result = await request<{ data: AgingReport }>(`/api/reports/aging?${query.toString()}`);
  return result.data;
}

// =====================================================================
// Tutup Buku (Book Closing)
// =====================================================================

export async function fetchBookClosingStatus() {
  const result = await request<{ data: BookClosingStatus }>("/api/book-closing");
  return result.data;
}

export async function closeBookPeriod(periodMonth: string, notes?: string) {
  const result = await request<{ data: BookClosingStatus }>("/api/book-closing", {
    method: "POST",
    body: JSON.stringify({ period_month: periodMonth, notes })
  });
  return result.data;
}

export async function reopenBookPeriod(periodMonth: string) {
  const result = await request<{ data: BookClosingStatus }>(`/api/book-closing/${periodMonth}`, {
    method: "DELETE"
  });
  return result.data;
}

async function triggerDownload(response: Response, fallbackFilename: string) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
