import { useEffect, useState } from "react";
import { AlertCircle, Banknote, CheckCircle2 } from "lucide-react";
import { fetchMarketplaceWithdrawalsForm, saveMarketplaceWithdrawal } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { MarketplaceDestinationAccount, MarketplacePlatform, MarketplaceWithdrawalResult } from "../types";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function MarketplaceWithdrawalsPage() {
  const [entryDate, setEntryDate] = useState(todayDate());
  const [platforms, setPlatforms] = useState<MarketplacePlatform[]>([]);
  const [destinationAccounts, setDestinationAccounts] = useState<MarketplaceDestinationAccount[]>([]);
  const [platformKey, setPlatformKey] = useState("");
  const [amount, setAmount] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketplaceWithdrawalResult | null>(null);

  function loadForm() {
    setIsLoading(true);
    setLoadError(null);

    fetchMarketplaceWithdrawalsForm()
      .then((data) => {
        setPlatforms(data.platforms);
        setDestinationAccounts(data.destination_accounts);
        setPlatformKey((current) => current || data.platforms[0]?.key || "");
        setDestinationAccountId((current) => current || String(data.destination_accounts[0]?.id ?? ""));
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Gagal memuat data."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadForm();
  }, []);

  const selectedPlatform = platforms.find((platform) => platform.key === platformKey) ?? null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setResult(null);

    if (!platformKey || !amount || !destinationAccountId) {
      setSaveError("Lengkapi semua field dulu.");
      return;
    }

    setIsSaving(true);

    try {
      const data = await saveMarketplaceWithdrawal({
        entry_date: entryDate,
        platform_key: platformKey,
        amount,
        destination_account_id: destinationAccountId
      });
      setResult(data);
      setAmount("");
      loadForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Gagal menyimpan penarikan dana.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Banknote size={18} className="text-brand" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-ink">Penarikan Dana Marketplace</h3>
            <p className="text-xs text-slate-500">
              Catat setiap kali dana dari TikTok Shop atau Shopee sudah cair ke rekening. Pendapatan baru masuk ke
              Laba Rugi saat ini dicatat, bukan saat piutang diinput.
            </p>
          </div>
        </div>

        {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Memuat data...</p>}

        {loadError && (
          <div className="mx-4 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{loadError}</div>
        )}

        {!isLoading && !loadError && (
          <form className="space-y-5 px-4 py-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="entry_date">
                  Tanggal Cair
                </label>
                <input
                  id="entry_date"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="platform_key">
                  Platform
                </label>
                <select
                  id="platform_key"
                  required
                  value={platformKey}
                  onChange={(event) => setPlatformKey(event.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  {platforms.map((platform) => (
                    <option key={platform.key} value={platform.key}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedPlatform && (
              <p className="text-xs text-slate-500">
                Saldo piutang {selectedPlatform.label} saat ini di buku:{" "}
                <span className="font-medium text-ink">
                  {selectedPlatform.current_balance !== null ? formatCurrency(selectedPlatform.current_balance) : "—"}
                </span>
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="amount">
                  Jumlah Dana Cair
                </label>
                <input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required
                  placeholder="0"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">Sesuai nominal yang benar-benar masuk ke rekening.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="destination_account_id">
                  Cair ke Akun
                </label>
                <select
                  id="destination_account_id"
                  required
                  value={destinationAccountId}
                  onChange={(event) => setDestinationAccountId(event.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  {destinationAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_code} — {account.account_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{saveError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Menyimpan..." : "Catat Penarikan Dana"}
            </button>
          </form>
        )}
      </section>

      {result && (
        <section className="rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ink">
              Jurnal {result.journal.reference_no} berhasil diposting
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Akun</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {result.journal.lines.map((line) => (
                  <tr key={line.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      {line.account_code} — {line.account_name}
                      {line.memo && <span className="block text-xs text-slate-500">{line.memo}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{line.debit ? formatCurrency(line.debit) : "—"}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? formatCurrency(line.credit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
