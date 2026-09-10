import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, CircleAlert, CreditCard, PiggyBank, Scale, Wallet } from "lucide-react";
import { fetchBalanceSheet } from "../lib/api";
import { ExportButtons } from "../components/ExportButtons";
import { SummaryCard } from "../components/SummaryCard";
import { AccountDetailModal } from "../components/AccountDetailModal";
import { formatCurrency } from "../lib/format";
import { todayString } from "../lib/period";

// Neraca bersifat kumulatif sejak awal berdirinya akun (bukan per-periode),
// jadi rincian transaksi per akun harus mengambil dari sangat awal, bukan
// hanya dari awal periode berjalan — supaya totalnya cocok dengan saldo di Neraca.
const LEDGER_INCEPTION_DATE = "2000-01-01";
import type { BalanceSheetReport, ReportLineItem } from "../types";

function today() {
  return todayString();
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
  icon: typeof Scale;
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
        <p className="rounded-md bg-panel px-3 py-3 text-sm text-slate-400">Tidak ada data pada tanggal ini.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => {
                const amount = item.ending_balance || 0;
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
                <td className="py-2.5 pr-2 text-right tabular-nums text-ink">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(today());
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<ReportLineItem | null>(null);

  function loadReport(date: string) {
    setIsLoading(true);
    setError(null);

    fetchBalanceSheet(date)
      .then(setReport)
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat neraca.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadReport(asOfDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drillDownStart = LEDGER_INCEPTION_DATE;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-md border border-line bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Per Tanggal</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setAsOfDate(event.target.value)}
            type="date"
            value={asOfDate}
          />
        </label>

        <div className="flex items-end">
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-700 md:w-auto"
            onClick={() => loadReport(asOfDate)}
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
            <SummaryCard icon={Wallet} label="Total Aset" value={report.totals.total_assets} tone="neutral" />
            <SummaryCard icon={CreditCard} label="Total Liabilitas" value={report.totals.total_liabilities} tone="negative" />
            <SummaryCard icon={PiggyBank} label="Total Ekuitas" value={report.totals.total_equity} tone="positive" />
          </section>

          <section className="rounded-md border border-line bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-3">
                <Scale size={18} className="text-brand" aria-hidden="true" />
                <h3 className="text-base font-semibold text-ink">Neraca</h3>
              </div>
              <ExportButtons reportSlug="balance-sheet" params={{ as_of_date: asOfDate }} />
            </div>

            <div className="space-y-6 px-4 py-5">
              <p className="-mt-1 text-xs text-slate-400">Klik nama akun untuk melihat rincian transaksinya.</p>

              <ReportSection
                title="Aset"
                icon={Wallet}
                items={report.assets}
                total={report.totals.total_assets}
                onSelectAccount={setSelectedAccount}
              />

              <ReportSection
                title="Liabilitas"
                icon={CreditCard}
                items={report.liabilities}
                total={report.totals.total_liabilities}
                onSelectAccount={setSelectedAccount}
              />

              <ReportSection
                title="Ekuitas"
                icon={PiggyBank}
                items={report.equity}
                total={report.totals.total_equity}
                onSelectAccount={setSelectedAccount}
              />

              <div className="grid gap-3 border-t border-line pt-5 md:grid-cols-3">
                <div className="rounded-md border border-line bg-panel px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Total Aset</p>
                  <p className="mt-1 text-base font-bold text-ink">{formatCurrency(report.totals.total_assets)}</p>
                </div>
                <div className="rounded-md border border-line bg-panel px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Total Liabilitas + Ekuitas</p>
                  <p className="mt-1 text-base font-bold text-ink">
                    {formatCurrency(report.totals.total_liabilities_and_equity)}
                  </p>
                </div>
                <div
                  className={[
                    "flex items-center gap-3 rounded-md border px-4 py-3",
                    report.totals.is_balanced
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-danger"
                  ].join(" ")}
                >
                  {report.totals.is_balanced ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
                  <div>
                    <p className="text-xs font-semibold uppercase">
                      {report.totals.is_balanced ? "Balance" : "Tidak Balance"}
                    </p>
                    <p className="text-sm">
                      {report.totals.is_balanced
                        ? "Aset = Liabilitas + Ekuitas"
                        : `Selisih ${formatCurrency(Math.abs(report.totals.difference))}`}
                    </p>
                  </div>
                </div>
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
          startDate={drillDownStart}
          endDate={asOfDate}
          periodLabel={`Semua transaksi s/d ${asOfDate}`}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
}
