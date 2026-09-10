import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  FileCog,
  Gauge,
  Globe2,
  KeyRound,
  Paintbrush,
  Receipt,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  WalletCards,
  Wifi
} from "lucide-react";
import type { AuthUser } from "../types";
import { defaultSettings, getApiBaseUrl, loadAppSettings, saveAppSettings, type AppSettings } from "../lib/settings";

const monthOptions = [
  ["01", "Januari"],
  ["02", "Februari"],
  ["03", "Maret"],
  ["04", "April"],
  ["05", "Mei"],
  ["06", "Juni"],
  ["07", "Juli"],
  ["08", "Agustus"],
  ["09", "September"],
  ["10", "Oktober"],
  ["11", "November"],
  ["12", "Desember"]
];

type FieldOption = { value: string; label: string };

function Field({ label, children, helper }: { label: string; children: ReactNode; helper?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  type = "text",
  min,
  max,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <input
      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-teal-100"
      max={max}
      min={min}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      value={value}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: FieldOption[];
}) {
  return (
    <select
      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-teal-100"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  label,
  onChange,
  helper
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  helper?: string;
}) {
  return (
    <label className="flex min-h-[4.25rem] items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span>
        <span className="block text-sm font-semibold text-slate-700">{label}</span>
        {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
      </span>
      <input
        checked={checked}
        className="h-5 w-5 shrink-0 accent-teal-700"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  tone = "teal"
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  tone?: "teal" | "blue" | "amber" | "rose" | "slate" | "violet";
}) {
  const toneClass = {
    teal: "bg-teal-50 text-brand",
    blue: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
    violet: "bg-violet-50 text-violet-700"
  }[tone];

  return (
    <section className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="mb-5 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={19} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function SettingsPage({ user }: { user: AuthUser }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [message, setMessage] = useState<string | null>(null);

  const completionScore = useMemo(() => {
    const required: (keyof AppSettings)[] = [
      "companyName",
      "legalName",
      "companyEmail",
      "currency",
      "fiscalYearStartMonth",
      "invoicePrefix",
      "billPrefix",
      "journalPrefix"
    ];
    return Math.round((required.filter((key) => Boolean(settings[key])).length / required.length) * 100);
  }, [settings]);

  function updateField<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAppSettings(settings);
    setMessage("Pengaturan sistem berhasil disimpan.");
  }

  function handleReset() {
    setSettings(defaultSettings);
    saveAppSettings(defaultSettings);
    setMessage("Pengaturan dikembalikan ke default.");
  }

  return (
    <form className="space-y-5" onSubmit={handleSave}>
      <section className="overflow-hidden rounded-lg border border-slate-900 bg-ink text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_24rem]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
              <SlidersHorizontal size={14} aria-hidden="true" />
              Pusat kontrol aplikasi
            </div>
            <h3 className="text-2xl font-bold">Pengaturan Sistem Keuangan</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Kelola identitas perusahaan, aturan akuntansi, pajak, approval, keamanan, backup, integrasi, dan preferensi tampilan dari satu tempat.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-md border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-slate-300">Kelengkapan setting</p>
              <p className="mt-1 text-2xl font-bold">{completionScore}%</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-slate-300">Role aktif</p>
              <p className="mt-1 text-base font-bold capitalize">{user.role}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-slate-300">API</p>
              <p className="mt-1 truncate text-base font-bold capitalize">{settings.apiEnvironment}</p>
            </div>
          </div>
        </div>
      </section>

      <SettingsSection icon={Building2} title="Profil Perusahaan" description="Identitas yang muncul di header, dokumen, invoice, dan laporan." tone="blue">
        <Field label="Nama Brand">
          <TextInput onChange={(value) => updateField("companyName", value)} value={settings.companyName} />
        </Field>
        <Field label="Nama Legal">
          <TextInput onChange={(value) => updateField("legalName", value)} value={settings.legalName} />
        </Field>
        <Field label="NPWP / Tax ID">
          <TextInput onChange={(value) => updateField("taxId", value)} placeholder="Opsional" value={settings.taxId} />
        </Field>
        <Field label="Email Finance">
          <TextInput onChange={(value) => updateField("companyEmail", value)} type="email" value={settings.companyEmail} />
        </Field>
        <Field label="Telepon">
          <TextInput onChange={(value) => updateField("companyPhone", value)} placeholder="+62..." value={settings.companyPhone} />
        </Field>
        <Field label="Alamat">
          <TextInput onChange={(value) => updateField("companyAddress", value)} placeholder="Alamat kantor" value={settings.companyAddress} />
        </Field>
      </SettingsSection>

      <SettingsSection icon={FileCog} title="Akuntansi & Laporan" description="Atur periode, basis laporan, validasi jurnal, dan perilaku tutup buku.">
        <Field label="Mata Uang">
          <SelectInput onChange={(value) => updateField("currency", value as AppSettings["currency"])} options={[{ value: "IDR", label: "IDR - Rupiah" }, { value: "USD", label: "USD - Dollar" }]} value={settings.currency} />
        </Field>
        <Field label="Awal Tahun Fiskal">
          <SelectInput onChange={(value) => updateField("fiscalYearStartMonth", value)} options={monthOptions.map(([value, label]) => ({ value, label }))} value={settings.fiscalYearStartMonth} />
        </Field>
        <Field label="Hari Tutup Buku">
          <TextInput max={28} min={1} onChange={(value) => updateField("accountingCloseDay", value)} type="number" value={settings.accountingCloseDay} />
        </Field>
        <Field label="Tahun Default Dashboard">
          <TextInput max={2100} min={2000} onChange={(value) => updateField("reportDefaultYear", value)} type="number" value={settings.reportDefaultYear} />
        </Field>
        <Field label="Basis Laporan Default">
          <SelectInput onChange={(value) => updateField("defaultReportBasis", value as AppSettings["defaultReportBasis"])} options={[{ value: "accrual", label: "Accrual basis" }, { value: "cash", label: "Cash basis" }]} value={settings.defaultReportBasis} />
        </Field>
        <Toggle checked={settings.requireBalancedJournal} helper="Jurnal harus debit-kredit seimbang sebelum disimpan." label="Wajib balance jurnal" onChange={(value) => updateField("requireBalancedJournal", value)} />
        <Toggle checked={settings.chartOfAccountsLock} helper="Batasi perubahan COA setelah transaksi berjalan." label="Kunci chart of accounts" onChange={(value) => updateField("chartOfAccountsLock", value)} />
        <Toggle checked={settings.autoPostRecurringJournal} helper="Template jurnal periodik otomatis masuk posting." label="Auto-post jurnal berulang" onChange={(value) => updateField("autoPostRecurringJournal", value)} />
      </SettingsSection>

      <SettingsSection icon={Receipt} title="Dokumen, Pajak & Termin" description="Nomor dokumen, termin pembayaran, dan konfigurasi pajak operasional." tone="amber">
        <Field label="Prefix Invoice">
          <TextInput onChange={(value) => updateField("invoicePrefix", value)} value={settings.invoicePrefix} />
        </Field>
        <Field label="Prefix Bill">
          <TextInput onChange={(value) => updateField("billPrefix", value)} value={settings.billPrefix} />
        </Field>
        <Field label="Prefix Jurnal">
          <TextInput onChange={(value) => updateField("journalPrefix", value)} value={settings.journalPrefix} />
        </Field>
        <Field label="Termin Default (hari)">
          <TextInput min={0} onChange={(value) => updateField("defaultPaymentTerms", value)} type="number" value={settings.defaultPaymentTerms} />
        </Field>
        <Toggle checked={settings.taxEnabled} helper="Aktifkan kolom pajak untuk workflow dokumen." label="Modul pajak aktif" onChange={(value) => updateField("taxEnabled", value)} />
        <Field label="PPN Default (%)">
          <TextInput min={0} onChange={(value) => updateField("vatRate", value)} type="number" value={settings.vatRate} />
        </Field>
        <Field label="PPh Default (%)">
          <TextInput min={0} onChange={(value) => updateField("withholdingTaxRate", value)} type="number" value={settings.withholdingTaxRate} />
        </Field>
      </SettingsSection>

      <section className="grid gap-5 lg:grid-cols-2">
        <SettingsSection icon={ShieldCheck} title="Approval & Keamanan" description="Kontrol akses, sesi, dan jejak audit." tone="rose">
          <Toggle checked={settings.approvalWorkflow} helper="Transaksi besar masuk antrean persetujuan." label="Workflow approval" onChange={(value) => updateField("approvalWorkflow", value)} />
          <Field label="Limit Approval">
            <TextInput min={0} onChange={(value) => updateField("approvalLimit", value)} type="number" value={settings.approvalLimit} />
          </Field>
          <Toggle checked={settings.twoFactorReminder} helper="Tampilkan pengingat keamanan untuk pengguna." label="Pengingat 2FA" onChange={(value) => updateField("twoFactorReminder", value)} />
          <Field label="Timeout Sesi (menit)">
            <TextInput min={5} onChange={(value) => updateField("sessionTimeoutMinutes", value)} type="number" value={settings.sessionTimeoutMinutes} />
          </Field>
          <Field label="Retensi Audit Log (hari)">
            <TextInput min={30} onChange={(value) => updateField("auditLogRetentionDays", value)} type="number" value={settings.auditLogRetentionDays} />
          </Field>
        </SettingsSection>

        <SettingsSection icon={Bell} title="Notifikasi & Reminder" description="Pengingat piutang, anggaran, dan status sistem." tone="violet">
          <Toggle checked={settings.emailNotifications} helper="Kirim alert operasional melalui email." label="Notifikasi email" onChange={(value) => updateField("emailNotifications", value)} />
          <Field label="Reminder Jatuh Tempo (hari)">
            <TextInput min={0} onChange={(value) => updateField("overdueReminderDays", value)} type="number" value={settings.overdueReminderDays} />
          </Field>
          <Field label="Ambang Alert Anggaran (%)">
            <TextInput max={100} min={1} onChange={(value) => updateField("budgetAlertThreshold", value)} type="number" value={settings.budgetAlertThreshold} />
          </Field>
          <Toggle checked={settings.marketplaceSyncEnabled} helper="Siapkan sinkronisasi settlement marketplace." label="Sinkron marketplace" onChange={(value) => updateField("marketplaceSyncEnabled", value)} />
        </SettingsSection>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <SettingsSection icon={DatabaseBackup} title="Backup & Retensi" description="Kebijakan backup dan penyimpanan data." tone="slate">
          <Field label="Frekuensi Backup">
            <SelectInput onChange={(value) => updateField("backupFrequency", value as AppSettings["backupFrequency"])} options={[{ value: "daily", label: "Harian" }, { value: "weekly", label: "Mingguan" }, { value: "monthly", label: "Bulanan" }]} value={settings.backupFrequency} />
          </Field>
          <Field label="Retensi Backup (bulan)">
            <TextInput min={1} onChange={(value) => updateField("backupRetentionMonths", value)} type="number" value={settings.backupRetentionMonths} />
          </Field>
        </SettingsSection>

        <SettingsSection icon={Paintbrush} title="Tampilan & Lokalisasi" description="Preferensi format, halaman awal, dan kepadatan UI." tone="blue">
          <Field label="Format Angka">
            <SelectInput onChange={(value) => updateField("numberFormat", value as AppSettings["numberFormat"])} options={[{ value: "id-ID", label: "Indonesia (1.000,00)" }, { value: "en-US", label: "US (1,000.00)" }]} value={settings.numberFormat} />
          </Field>
          <Field label="Format Tanggal">
            <SelectInput onChange={(value) => updateField("dateFormat", value as AppSettings["dateFormat"])} options={[{ value: "dd MMM yyyy", label: "05 Sep 2026" }, { value: "dd/MM/yyyy", label: "05/09/2026" }, { value: "yyyy-MM-dd", label: "2026-09-05" }]} value={settings.dateFormat} />
          </Field>
          <Field label="Zona Waktu">
            <SelectInput onChange={(value) => updateField("timezone", value as AppSettings["timezone"])} options={[{ value: "Asia/Jakarta", label: "WIB - Jakarta" }, { value: "Asia/Makassar", label: "WITA - Makassar" }, { value: "Asia/Jayapura", label: "WIT - Jayapura" }, { value: "UTC", label: "UTC" }]} value={settings.timezone} />
          </Field>
          <Field label="Halaman Awal">
            <SelectInput onChange={(value) => updateField("landingPage", value as AppSettings["landingPage"])} options={[{ value: "dashboard", label: "Dashboard" }, { value: "jurnal", label: "Jurnal" }, { value: "laporan", label: "Laporan" }]} value={settings.landingPage} />
          </Field>
          <Toggle checked={settings.compactMode} helper="Padatkan jarak antarkomponen untuk layar kecil." label="Mode tampilan ringkas" onChange={(value) => updateField("compactMode", value)} />
        </SettingsSection>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
            <Wifi size={18} className="text-brand" aria-hidden="true" />
            Koneksi
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Base URL API</dt>
              <dd className="mt-1 break-all rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-ink">{getApiBaseUrl()}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Environment</dt>
              <dd className="mt-1 capitalize text-ink">{settings.apiEnvironment}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
            <KeyRound size={18} className="text-amber-700" aria-hidden="true" />
            Akses Saat Ini
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Pengguna</dt>
              <dd className="mt-1 text-ink">{user.full_name}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Email</dt>
              <dd className="mt-1 text-ink">{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Role</dt>
              <dd className="mt-1 capitalize text-ink">{user.role}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
            <Cloud size={18} className="text-sky-700" aria-hidden="true" />
            Modul Dicakup
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
            {[
              [Globe2, "Profil"],
              [Gauge, "Laporan"],
              [WalletCards, "Dokumen"],
              [ShieldCheck, "Approval"],
              [Store, "Marketplace"],
              [DatabaseBackup, "Backup"]
            ].map(([Icon, label]) => {
              const ModuleIcon = Icon as LucideIcon;
              return (
                <span key={String(label)} className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2">
                  <ModuleIcon size={14} aria-hidden="true" />
                  {label as string}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {message && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={18} aria-hidden="true" />
          {message}
        </div>
      )}

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-3 rounded-lg border border-white/80 bg-white/90 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.12)] backdrop-blur">
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={handleReset}
          type="button"
        >
          <RotateCcw size={17} aria-hidden="true" />
          Reset
        </button>
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800" type="submit">
          <Save size={17} aria-hidden="true" />
          Simpan Pengaturan
        </button>
      </div>
    </form>
  );
}
