import { useEffect, useState } from "react";
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Clock3, Wallet } from "lucide-react";
import { fetchAgingReport } from "../lib/api";
import { formatCurrency, formatDateID } from "../lib/format";
import type { AgingBucketKey, AgingReport, AuthUser } from "../types";

const bucketLabels: Record<AgingBucketKey, string> = {
  belum_jatuh_tempo: "Belum Jatuh Tempo",
  "1_30": "1-30 Hari",
  "31_60": "31-60 Hari",
  "61_90": "61-90 Hari",
  "90_plus": ">90 Hari"
};

const bucketKeys: AgingBucketKey[] = ["belum_jatuh_tempo", "1_30", "31_60", "61_90", "90_plus"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: "teal" | "amber";
}) {
  const toneClass = tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700";

  return (
    <div className="rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-md ${toneClass}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function AgingCard({ title, report, isLoading, error }: { title: string; report: AgingReport | null; isLoading: boolean; error: string | null }) {
  return (
    <section className="rounded-lg border border-white/80 bg-white/90 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <Clock3 size={18} className="text-brand" aria-hidden="true" />
          <h3 className="text-base font-bold text-ink">{title}</h3>
        </div>
        {report && <span className="text-xs text-slate-500">Per {formatDateID(report.as_of_date)}</span>}
      </div>

      <div className="p-5">
        {isLoading && <p className="text-sm text-slate-500">Memuat data...</p>}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {!isLoading && !error && report && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {bucketKeys.map((key) => (
                <div key={key} className="rounded-md border border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">{bucketLabels[key]}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{formatCurrency(report.buckets[key])}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Kontak</th>
                    <th className="px-3 py-2 text-right">Jatuh Tempo</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_contact.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={3}>
                        Tidak ada saldo terbuka.
                      </td>
                    </tr>
                  ) : (
                    report.by_contact
                      .slice()
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 8)
                      .map((row) => (
                        <tr className="border-t border-slate-200" key={row.contact_id}>
                          <td className="px-3 py-2 font-medium text-ink">{row.contact_name}</td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {row["1_30"] + row["31_60"] + row["61_90"] + row["90_plus"] > 0
                              ? formatCurrency(row["1_30"] + row["31_60"] + row["61_90"] + row["90_plus"])
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-ink">{formatCurrency(row.total)}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function SalesDashboardPage({ user }: { user: AuthUser }) {
  const [arReport, setArReport] = useState<AgingReport | null>(null);
  const [apReport, setApReport] = useState<AgingReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    const asOfDate = today();

    Promise.all([fetchAgingReport("ar", asOfDate), fetchAgingReport("ap", asOfDate)])
      .then(([ar, ap]) => {
        setArReport(ar);
        setApReport(ap);
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat data."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-900 bg-ink text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="p-6">
          <p className="text-xs font-semibold uppercase text-slate-300">Selamat datang</p>
          <h3 className="mt-1 text-2xl font-bold">{user.full_name}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Ringkasan Piutang &amp; Utang perusahaan. Akun sales hanya dapat melihat data ini — tidak dapat menambah, mengubah, atau menghapus transaksi.
          </p>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          label="Total Piutang Terbuka"
          value={arReport ? formatCurrency(arReport.total) : "—"}
          icon={ArrowDownCircle}
          tone="teal"
        />
        <SummaryCard
          label="Total Utang Terbuka"
          value={apReport ? formatCurrency(apReport.total) : "—"}
          icon={ArrowUpCircle}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AgingCard title="Umur Piutang" report={arReport} isLoading={isLoading} error={null} />
        <AgingCard title="Umur Utang" report={apReport} isLoading={isLoading} error={null} />
      </div>

      <p className="text-center text-xs text-slate-400">
        Untuk detail per invoice/tagihan, buka menu <span className="font-semibold text-slate-500">Piutang &amp; Utang</span>.
      </p>
    </div>
  );
}
