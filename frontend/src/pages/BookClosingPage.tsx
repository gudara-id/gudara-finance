import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, LockOpen, ShieldAlert } from "lucide-react";
import type { AuthUser, BookClosingStatus } from "../types";
import { closeBookPeriod, fetchBookClosingStatus, reopenBookPeriod } from "../lib/api";

export function BookClosingPage({ user }: { user: AuthUser }) {
  const [status, setStatus] = useState<BookClosingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);

  const isAdmin = user.role === "admin";

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchBookClosingStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat status tutup buku.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClose() {
    if (!status?.next_to_close) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await closeBookPeriod(status.next_to_close, notes.trim() || undefined);
      setStatus(data);
      setNotes("");
      setConfirmStep(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menutup buku.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReopen(periodMonth: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await reopenBookPeriod(periodMonth);
      setStatus(data);
      setReopenTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuka kembali periode.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="text-sm text-slate-600">Memuat status tutup buku...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {status?.needs_closing_reminder && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Periode {status.next_to_close_label} belum ditutup</p>
            <p className="mt-0.5 text-amber-700">
              Sudah masuk bulan berikutnya. Pastikan semua transaksi periode itu sudah lengkap sebelum menutup
              bukunya.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-base font-bold text-ink">
          <Lock size={18} aria-hidden="true" />
          Tutup Buku
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Mengunci semua transaksi (jurnal umum, invoice, tagihan, pembayaran) pada periode yang dipilih. Setelah
          ditutup, transaksi di periode itu (dan sebelumnya) tidak bisa lagi dibuat, diubah, dihapus, atau
          dibatalkan.
        </p>

        {!status?.next_to_close && (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Belum ada transaksi jurnal yang bisa ditutup bukunya.
          </p>
        )}

        {status?.next_to_close && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Periode berikutnya yang ditutup</p>
                <p className="text-lg font-bold text-ink">{status.next_to_close_label}</p>
              </div>

              {isAdmin ? (
                !confirmStep ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                    onClick={() => setConfirmStep(true)}
                    disabled={status.next_to_close >= status.current_month}
                  >
                    <Lock size={16} aria-hidden="true" />
                    Tutup Buku {status.next_to_close_label}
                  </button>
                ) : null
              ) : (
                <span className="text-xs text-slate-500">Hanya admin yang bisa menutup buku.</span>
              )}
            </div>

            {status.next_to_close >= status.current_month && (
              <p className="mt-2 text-xs text-slate-500">
                Periode ini masih berjalan (atau bulan depan) — belum bisa ditutup.
              </p>
            )}

            {confirmStep && (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Tindakan ini mengunci seluruh transaksi periode {status.next_to_close_label} dan sebelumnya.
                    Pastikan semua jurnal, invoice, dan tagihan bulan itu sudah benar sebelum melanjutkan.
                  </span>
                </div>

                <label className="block text-sm">
                  <span className="font-semibold text-slate-700">Catatan (opsional)</span>
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Mis. sudah dicocokkan dengan rekening koran per 1 September"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    <Lock size={16} aria-hidden="true" />
                    {isSubmitting ? "Menutup..." : `Ya, Tutup Buku ${status.next_to_close_label}`}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    onClick={() => setConfirmStep(false)}
                    disabled={isSubmitting}
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-base font-bold text-ink">
          <CheckCircle2 size={18} aria-hidden="true" />
          Riwayat Periode Tertutup
        </div>

        {!status || status.closed_periods.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Belum ada periode yang ditutup.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {status.closed_periods.map((period, index) => {
              const isLatest = index === 0;
              return (
                <div key={period.period_month} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-ink">{period.period_label}</p>
                    <p className="text-xs text-slate-500">
                      Ditutup {new Date(period.closed_at).toLocaleString("id-ID")}
                      {period.closed_by_name ? ` oleh ${period.closed_by_name}` : ""}
                    </p>
                    {period.notes && <p className="mt-1 text-xs text-slate-500">Catatan: {period.notes}</p>}
                  </div>

                  {isAdmin && isLatest && (
                    <div>
                      {reopenTarget === period.period_month ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                            onClick={() => handleReopen(period.period_month)}
                            disabled={isSubmitting}
                          >
                            Ya, buka kembali
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            onClick={() => setReopenTarget(null)}
                            disabled={isSubmitting}
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          onClick={() => setReopenTarget(period.period_month)}
                        >
                          <LockOpen size={14} aria-hidden="true" />
                          Buka kembali
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
