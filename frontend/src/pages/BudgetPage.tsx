import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  TrendingDown,
  TrendingUp,
  Wallet
} from "lucide-react";
import { fetchBudgets, saveBudgets } from "../lib/api";
import { currentPeriodMonth, periodMonthLabel, shiftPeriodMonth } from "../lib/period";
import type { BudgetItem, BudgetReport } from "../types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

const accountTypeLabel: Record<string, string> = {
  revenue: "Pendapatan",
  cogs: "Harga Pokok Penjualan (HPP)",
  expense: "Beban"
};

/**
 * Untuk akun Pendapatan, realisasi di ATAS anggaran itu bagus (hijau) dan
 * di BAWAH anggaran itu kurang baik (merah) — kebalikan dari HPP/Beban,
 * di mana realisasi di ATAS anggaran berarti kelebihan biaya (merah).
 */
function varianceTone(item: BudgetItem): "good" | "bad" | "neutral" {
  if (item.budget_amount === 0) return "neutral";

  const isOverBudget = item.variance > 0;
  const isRevenue = item.account_type === "revenue";

  if (isRevenue) {
    return isOverBudget ? "good" : item.variance < 0 ? "bad" : "neutral";
  }
  return isOverBudget ? "bad" : item.variance < 0 ? "good" : "neutral";
}

const toneClass: Record<string, string> = {
  good: "text-emerald-700",
  bad: "text-danger",
  neutral: "text-slate-500"
};

export function BudgetPage() {
  const [periodMonth, setPeriodMonth] = useState(() => currentPeriodMonth());
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSaveSuccess(false);

    fetchBudgets(periodMonth)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        const amounts: Record<string, string> = {};
        for (const item of data.items) {
          amounts[String(item.account_id)] = item.budget_amount > 0 ? String(item.budget_amount) : "";
        }
        setDraftAmounts(amounts);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat data anggaran.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [periodMonth]);

  async function handleSave() {
    if (!report) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const items = report.items.map((item) => ({
        account_id: item.account_id,
        amount: Number(draftAmounts[String(item.account_id)] || 0)
      }));

      const updated = await saveBudgets(periodMonth, items);
      setReport(updated);
      setSaveSuccess(true);
    } catch (saveErr) {
      setSaveError(saveErr instanceof Error ? saveErr.message : "Gagal menyimpan anggaran.");
    } finally {
      setIsSaving(false);
    }
  }

  const groups: { type: "revenue" | "cogs" | "expense"; items: BudgetItem[] }[] = report
    ? (["revenue", "cogs", "expense"] as const)
        .map((type) => ({ type, items: report.items.filter((item) => item.account_type === type) }))
        .filter((group) => group.items.length > 0)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Anggaran (Budget vs Actual)</h2>
          <p className="text-sm text-slate-500">
            Bandingkan target anggaran dengan realisasi pendapatan, HPP, dan beban tiap periode.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1.5 shadow-sm">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={() => setPeriodMonth((current) => shiftPeriodMonth(current, -1))}
            title="Bulan sebelumnya"
            type="button"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-ink">
            {periodMonthLabel(periodMonth)}
          </span>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={() => setPeriodMonth((current) => shiftPeriodMonth(current, 1))}
            title="Bulan berikutnya"
            type="button"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Memuat data anggaran...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

      {!isLoading && !error && report && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard icon={Wallet} label="Total Anggaran" value={formatCurrency(report.totals.total_budget)} />
            <SummaryCard icon={TrendingUp} label="Total Realisasi" value={formatCurrency(report.totals.total_actual)} />
            <SummaryCard
              icon={report.totals.total_variance >= 0 ? TrendingUp : TrendingDown}
              label="Selisih"
              value={formatCurrency(Math.abs(report.totals.total_variance))}
            />
          </div>

          {groups.map((group) => (
            <section className="overflow-hidden rounded-md border border-line bg-white shadow-sm" key={group.type}>
              <div className="border-b border-line bg-panel px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">{accountTypeLabel[group.type]}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Akun</th>
                      <th className="px-4 py-2.5 text-right">Anggaran</th>
                      <th className="px-4 py-2.5 text-right">Realisasi</th>
                      <th className="px-4 py-2.5 text-right">Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => {
                      const tone = varianceTone(item);
                      const isOverBudgetWarning = tone === "bad" && item.budget_amount > 0;

                      return (
                        <tr className="border-t border-line" key={item.account_id}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-ink">{item.account_name}</p>
                            <p className="text-xs text-slate-400">{item.account_code}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              className="h-9 w-36 rounded-md border border-line px-2 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                              min="0"
                              onChange={(event) =>
                                setDraftAmounts((current) => ({
                                  ...current,
                                  [String(item.account_id)]: event.target.value
                                }))
                              }
                              placeholder="0"
                              step="1000"
                              type="number"
                              value={draftAmounts[String(item.account_id)] ?? ""}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{formatCurrency(item.actual_amount)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${toneClass[tone]}`}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              {isOverBudgetWarning && <AlertTriangle size={13} aria-hidden="true" />}
                              {item.variance > 0 ? "+" : ""}
                              {formatCurrency(item.variance)}
                              {item.variance_percent !== null && (
                                <span className="text-xs text-slate-400">
                                  ({item.variance_percent > 0 ? "+" : ""}
                                  {item.variance_percent.toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Anggaran untuk {periodMonthLabel(periodMonth)} berhasil disimpan.
            </div>
          )}

          <div className="flex justify-end">
            <button
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isSaving}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
              {isSaving ? "Menyimpan..." : "Simpan Anggaran"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} aria-hidden="true" />
        <p className="text-xs font-semibold uppercase">{label}</p>
      </div>
      <p className="mt-1.5 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
