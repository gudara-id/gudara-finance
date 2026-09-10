import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ShoppingBag } from "lucide-react";
import { fetchMarketplaceReceivablesCurrent, saveMarketplaceReceivables } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { MarketplacePlatform, MarketplaceReceivableResult } from "../types";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function MarketplaceReceivablesPage() {
  const [entryDate, setEntryDate] = useState(todayDate());
  const [platforms, setPlatforms] = useState<MarketplacePlatform[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketplaceReceivableResult | null>(null);

  function loadCurrent() {
    setIsLoading(true);
    setLoadError(null);

    fetchMarketplaceReceivablesCurrent()
      .then((data) => setPlatforms(data.platforms))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Gagal memuat saldo piutang saat ini."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadCurrent();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setResult(null);
    setIsSaving(true);

    try {
      const data = await saveMarketplaceReceivables({
        entry_date: entryDate,
        ...inputs
      });
      setResult(data);
      setInputs({});
      loadCurrent();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Gagal menyimpan pembaruan piutang.");
    } finally {
      setIsSaving(false);
    }
  }

  const hasAnyInput = Object.values(inputs).some((value) => value.trim() !== "");

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <ShoppingBag size={18} className="text-brand" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-ink">Update Piutang Marketplace</h3>
            <p className="text-xs text-slate-500">
              Isi saldo yang tampil di dashboard tiap marketplace hari ini. Selisih terhadap saldo di buku akan dihitung
              dan dijurnal otomatis.
            </p>
          </div>
        </div>

        {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Memuat saldo saat ini...</p>}

        {loadError && (
          <div className="mx-4 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{loadError}</div>
        )}

        {!isLoading && !loadError && (
          <form className="space-y-5 px-4 py-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="entry_date">
                Tanggal
              </label>
              <input
                id="entry_date"
                type="date"
                required
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                className="w-full max-w-xs rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {platforms.map((platform) => (
                <div key={platform.key} className="rounded-md border border-line p-4">
                  <p className="text-sm font-semibold text-ink">{platform.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{platform.dashboard_hint}</p>

                  <p className="mt-3 text-xs text-slate-500">
                    Saldo di buku saat ini:{" "}
                    <span className="font-medium text-ink">
                      {platform.current_balance !== null ? formatCurrency(platform.current_balance) : "—"}
                    </span>
                  </p>

                  <label className="mt-3 block text-xs font-medium text-slate-600" htmlFor={`input-${platform.key}`}>
                    Saldo dashboard hari ini (kosongkan kalau tidak mau update)
                  </label>
                  <input
                    id={`input-${platform.key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={inputs[platform.key] ?? ""}
                    onChange={(event) =>
                      setInputs((prev) => ({
                        ...prev,
                        [platform.key]: event.target.value
                      }))
                    }
                    disabled={platform.account_id === null}
                    className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  />

                  {platform.account_id === null && (
                    <p className="mt-1 text-xs text-danger">
                      Akun {platform.account_code} belum dibuat di Chart of Accounts.
                    </p>
                  )}
                </div>
              ))}
            </div>

            {saveError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{saveError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving || !hasAnyInput}
              className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Menyimpan..." : "Simpan & Posting Jurnal"}
            </button>
          </form>
        )}
      </section>

      {result && (
        <section className="rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ink">
              {result.journal ? `Jurnal ${result.journal.reference_no} berhasil diposting` : "Tidak ada perubahan"}
            </h3>
          </div>

          {result.message && <p className="mb-3 text-sm text-slate-600">{result.message}</p>}

          {result.breakdown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Platform</th>
                    <th className="px-3 py-2 text-right">Saldo Lama</th>
                    <th className="px-3 py-2 text-right">Saldo Baru</th>
                    <th className="px-3 py-2 text-right">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {result.breakdown.map((row) => (
                    <tr key={row.platform_key} className="border-t border-line">
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.previous_balance)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.latest_balance)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${row.delta >= 0 ? "text-emerald-700" : "text-danger"}`}>
                        {row.delta >= 0 ? "+" : ""}
                        {formatCurrency(row.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
