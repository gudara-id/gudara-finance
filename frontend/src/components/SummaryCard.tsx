import type { LucideIcon } from "lucide-react";
import { formatCurrencyCompact } from "../lib/format";

export function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "neutral"
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "positive" | "negative" | "neutral";
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
