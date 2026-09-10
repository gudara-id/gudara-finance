import { useEffect, useState } from "react";
import { ChevronRight, Landmark, RefreshCw, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { fetchCashFlow } from "../lib/api";
import { ExportButtons } from "../components/ExportButtons";
import { SummaryCard } from "../components/SummaryCard";
import { AccountDetailModal } from "../components/AccountDetailModal";
import { formatCurrency } from "../lib/format";
import { startOfAccountingPeriodString, todayString } from "../lib/period";
import type { CashFlowLineItem, CashFlowReport } from "../types";

function CashFlowSection({
  title,
  icon: Icon,
  items,
  total,
  onSelectAccount
}: {
  title: string;
  icon: typeof Waves;
  items: CashFlowLineItem[];
  total: number;
  onSelectAccount: (item: CashFlowLineItem) => void;
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
                const amount = item.cash_flow_amount || 0;
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
                  Kas Bersih {title}
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

export function CashFlowPage() {
  const [startDate, setStartDate] = useState(startOfAccountingPeriodString());
  const [endDate, setEndDate] = useState(todayString());
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<CashFlowLineItem | null>(null);

  function loadReport(start: string, end: string) {
    setIsLoading(true);
    setError(null);

    fetchCashFlow(start, end)
      .then(setReport)
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat laporan arus kas.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadReport(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPositive = (report?.totals.net_cash_flow ?? 0) >= 0;

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
          <section className="grid gap-3 sm:grid-cols-4">
            <SummaryCard icon={RefreshCw} label="Kas dari Operasi" value={report.totals.net_operating_cash_flow} tone="neutral" />
            <SummaryCard icon={Landmark} label="Kas dari Investasi" value={report.totals.net_investing_cash_flow} tone="neutral" />
            <SummaryCard icon={Waves} label="Kas dari Pendanaan" value={report.totals.net_financing_cash_flow} tone="neutral" />
            <SummaryCard
              icon={isPositive ? TrendingUp : TrendingDown}
              label="Kenaikan/Penurunan Bersih"
              value={report.totals.net_cash_flow}
              tone={isPositive ? "positive" : "negative"}
            />
          </section>

          <section className="rounded-md border border-line bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-3">
                <Waves size={18} className="text-brand" aria-hidden="true" />
                <h3 className="text-base font-semibold text-ink">Laporan Arus Kas</h3>
              </div>
              <ExportButtons reportSlug="cash-flow" params={{ start_date: startDate, end_date: endDate }} />
            </div>

            <div className="space-y-6 px-4 py-5">
              <p className="-mt-1 text-xs text-slate-400">Klik nama akun untuk melihat rincian transaksinya.</p>

              <CashFlowSection
                title="Operasi"
                icon={RefreshCw}
                items={report.operating}
                total={report.totals.net_operating_cash_flow}
                onSelectAccount={setSelectedAccount}
              />

              <CashFlowSection
                title="Investasi"
                icon={Landmark}
                items={report.investing}
                total={report.totals.net_investing_cash_flow}
                onSelectAccount={setSelectedAccount}
              />

              <CashFlowSection
                title="Pendanaan"
                icon={Waves}
                items={report.financing}
                total={report.totals.net_financing_cash_flow}
                onSelectAccount={setSelectedAccount}
              />

              <div
                className={[
                  "flex items-center justify-between rounded-md px-4 py-4",
                  isPositive ? "bg-emerald-50" : "bg-red-50"
                ].join(" ")}
              >
                <span
                  className={[
                    "flex items-center gap-2 text-sm font-bold",
                    isPositive ? "text-emerald-800" : "text-danger"
                  ].join(" ")}
                >
                  {isPositive ? <TrendingUp size={18} aria-hidden="true" /> : <TrendingDown size={18} aria-hidden="true" />}
                  Kenaikan/Penurunan Kas Bersih
                </span>
                <span
                  className={["text-lg font-bold tabular-nums", isPositive ? "text-emerald-800" : "text-danger"].join(" ")}
                >
                  {formatCurrency(report.totals.net_cash_flow)}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      {selectedAccount && (
        <AccountDetailModal
          accountId={selectedAccount.account_id}
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
