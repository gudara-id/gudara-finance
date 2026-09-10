import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { CashFlowReport, ReportLineItem } from "../types";

const COLORS = {
  revenue: "#0f766e", // brand
  expense: "#b91c1c", // danger
  netIncome: "#2563eb",
  operating: "#0f766e",
  investing: "#d97706",
  financing: "#2563eb"
};

const PIE_PALETTE = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#b91c1c", "#0891b2", "#65a30d", "#db2777"];

function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return String(value);
}

function formatFullCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold uppercase text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((entry: any) => (
        <p key={entry.dataKey ?? entry.name} className="flex items-center gap-2" style={{ color: entry.color }}>
          <span>{entry.name}:</span>
          <span className="font-semibold">{formatFullCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Tren pendapatan, beban, dan laba bersih beberapa periode terakhir. */
export function TrendChart({
  data,
  title = "Tren Pendapatan, Beban & Laba Bersih"
}: {
  data: { label: string; revenue: number; expense: number; netIncome: number }[];
  title?: string;
}) {
  return (
    <ChartCard title={title}>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={formatCompactCurrency} width={56} />
            <Tooltip content={<CurrencyTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="revenue" name="Pendapatan" stroke={COLORS.revenue} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="expense" name="Beban" stroke={COLORS.expense} strokeWidth={2} dot={{ r: 3 }} />
            <Line
              type="monotone"
              dataKey="netIncome"
              name="Laba Bersih"
              stroke={COLORS.netIncome}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function ReportPieChart({ title, items, emptyLabel }: { title: string; items: ReportLineItem[]; emptyLabel: string }) {
  const data = items
    .map((item) => ({ name: item.account_name, value: Number(item.amount ?? item.ending_balance ?? 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard title={title}>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={1}
                label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CurrencyTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => <span className="text-ink">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {total > 0 && <p className="mt-2 text-right text-xs text-slate-500">Total: {formatFullCurrency(total)}</p>}
    </ChartCard>
  );
}

/** Komposisi beban bulan berjalan per kategori akun. */
export function ExpensePieChart({ items }: { items: ReportLineItem[] }) {
  return <ReportPieChart title="Komposisi Beban Bulan Ini" items={items} emptyLabel="Belum ada beban tercatat bulan ini." />;
}

/** Komposisi aset per akun, per tanggal neraca. */
export function AssetPieChart({ items }: { items: ReportLineItem[] }) {
  return <ReportPieChart title="Komposisi Aset" items={items} emptyLabel="Belum ada aset tercatat." />;
}

/** Arus kas bersih per kategori (operasi, investasi, pendanaan). */
export function CashFlowBarChart({ report }: { report: CashFlowReport }) {
  const data = [
    { name: "Operasi", value: report.totals.net_operating_cash_flow, fill: COLORS.operating },
    { name: "Investasi", value: report.totals.net_investing_cash_flow, fill: COLORS.investing },
    { name: "Pendanaan", value: report.totals.net_financing_cash_flow, fill: COLORS.financing }
  ];

  return (
    <ChartCard title="Arus Kas per Kategori Bulan Ini">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={formatCompactCurrency} width={56} />
            <Tooltip content={<CurrencyTooltip />} />
            <Bar dataKey="value" name="Arus Kas Bersih" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-right text-xs text-slate-500">
        Arus Kas Bersih Total: {formatFullCurrency(report.totals.net_cash_flow)}
      </p>
    </ChartCard>
  );
}
