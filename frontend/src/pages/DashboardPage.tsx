import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Gauge, Minus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { fetchBalanceSheet, fetchCashFlow, fetchIncomeStatement } from "../lib/api";
import { AssetPieChart, CashFlowBarChart, ExpensePieChart, TrendChart } from "../components/ReportCharts";
import {
  previousAccountingPeriodRange,
  startOfAccountingPeriodString,
  todayString
} from "../lib/period";
import { loadAppSettings } from "../lib/settings";
import type { AuthUser, BalanceSheetReport, CashFlowReport, IncomeStatementReport, ReportLineItem } from "../types";

const MONTH_LABELS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1
  }).format(Math.abs(value));
}

type TrendDirection = "up" | "down" | "flat";

type Trend = {
  direction: TrendDirection;
  percent: number | null; // null kalau bulan lalu 0 (tidak ada pembanding yang bermakna)
};

function computeTrend(current: number, previous: number): Trend {
  const diff = current - previous;

  if (Math.abs(diff) < 0.01) {
    return { direction: "flat", percent: 0 };
  }

  const direction: TrendDirection = diff > 0 ? "up" : "down";

  if (Math.abs(previous) < 0.01) {
    return { direction, percent: null };
  }

  return { direction, percent: (diff / Math.abs(previous)) * 100 };
}

/**
 * Untuk beban, naik itu buruk (merah) dan turun itu baik (hijau) -- kebalikan
 * dari pendapatan/laba. `goodDirection` menandai arah mana yang dianggap baik.
 */
