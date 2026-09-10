export type JournalLine = {
  account_id: string;
  memo: string;
  debit: string;
  credit: string;
};

export type JournalEntrySummary = {
  id: string | number;
  entry_date: string;
  reference_no: string | null;
  description: string;
  status: "draft" | "posted" | "void";
  tags: string[];
  debit_accounts: string;
  credit_accounts: string;
  amount: number;
  void_reason?: string | null;
  voided_at?: string | null;
};

export type JournalEntryDetail = {
  id: string | number;
  entry_date: string;
  reference_no: string | null;
  description: string;
  status: "draft" | "posted" | "void";
  tags: string[];
  void_reason?: string | null;
  voided_at?: string | null;
  lines: Array<{
    id: string | number;
    account_id: string | number;
    account_code: string;
    account_name: string;
    memo: string | null;
    debit: string | number;
    credit: string | number;
  }>;
};

export type JournalListMeta = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type Account = {
  id: string;
  account_code: string;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense" | "cogs";
  normal_balance: "debit" | "credit";
  parent_account_id?: string | number | null;
  is_active: boolean;
};

export type AccountPayload = {
  account_code: string;
  account_name: string;
  account_type: Account["account_type"];
  normal_balance: Account["normal_balance"];
  parent_account_id?: string | number | null;
  is_active?: boolean;
};

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "akuntan" | "manajemen" | "sales";
};

export type ReportLineItem = {
  account_id: number | string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  amount?: number;
  ending_balance?: number;
  total_debit?: number;
  total_credit?: number;
};

export type IncomeStatementReport = {
  report_type: "income_statement";
  period: { start_date: string; end_date: string };
  revenue: ReportLineItem[];
  cogs: ReportLineItem[];
  expenses: ReportLineItem[];
  totals: {
    total_revenue: number;
    total_cogs: number;
    gross_profit: number;
    total_expenses: number;
    net_income: number;
  };
};

export type BalanceSheetReport = {
  report_type: "balance_sheet";
  as_of_date: string;
  assets: ReportLineItem[];
  liabilities: ReportLineItem[];
  equity: ReportLineItem[];
  totals: {
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
    total_liabilities_and_equity: number;
    is_balanced: boolean;
    difference: number;
  };
};

export type CashFlowLineItem = {
  account_id: number | string;
  account_code: string;
  account_name: string;
  account_type: string;
  cash_flow_category: "operating" | "investing" | "financing";
  cash_flow_amount: number;
};

export type CashFlowReport = {
  report_type: "cash_flow";
  period: { start_date: string; end_date: string };
  method: string;
  operating: CashFlowLineItem[];
  investing: CashFlowLineItem[];
  financing: CashFlowLineItem[];
  totals: {
    net_operating_cash_flow: number;
    net_investing_cash_flow: number;
    net_financing_cash_flow: number;
    net_cash_flow: number;
  };
};

export type FixedAssetStatus = "aktif" | "nonaktif" | "dijual" | "rusak";

export type FixedAsset = {
  id: string | number;
  asset_code: string;
  asset_name: string;
  account_id: string | number;
  account_code: string;
  account_name: string;
  quantity: number;
  acquisition_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  location: string | null;
  status: FixedAssetStatus;
  notes: string | null;
  monthly_depreciation: number;
  months_elapsed: number;
  months_remaining: number;
  accumulated_depreciation: number;
  book_value: number;
  is_fully_depreciated: boolean;
  created_at: string;
  updated_at: string;
};

export type FixedAssetListMeta = {
  as_of_date: string;
  count: number;
  total_acquisition_cost: number;
  total_accumulated_depreciation: number;
  total_book_value: number;
};

export type FixedAssetPayload = {
  asset_code: string;
  asset_name: string;
  account_id: number | string;
  quantity?: number;
  acquisition_date: string;
  acquisition_cost: number | string;
  residual_value?: number | string;
  useful_life_months: number;
  location?: string;
  status?: FixedAssetStatus;
  notes?: string;
};

export type MarketplacePlatform = {
  key: string;
  label: string;
  dashboard_hint: string;
  account_code: string;
  account_id: string | number | null;
  current_balance: number | null;
};

export type MarketplaceReceivablesCurrent = {
  as_of_date: string;
  platforms: MarketplacePlatform[];
  revenue_account_ready: boolean;
};

export type MarketplaceReceivableBreakdown = {
  platform_key: string;
  label: string;
  account_code: string;
  previous_balance: number;
  latest_balance: number;
  delta: number;
};

export type MarketplaceReceivableResult = {
  journal: JournalEntryDetail | null;
  breakdown: MarketplaceReceivableBreakdown[];
  message: string | null;
};

export type MarketplaceDestinationAccount = {
  id: string | number;
  account_code: string;
  account_name: string;
};

export type MarketplaceWithdrawalsForm = {
  as_of_date: string;
  platforms: MarketplacePlatform[];
  destination_accounts: MarketplaceDestinationAccount[];
};

