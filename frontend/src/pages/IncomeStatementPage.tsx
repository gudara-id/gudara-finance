import { useEffect, useState } from "react";
import {
  ChevronRight,
  Coins,
  PackageMinus,
  Receipt,
  ScrollText,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { fetchIncomeStatement } from "../lib/api";
import { AccountDetailModal } from "../components/AccountDetailModal";
import { ExportButtons } from "../components/ExportButtons";
import { startOfAccountingPeriodString, todayString } from "../lib/period";
import type { IncomeStatementReport, ReportLineItem } from "../types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatCurrencyCompact(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof Coins;
  label: string;
  value: number;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass = {
    positive: "bg-emerald-50 text-emerald-700",
    negative: "bg-red-50 text-danger",
    neutral: "bg-teal-50 text-brand"
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-3 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate text-base font-bold text-ink">{formatCurrencyCompact(value)}</p>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  icon: Icon,
  items,
  total,
  totalLabel,
  onSelectAccount
}: {
  title: string;
  icon: typeof Coins;
  items: ReportLineItem[];
  total: number;
  totalLabel?: string;
  onSelectAccount: (item: ReportLineItem) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} className="text-slate-400" aria-hidden="true" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md bg-panel px-3 py-3 text-sm text-slate-400">Tidak ada data pada periode ini.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => {
                const amount = item.amount || 0;
                return (
                  <tr
                    className="group cursor-pointer border-b border-line bg-white transition last:border-b-0 hover:bg-panel"
                    key={`${title}-${item.account_id}`}
                    onClick={() => onSelectAccount(item)}
                    title="Klik untuk lihat rincian transaksi"
                  >
                    <td className="w-12 py-3 pl-3 pr-1 text-xs text-slate-400">{item.account_code}</td>
                    <td className="py-3 pr-3">
                      <span className="font-medium text-ink group-hover:text-brand">{item.account_name}</span>
                    </td>
                    <td
                      className={`py-3 pr-2 text-right font-semibold tabular-nums ${amount < 0 ? "text-danger" : "text-ink"}`}
                    >
                      {formatCurrency(amount)}
                    </td>
                    <td className="w-8 pr-3 text-slate-300 group-hover:text-brand">
                      <ChevronRight size={16} aria-hidden="true" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-panel font-semibold">
                <td className="py-2.5 pl-3" colSpan={2}>
                  {totalLabel ?? `Total ${title}`}
                </td>
                <td className={`py-2.5 pr-2 text-right tabular-nums ${total < 0 ? "text-danger" : "text-ink"}`}>
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function IncomeStatementPage() {
  const [startDate, setStartDate] = useState(startOfAccountingPeriodString());
  const [endDate, setEndDate] = useState(todayString());
  const [report, setReport] = useState<IncomeStatementReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<ReportLineItem | null>(null);

  function loadReport(start: string, end: string) {
    setIsLoading(true);
    setError(null);

    fetchIncomeStatement(start, end)
      .then(setReport)
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat laporan laba rugi.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadReport(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isProfit = (report?.totals.net_income ?? 0) >= 0;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-md border border-line bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Dari Tanggal</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Sampai Tanggal</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
            value={endDate}
          />
        </label>

        <div className="flex items-end">
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-700 md:w-auto"
            onClick={() => loadReport(startDate, endDate)}
            type="button"
          >
            Tampilkan
          </button>
        </div>
      </section>

      {isLoading && (
        <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
          Memuat laporan...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!isLoading && !error && report && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard icon={Coins} label="Total Pendapatan" value={report.totals.total_revenue} tone="neutral" />
            <SummaryCard
              icon={TrendingUp}
              label="Laba Kotor"
              value={report.totals.gross_profit}
              tone={report.totals.gross_profit >= 0 ? "positive" : "negative"}
            />
            <SummaryCard
              icon={isProfit ? TrendingUp : TrendingDown}
              label="Laba/Rugi Bersih"
              value={report.totals.net_income}
              tone={isProfit ? "positive" : "negative"}
            />
          </section>

          <section className="rounded-md border border-line bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-3">
                <ScrollText size={18} className="text-brand" aria-hidden="true" />
                <h3 className="text-base font-semibold text-ink">Laporan Laba Rugi</h3>
              </div>
              <ExportButtons reportSlug="income-statement" params={{ start_date: startDate, end_date: endDate }} />
            </div>

            <div className="space-y-6 px-4 py-5">
              <p className="-mt-1 text-xs text-slate-400">Klik nama akun untuk melihat rincian transaksinya.</p>

              <ReportSection
                title="Pendapatan"
                icon={Coins}
                items={report.revenue}
                total={report.totals.total_revenue}
                onSelectAccount={setSelectedAccount}
              />

              <ReportSection
                title="Harga Pokok Penjualan"
                icon={PackageMinus}
                items={report.cogs}
                total={report.totals.total_cogs}
                onSelectAccount={setSelectedAccount}
              />

              <div className="flex items-center justify-between rounded-md bg-teal-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-brand">
                  <TrendingUp size={16} aria-hidden="true" />
                  Laba Kotor
                </span>
                <span className="text-base font-bold tabular-nums text-brand">
                  {formatCurrency(report.totals.gross_profit)}
                </span>
              </div>

              <ReportSection
                title="Beban"
                icon={Receipt}
                items={report.expenses}
                total={report.totals.total_expenses}
                onSelectAccount={setSelectedAccount}
              />

              <div
                className={[
                  "flex items-center justify-between rounded-md px-4 py-4",
                  isProfit ? "bg-emerald-50" : "bg-red-50"
                ].join(" ")}
              >
                <span
                  className={["flex items-center gap-2 text-sm font-bold", isProfit ? "text-emerald-800" : "text-danger"].join(
                    " "
                  )}
                >
                  {isProfit ? <TrendingUp size={18} aria-hidden="true" /> : <TrendingDown size={18} aria-hidden="true" />}
                  Laba/Rugi Bersih
                </span>
                <span
                  className={["text-lg font-bold tabular-nums", isProfit ? "text-emerald-800" : "text-danger"].join(" ")}
                >
                  {formatCurrency(report.totals.net_income)}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      {selectedAccount && (
        <AccountDetailModal
          accountId={selectedAccount.account_id as string | number}
          accountCode={selectedAccount.account_code}
          accountName={selectedAccount.account_name}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
}