function TrendBadge({ trend, goodDirection }: { trend: Trend; goodDirection: TrendDirection }) {
  const isGood = trend.direction === goodDirection || trend.direction === "flat";
  const toneClass = trend.direction === "flat" ? "text-slate-500" : isGood ? "text-emerald-600" : "text-danger";
  const Icon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;

  const label =
    trend.direction === "flat"
      ? "Sama seperti bulan lalu"
      : trend.percent === null
        ? `${trend.direction === "up" ? "Naik" : "Turun"} dari Rp 0 bulan lalu`
        : `${trend.direction === "up" ? "Naik" : "Turun"} ${formatPercent(trend.percent)}% dari bulan lalu`;

  return (
    <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${toneClass}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </p>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  trend
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: "brand" | "positive" | "negative";
  trend?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive" ? "bg-emerald-50 text-emerald-700" : tone === "negative" ? "bg-rose-50 text-danger" : "bg-sky-50 text-sky-700";

  return (
    <div className="rounded-lg border border-white/80 bg-white/90 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-xl font-bold text-ink">{value}</p>
      {trend}
    </div>
  );
}

function ExpenseBreakdown({ items, total }: { items: ReportLineItem[]; total: number }) {
  const sorted = [...items]
    .filter((item) => Number(item.amount || 0) > 0)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));

  if (!sorted.length) {
    return <p className="text-sm text-slate-500">Belum ada beban tercatat bulan ini.</p>;
  }

  const max = Number(sorted[0].amount || 0);

  return (
    <div className="space-y-3">
      {sorted.map((item) => {
        const amount = Number(item.amount || 0);
        const widthPercent = max > 0 ? Math.max((amount / max) * 100, 4) : 0;
        const shareOfTotal = total > 0 ? (amount / total) * 100 : 0;

        return (
          <div key={item.account_id ?? item.account_code}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink">{item.account_name}</span>
              <span className="whitespace-nowrap font-semibold text-ink">{formatCurrency(amount)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-danger/70" style={{ width: `${widthPercent}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-xs text-slate-500">{formatPercent(shareOfTotal)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPage({ user }: { user: AuthUser }) {
  const [selectedYear, setSelectedYear] = useState(() => Number(loadAppSettings().reportDefaultYear || new Date().getFullYear()));
  const [income, setIncome] = useState<IncomeStatementReport | null>(null);
  const [previousIncome, setPreviousIncome] = useState<IncomeStatementReport | null>(null);
  const [balance, setBalance] = useState<BalanceSheetReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [trendData, setTrendData] = useState<
    { label: string; revenue: number; expense: number; netIncome: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentStart = startOfAccountingPeriodString();
    const currentEnd = todayString();
    const previousPeriod = previousAccountingPeriodRange();
    const trendPeriods = annualCalendarPeriods(selectedYear);

    Promise.all([
      fetchIncomeStatement(currentStart, currentEnd),
      fetchIncomeStatement(previousPeriod.start, previousPeriod.end),
      fetchBalanceSheet(currentEnd),
      fetchCashFlow(currentStart, currentEnd),
      Promise.all(trendPeriods.map((period) => fetchIncomeStatement(period.start, period.end)))
    ])
      .then(([incomeReport, previousIncomeReport, balanceReport, cashFlowReport, trendReports]) => {
        setIncome(incomeReport);
        setPreviousIncome(previousIncomeReport);
        setBalance(balanceReport);
        setCashFlow(cashFlowReport);
        setTrendData(
          trendReports.map((report, index) => ({
            label: trendPeriods[index].label,
            revenue: report.totals.total_revenue,
            expense: report.totals.total_expenses,
            netIncome: report.totals.net_income
          }))
        );
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat ringkasan dashboard.");
      })
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  const revenueTrend = income && previousIncome ? computeTrend(income.totals.total_revenue, previousIncome.totals.total_revenue) : null;
  const expenseTrend =
    income && previousIncome ? computeTrend(income.totals.total_expenses, previousIncome.totals.total_expenses) : null;
  const netIncomeTrend = income && previousIncome ? computeTrend(income.totals.net_income, previousIncome.totals.net_income) : null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-900 bg-ink text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-white">
              <Gauge size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-300">Selamat datang,</p>
              <h3 className="text-2xl font-bold">{user.full_name}</h3>
              <p className="mt-1 text-sm text-slate-300">Pantau kas, laba, aset, dan kesehatan neraca dalam satu layar.</p>
            </div>
          </div>
          <div>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-300">Tahun Chart</span>
              <input
                className="mt-1 h-10 w-32 rounded-md border border-white/20 bg-white/10 px-3 text-white outline-none focus:border-white focus:ring-4 focus:ring-white/10"
                max={2100}
                min={2000}
                onChange={(event) => setSelectedYear(Number(event.target.value || new Date().getFullYear()))}
                type="number"
                value={selectedYear}
              />
            </label>
          </div>
        </div>
      </section>

      {isLoading && <p className="text-sm text-slate-500">Memuat ringkasan...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

      {!isLoading && !error && income && balance && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Pendapatan Bulan Ini"
              value={formatCurrency(income.totals.total_revenue)}
              icon={TrendingUp}
              tone="positive"
              trend={revenueTrend && <TrendBadge trend={revenueTrend} goodDirection="up" />}
            />
            <StatCard
              label="Beban Bulan Ini"
              value={formatCurrency(income.totals.total_expenses)}
              icon={TrendingDown}
              tone="negative"
              trend={expenseTrend && <TrendBadge trend={expenseTrend} goodDirection="down" />}
            />
            <StatCard
              label="Laba/Rugi Bersih"
              value={formatCurrency(income.totals.net_income)}
              icon={Wallet}
              tone={income.totals.net_income >= 0 ? "positive" : "negative"}
              trend={netIncomeTrend && <TrendBadge trend={netIncomeTrend} goodDirection="up" />}
            />
            <StatCard label="Total Aset" value={formatCurrency(balance.totals.total_assets)} icon={Gauge} tone="brand" />
          </div>

          <section className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur">
            <h4 className="mb-3 text-sm font-semibold uppercase text-slate-500">Beban Bulan Ini per Kategori</h4>
            <ExpenseBreakdown items={income.expenses} total={income.totals.total_expenses} />
          </section>

          <section className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur">
            <h4 className="mb-3 text-sm font-semibold uppercase text-slate-500">Status Neraca Hari Ini</h4>
            <div
              className={[
                "flex items-center gap-3 rounded-md border px-4 py-3",
                balance.totals.is_balanced
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-danger"
              ].join(" ")}
            >
              {balance.totals.is_balanced ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
              <div>
                <p className="text-xs font-semibold uppercase">{balance.totals.is_balanced ? "Balance" : "Tidak Balance"}</p>
                <p className="text-sm">
                  Total Aset {formatCurrency(balance.totals.total_assets)} vs Liabilitas + Ekuitas{" "}
                  {formatCurrency(balance.totals.total_liabilities_and_equity)}
                </p>
              </div>
            </div>
          </section>

          {trendData.length > 0 && <TrendChart data={trendData} title={`Tren Pendapatan, Beban & Laba Bersih ${selectedYear}`} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <ExpensePieChart items={income.expenses} />
            <AssetPieChart items={balance.assets} />
          </div>

          {cashFlow && <CashFlowBarChart report={cashFlow} />}
        </>
      )}
    </div>
  );
}

function annualCalendarPeriods(year: number) {
  return Array.from({ length: 12 }, (_, month) => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = new Date(year, month + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

    return {
      start,
      end,
      label: MONTH_LABELS_ID[month]
    };
  });
}