export type MarketplaceWithdrawalResult = {
  journal: JournalEntryDetail;
};

export type AccountTransaction = {
  journal_entry_id: string | number;
  entry_date: string;
  reference_no: string | null;
  description: string;
  memo: string | null;
  debit: number;
  credit: number;
  running_balance: number;
};

export type AccountTransactionsMeta = {
  account_id: string | number;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: "debit" | "credit";
  period: { start_date: string; end_date: string };
  count: number;
  total_debit: number;
  total_credit: number;
  ending_balance: number;
};

export type BudgetItem = {
  account_id: string | number;
  account_code: string;
  account_name: string;
  account_type: "revenue" | "cogs" | "expense";
  budget_amount: number;
  actual_amount: number;
  variance: number;
  variance_percent: number | null;
  notes: string | null;
};

export type BudgetReport = {
  period_month: string;
  period_start: string;
  period_end: string;
  items: BudgetItem[];
  totals: { total_budget: number; total_actual: number; total_variance: number };
};

export type ContactType = "customer" | "supplier";

export type Contact = {
  id: string | number;
  contact_type: ContactType;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentStatus = "belum_lunas" | "sebagian" | "lunas" | "jatuh_tempo" | "void";

export type ReceivablePayablePayment = {
  id: string | number;
  payment_date: string;
  amount: number;
  account_id: string | number;
  account_code: string;
  account_name: string;
  journal_entry_id: string | number;
  notes: string | null;
};

export type InvoiceLineItem = {
  description: string;
  qty: number;
  unit_price: number;
};

export type ArInvoice = {
  id: string | number;
  invoice_no: string;
  contact_id: string | number;
  contact_name: string;
  invoice_date: string;
  due_date: string;
  description: string;
  items?: InvoiceLineItem[] | null;
  subtotal_amount?: number | null;
  discount_amount?: number;
  tax_amount?: number;
  amount: number;
  paid_amount: number;
  balance: number;
  days_overdue: number;
  payment_status: PaymentStatus;
  status: "open" | "void";
  revenue_account_id: string | number;
  account_code?: string;
  account_name?: string;
  journal_entry_id: string | number;
  payments?: ReceivablePayablePayment[];
};

export type ApBill = {
  id: string | number;
  bill_no: string;
  contact_id: string | number;
  contact_name: string;
  bill_date: string;
  due_date: string;
  description: string;
  items?: InvoiceLineItem[] | null;
  subtotal_amount?: number | null;
  discount_amount?: number;
  tax_amount?: number;
  amount: number;
  paid_amount: number;
  balance: number;
  days_overdue: number;
  payment_status: PaymentStatus;
  status: "open" | "void";
  expense_account_id: string | number;
  account_code?: string;
  account_name?: string;
  journal_entry_id: string | number;
  payments?: ReceivablePayablePayment[];
};

export type ReceivablePayableListMeta = {
  as_of_date: string;
  count: number;
  total_outstanding: number;
};

export type AgingBucketKey = "belum_jatuh_tempo" | "1_30" | "31_60" | "61_90" | "90_plus";

export type AgingItem = {
  id: string | number;
  no: string;
  contact_id: string | number;
  contact_name: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  balance: number;
  days_overdue: number;
  bucket: AgingBucketKey;
};

export type AgingByContact = {
  contact_id: string | number;
  contact_name: string;
  belum_jatuh_tempo: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
  total: number;
};

export type AgingReport = {
  type: "ar" | "ap";
  as_of_date: string;
  buckets: Record<AgingBucketKey, number>;
  total: number;
  items: AgingItem[];
  by_contact: AgingByContact[];
};

export type JournalTemplateLine = {
  id?: string | number;
  account_id: string | number;
  account_code?: string;
  account_name?: string;
  memo: string | null;
  debit: number | string;
  credit: number | string;
};

export type JournalTemplateRun = {
  journal_entry_id: string | number;
  reference_no: string | null;
  generated_at: string;
};

export type JournalTemplate = {
  id: string | number;
  name: string;
  description: string | null;
  tags: string[];
  is_active: boolean;
  lines: JournalTemplateLine[];
  total_amount: number;
  generated_this_period: boolean;
  last_run_this_period: JournalTemplateRun | null;
  created_at: string;
  updated_at: string;
};

export type JournalTemplateDetail = JournalTemplate & {
  recent_runs: { period_month: string; generated_at: string; journal_entry_id: string | number; reference_no: string | null }[];
};

export type ClosedPeriod = {
  period_month: string;
  period_label: string;
  closed_at: string;
  closed_by_name: string | null;
  notes: string | null;
};

export type BookClosingStatus = {
  closed_periods: ClosedPeriod[];
  latest_closed_period: string | null;
  next_to_close: string | null;
  next_to_close_label: string | null;
  current_month: string;
  needs_closing_reminder: boolean;
};
