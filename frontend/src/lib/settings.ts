export type AppSettings = {
  companyName: string;
  legalName: string;
  taxId: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  currency: "IDR" | "USD";
  numberFormat: "id-ID" | "en-US";
  dateFormat: "dd MMM yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
  timezone: "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura" | "UTC";
  fiscalYearStartMonth: string;
  accountingCloseDay: string;
  reportDefaultYear: string;
  defaultReportBasis: "accrual" | "cash";
  chartOfAccountsLock: boolean;
  requireBalancedJournal: boolean;
  autoPostRecurringJournal: boolean;
  invoicePrefix: string;
  billPrefix: string;
  journalPrefix: string;
  defaultPaymentTerms: string;
  taxEnabled: boolean;
  vatRate: string;
  withholdingTaxRate: string;
  approvalWorkflow: boolean;
  approvalLimit: string;
  twoFactorReminder: boolean;
  sessionTimeoutMinutes: string;
  auditLogRetentionDays: string;
  emailNotifications: boolean;
  overdueReminderDays: string;
  budgetAlertThreshold: string;
  marketplaceSyncEnabled: boolean;
  backupFrequency: "daily" | "weekly" | "monthly";
  backupRetentionMonths: string;
  apiEnvironment: "production" | "staging" | "local";
  themeMode: "light" | "system";
  accentColor: "teal" | "blue" | "violet" | "slate";
  landingPage: "dashboard" | "jurnal" | "laporan";
  compactMode: boolean;
};

export const SETTINGS_STORAGE_KEY = "gudara_app_settings";

export const defaultSettings: AppSettings = {
  companyName: "Gudara",
  legalName: "PT Gudara Indonesia",
  taxId: "",
  companyEmail: "finance@gudara.id",
  companyPhone: "",
  companyAddress: "",
  currency: "IDR",
  numberFormat: "id-ID",
  dateFormat: "dd MMM yyyy",
  timezone: "Asia/Jakarta",
  fiscalYearStartMonth: "01",
  accountingCloseDay: "1",
  reportDefaultYear: String(new Date().getFullYear()),
  defaultReportBasis: "accrual",
  chartOfAccountsLock: true,
  requireBalancedJournal: true,
  autoPostRecurringJournal: false,
  invoicePrefix: "INV",
  billPrefix: "BILL",
  journalPrefix: "JRN",
  defaultPaymentTerms: "14",
  taxEnabled: false,
  vatRate: "11",
  withholdingTaxRate: "2",
  approvalWorkflow: true,
  approvalLimit: "5000000",
  twoFactorReminder: true,
  sessionTimeoutMinutes: "60",
  auditLogRetentionDays: "365",
  emailNotifications: true,
  overdueReminderDays: "3",
  budgetAlertThreshold: "85",
  marketplaceSyncEnabled: true,
  backupFrequency: "daily",
  backupRetentionMonths: "12",
  apiEnvironment: "production",
  themeMode: "light",
  accentColor: "teal",
  landingPage: "dashboard",
  compactMode: false
};

export function loadAppSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

  if (!raw) return defaultSettings;

  try {
    return {
      ...defaultSettings,
      ...JSON.parse(raw)
    };
  } catch {
    return defaultSettings;
  }
}

export function saveAppSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("gudara-settings-change", { detail: settings }));
}

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
}
