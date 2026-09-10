import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { downloadAccountLedgerExport, fetchAccountTransactions } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { ExportButtons } from "./ExportButtons";
import type { AccountTransaction, AccountTransactionsMeta } from "../types";

export function AccountDetailModal({
  accountId,
  accountCode,
  accountName,
  startDate,
  endDate,
  periodLabel,
  onClose
}: {
  accountId: string | number;
  accountCode: string;
  accountName: string;
  startDate: string;
  endDate: string;
  /** Override tampilan label periode di header modal (mis. saat startDate hanya penanda teknis, bukan tanggal nyata). */
  periodLabel?: string;
  onClose: () => void;
}) {
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [meta, setMeta] = useState<AccountTransactionsMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetchAccountTransactions(accountId, startDate, endDate)
      .then((result) => {
        setTransactions(result.data);
        setMeta(result.meta);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat rincian transaksi.");
      })
      .finally(() => setIsLoading(false));
  }, [accountId, startDate, endDate]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{accountCode}</p>
            <h3 className="text-base font-bold text-ink">{accountName}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{periodLabel ?? `Periode ${startDate} s/d ${endDate}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && !error && (
              <ExportButtons onExport={(format) => downloadAccountLedgerExport(accountId, format, startDate, endDate)} />
            )}
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-panel hover:text-ink"
              onClick={onClose}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {isLoading && <p className="py-6 text-center text-sm text-slate-500">Memuat rincian transaksi...</p>}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>
          )}

          {!isLoading && !error && (
            <>
              {meta && (
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-panel px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Debit</p>
                    <p className="text-sm font-bold text-ink">{formatCurrency(meta.total_debit)}</p>
                  </div>
                  <div className="rounded-md bg-panel px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Kredit</p>
                    <p className="text-sm font-bold text-ink">{formatCurrency(meta.total_credit)}</p>
                  </div>
                  <div className="rounded-md bg-teal-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-brand">Saldo Akhir</p>
                    <p className="text-sm font-bold text-brand">{formatCurrency(meta.ending_balance)}</p>
                  </div>
                </div>
              )}

              {transactions.length === 0 ? (
                <p className="rounded-md bg-panel px-3 py-6 text-center text-sm text-slate-400">
                  Tidak ada transaksi pada periode ini.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-panel text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Tanggal</th>
                        <th className="px-3 py-2">Referensi</th>
                        <th className="px-3 py-2">Deskripsi</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Kredit</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((transaction, index) => (
                        <tr
                          className={`border-t border-line ${index % 2 === 1 ? "bg-panel/40" : ""}`}
                          key={`${transaction.journal_entry_id}-${transaction.entry_date}`}
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{transaction.entry_date}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {transaction.reference_no ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-ink">{transaction.description}</p>
                            {transaction.memo && <p className="text-xs text-slate-500">{transaction.memo}</p>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink">
                            {transaction.debit > 0 ? formatCurrency(transaction.debit) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink">
                            {transaction.credit > 0 ? formatCurrency(transaction.credit) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-ink">
                            {formatCurrency(transaction.running_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
