import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText as FileIcon,
  ListFilter,
  Loader2,
  Pencil,
  Plus,
  Save,
  ScrollText,
  Search,
  Tag as TagIcon,
  Trash2,
  X
} from "lucide-react";
import {
  createJournal,
  deleteJournal,
  downloadJournalsExport,
  fetchAccounts,
  fetchJournalById,
  fetchJournalTags,
  fetchJournals,
  updateJournal,
  voidJournal
} from "../lib/api";
import type { ExportFormat } from "../lib/api";
import type {
  Account,
  JournalEntryDetail,
  JournalEntrySummary,
  JournalLine,
  JournalListMeta
} from "../types";

const emptyLine = (): JournalLine => ({
  account_id: "",
  memo: "",
  debit: "",
  credit: ""
});

function moneyToNumber(value: string) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

// Kode akun yang sengaja tidak boleh diisi manual di sini kalau tujuannya
// mencatat piutang/pencairan marketplace — supaya pendapatan tidak
// diakui sebelum dananya benar-benar cair. Lihat menu Marketplace.
const MARKETPLACE_HINT_ACCOUNT_CODES: Record<string, string> = {
  "4011": "Ini akun pendapatan marketplace. Kalau ini untuk mencatat piutang atau pencairan dana marketplace, gunakan menu Marketplace, bukan input manual — supaya pendapatan hanya diakui saat dana benar-benar cair.",
  "2040": "Ini akun Pendapatan Diterima Dimuka. Kalau ini untuk piutang marketplace yang belum cair, gunakan menu Marketplace supaya perhitungannya konsisten dengan Laba Rugi."
};

function getAccountHint(accounts: Account[], accountId: string) {
  const account = accounts.find((item) => String(item.id) === String(accountId));
  if (!account) return null;
  return MARKETPLACE_HINT_ACCOUNT_CODES[account.account_code] ?? null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateID(value: string) {
  try {
    return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

const statusBadgeClass: Record<string, string> = {
  posted: "bg-emerald-50 text-emerald-700",
  draft: "bg-amber-50 text-amber-700",
  void: "bg-slate-100 text-slate-500"
};

const statusLabel: Record<string, string> = {
  posted: "Posted",
  draft: "Draft",
  void: "Void"
};

/* ------------------------------------------------------------------ */
/* Tag input (chip)                                                    */
/* ------------------------------------------------------------------ */

function TagChipInput({
  value,
  onChange,
  suggestions
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function addTag(rawTag: string) {
    const tag = rawTag.trim();
    if (!tag) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    if (value.length >= 10) return;
    onChange([...value, tag]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((existing) => existing !== tag));
  }

  const filteredSuggestions = suggestions
    .filter((tag) => !value.some((existing) => existing.toLowerCase() === tag.toLowerCase()))
    .filter((tag) => (draft ? tag.toLowerCase().includes(draft.toLowerCase()) : true))
    .slice(0, 8);

  return (
    <div className="relative">
      <div className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-md border border-line px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-teal-100">
        {value.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-brand"
            key={tag}
          >
            <TagIcon size={11} aria-hidden="true" />
            {tag}
            <button className="text-brand/60 hover:text-brand" onClick={() => removeTag(tag)} type="button">
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          className="h-7 min-w-[100px] flex-1 border-none px-1 text-sm outline-none"
          onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(draft);
            } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? "Ketik tag lalu Enter (mis. Proyek A)" : ""}
          value={draft}
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-white py-1 shadow-lg">
          {filteredSuggestions.map((tag) => (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-panel"
              key={tag}
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(tag);
              }}
              type="button"
            >
              <TagIcon size={12} className="text-slate-400" aria-hidden="true" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel form Buat/Edit Jurnal Umum (slide-over)                       */
/* ------------------------------------------------------------------ */

type JournalFormPanelProps = {
  mode: "create" | "edit";
  entryId?: number;
  entry?: JournalEntryDetail | null;
  isLoading?: boolean;
  loadError?: string | null;
  accounts: Account[];
  tagSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
};

function JournalFormPanel({
  mode,
  entryId,
  entry,
  isLoading,
  loadError,
  accounts,
  tagSuggestions,
  onClose,
  onSaved
}: JournalFormPanelProps) {
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !entry) return;

    setEntryDate(entry.entry_date.slice(0, 10));
    setReferenceNo(entry.reference_no ?? "");
    setDescription(entry.description);
    setTags(entry.tags ?? []);
    setLines(
      entry.lines.map((line) => ({
        account_id: String(line.account_id),
        memo: line.memo ?? "",
        debit: Number(line.debit) > 0 ? String(line.debit) : "",
        credit: Number(line.credit) > 0 ? String(line.credit) : ""
      }))
    );
  }, [mode, entry]);

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + moneyToNumber(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + moneyToNumber(line.credit), 0);
    const difference = Math.round((debit - credit + Number.EPSILON) * 100) / 100;

    return {
      debit,
      credit,
      difference,
      isBalanced: debit > 0 && credit > 0 && difference === 0
    };
  }, [lines]);

  const validationMessages = useMemo(() => {
    const messages: string[] = [];

    if (!entryDate) messages.push("Tanggal wajib diisi.");
    if (description.trim().length === 0) messages.push("Deskripsi wajib diisi.");
    if (lines.length < 2) messages.push("Minimal 2 baris jurnal diperlukan.");
    if (lines.some((line) => !line.account_id)) messages.push("Setiap baris harus memilih akun.");
    if (lines.some((line) => line.account_id && moneyToNumber(line.debit) === 0 && moneyToNumber(line.credit) === 0)) {
      messages.push("Setiap baris harus memiliki nilai Debit atau Kredit lebih dari 0.");
    }
    if (!totals.isBalanced) messages.push("Total Debit dan Kredit harus sama (balance).");

    return messages;
  }, [entryDate, description, lines, totals.isBalanced]);

  const formReady = mode === "create" || (!isLoading && !loadError && entry);
  const canSubmit = formReady && validationMessages.length === 0 && !isSubmitting;

  function updateLine(index: number, patch: Partial<JournalLine>) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        const next = { ...line, ...patch };

        if (patch.debit && moneyToNumber(patch.debit) > 0) {
          next.credit = "";
        }

        if (patch.credit && moneyToNumber(patch.credit) > 0) {
          next.debit = "";
        }

        return next;
      })
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((current) => (current.length <= 2 ? current : current.filter((_, lineIndex) => lineIndex !== index)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "create") {
        await createJournal({
          entry_date: entryDate,
          reference_no: referenceNo.trim() || undefined,
          description,
          tags,
          lines
        });
      } else if (entryId) {
        await updateJournal(entryId, {
          entry_date: entryDate,
          reference_no: referenceNo.trim() || undefined,
          description,
          tags,
          lines
        });
      }

      onSaved();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Gagal menyimpan jurnal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <ScrollText size={18} className="text-brand" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ink">
              {mode === "create" ? "Buat Jurnal Umum" : "Edit Jurnal Umum"}
            </h3>
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {mode === "edit" && isLoading && <p className="px-5 py-8 text-sm text-slate-500">Memuat detail jurnal...</p>}
          {mode === "edit" && loadError && (
            <div className="mx-5 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{loadError}</div>
          )}

          {formReady && (
            <form className="space-y-5 px-5 py-5" id="journal-form" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Tanggal</span>
                  <input
                    className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setEntryDate(event.target.value)}
                    type="date"
                    value={entryDate}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">No Transaksi</span>
                  <input
                    className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setReferenceNo(event.target.value)}
                    placeholder="Otomatis (mis. JV-202608-001)"
                    value={referenceNo}
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Deskripsi <span className="text-danger">*</span>
                </span>
                <input
                  className={[
                    "mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100",
                    description.trim().length === 0 ? "border-red-300 bg-red-50" : "border-line"
                  ].join(" ")}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Keterangan transaksi (wajib diisi)"
                  value={description}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tag</span>
                <div className="mt-1">
                  <TagChipInput onChange={setTags} suggestions={tagSuggestions} value={tags} />
                </div>
                <span className="mt-1 block text-xs text-slate-500">
                  Untuk filter laporan per proyek/cabang/divisi. Opsional.
                </span>
              </label>

              <div>
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <h4 className="text-sm font-semibold text-ink">Detail Debit/Kredit</h4>
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={addLine}
                    type="button"
                  >
                    <Plus size={15} aria-hidden="true" />
                    Tambah Baris
                  </button>
                </div>

                <div className="mt-2 space-y-3">
                  {lines.map((line, index) => (
                    <div className="rounded-md border border-line p-3" key={index}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase text-slate-400">Baris {index + 1}</span>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={lines.length <= 2}
                          onClick={() => removeLine(index)}
                          title="Hapus baris"
                          type="button"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-2 space-y-2">
                        <select
                          className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                          onChange={(event) => updateLine(index, { account_id: event.target.value })}
                          value={line.account_id}
                        >
                          <option value="">Pilih akun</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.account_code} - {account.account_name}
                            </option>
                          ))}
                        </select>
                        {getAccountHint(accounts, line.account_id) && (
                          <p className="text-xs text-amber-700">{getAccountHint(accounts, line.account_id)}</p>
                        )}

                        <input
                          className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                          onChange={(event) => updateLine(index, { memo: event.target.value })}
                          placeholder="Memo baris (opsional)"
                          value={line.memo}
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-xs text-slate-500">Debit</span>
                            <input
                              className="mt-0.5 h-10 w-full rounded-md border border-line px-3 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                              min="0"
                              onChange={(event) => updateLine(index, { debit: event.target.value })}
                              placeholder="0"
                              step="0.01"
                              type="number"
                              value={line.debit}
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs text-slate-500">Kredit</span>
                            <input
                              className="mt-0.5 h-10 w-full rounded-md border border-line px-3 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                              min="0"
                              onChange={(event) => updateLine(index, { credit: event.target.value })}
                              placeholder="0"
                              step="0.01"
                              type="number"
                              value={line.credit}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-line bg-panel px-3 py-3 sm:grid-cols-4">
                  <SummaryBox label="Total Debit" value={formatCurrency(totals.debit)} />
                  <SummaryBox label="Total Kredit" value={formatCurrency(totals.credit)} />
                  <SummaryBox label="Selisih" value={formatCurrency(Math.abs(totals.difference))} />
                  <div
                    className={[
                      "flex min-h-14 items-center gap-2 rounded-md border px-3",
                      totals.isBalanced
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-danger"
                    ].join(" ")}
                  >
                    {totals.isBalanced ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                    <p className="text-xs font-medium">{totals.isBalanced ? "Balance" : "Belum balance"}</p>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{submitError}</div>
              )}

              {validationMessages.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <ul className="list-inside list-disc space-y-0.5">
                    {validationMessages.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button
            className="h-11 rounded-md border border-line px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Batal
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canSubmit}
            form="journal-form"
            type="submit"
          >
            <Save size={18} aria-hidden="true" />
            {isSubmitting ? "Menyimpan..." : mode === "create" ? "Buat Jurnal Umum" : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-14 rounded-md border border-line bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel filter (slide-over dari kanan, ala "Filter Lebih Lanjut")     */
/* ------------------------------------------------------------------ */

function FilterPanel({
  startDate,
  endDate,
  tag,
  tagSuggestions,
  onApply,
  onClose
}: {
  startDate: string;
  endDate: string;
  tag: string;
  tagSuggestions: string[];
  onApply: (next: { startDate: string; endDate: string; tag: string }) => void;
  onClose: () => void;
}) {
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [draftTag, setDraftTag] = useState(tag);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
      <div className="flex h-full w-full max-w-sm flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Filter Lebih Lanjut</h3>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <span className="text-sm font-medium text-slate-700">Tanggal Mulai</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setDraftStart(event.target.value)}
              type="date"
              value={draftStart}
            />
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700">Tanggal Selesai</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setDraftEnd(event.target.value)}
              type="date"
              value={draftEnd}
            />
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700">Tag</span>
            <select
              className="mt-1 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setDraftTag(event.target.value)}
              value={draftTag}
            >
              <option value="">Semua tag</option>
              {tagSuggestions.map((tagOption) => (
                <option key={tagOption} value={tagOption}>
                  {tagOption}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-between gap-2 border-t border-line px-5 py-4">
          <button
            className="h-11 rounded-md px-3 text-sm font-medium text-brand hover:underline"
            onClick={() => {
              setDraftStart("");
              setDraftEnd("");
              setDraftTag("");
              onApply({ startDate: "", endDate: "", tag: "" });
            }}
            type="button"
          >
            Reset filter
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            onClick={() => onApply({ startDate: draftStart, endDate: draftEnd, tag: draftTag })}
            type="button"
          >
            Filter
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman utama                                                       */
/* ------------------------------------------------------------------ */

export function JournalEntryPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntryDetail | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    fetchAccounts()
      .then(setAccounts)
      .catch(() => {
        /* form akan menampilkan pesan sendiri kalau akun gagal dimuat */
      });
    refreshTagSuggestions();
  }, []);

  function refreshTagSuggestions() {
    fetchJournalTags()
      .then(setTagSuggestions)
      .catch(() => {
        /* autocomplete tag opsional, biarkan diam kalau gagal */
      });
  }

  function openEditPanel(id: number) {
    setEditingEntryId(id);
    setEditingEntry(null);
    setEditLoadError(null);
    setIsEditLoading(true);

    fetchJournalById(id)
      .then(setEditingEntry)
      .catch((fetchError) => {
        setEditLoadError(fetchError instanceof Error ? fetchError.message : "Gagal memuat detail jurnal.");
      })
      .finally(() => setIsEditLoading(false));
  }

  function closeEditPanel() {
    setEditingEntryId(null);
    setEditingEntry(null);
    setEditLoadError(null);
  }

  function handleFormSaved() {
    setIsCreateOpen(false);
    closeEditPanel();
    setHistoryRefreshKey((key) => key + 1);
    refreshTagSuggestions();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Jurnal Umum</h2>
          <p className="text-sm text-slate-500">Catat transaksi yang tidak tercakup di menu transaksi lainnya.</p>
        </div>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          onClick={() => setIsCreateOpen(true)}
          type="button"
        >
          <Plus size={18} aria-hidden="true" />
          Buat Jurnal Umum
        </button>
      </div>

      <JournalHistorySection
        onEditEntry={openEditPanel}
        refreshKey={historyRefreshKey}
        tagSuggestions={tagSuggestions}
      />

      {isCreateOpen && (
        <JournalFormPanel
          accounts={accounts}
          mode="create"
          onClose={() => setIsCreateOpen(false)}
          onSaved={handleFormSaved}
          tagSuggestions={tagSuggestions}
        />
      )}

      {editingEntryId !== null && (
        <JournalFormPanel
          accounts={accounts}
          entry={editingEntry}
          entryId={editingEntryId}
          isLoading={isEditLoading}
          loadError={editLoadError}
          mode="edit"
          onClose={closeEditPanel}
          onSaved={handleFormSaved}
          tagSuggestions={tagSuggestions}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Riwayat / Daftar Transaksi Jurnal                                   */
/* ------------------------------------------------------------------ */

function JournalHistorySection({
  refreshKey,
  tagSuggestions,
  onEditEntry
}: {
  refreshKey: number;
  tagSuggestions: string[];
  onEditEntry: (id: number) => void;
}) {
  const [entries, setEntries] = useState<JournalEntrySummary[]>([]);
  const [meta, setMeta] = useState<JournalListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tag, setTag] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [localReloadKey, setLocalReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);

  const pageSize = 25;
  const activeFilterCount = [startDate, endDate, tag].filter(Boolean).length;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchJournals({
      page,
      pageSize,
      search: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      tag: tag || undefined
    })
      .then((result) => {
        if (cancelled) return;
        setEntries(result.data);
        setMeta(result.meta);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat riwayat jurnal.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, search, startDate, endDate, tag, refreshKey, localReloadKey]);

  async function handleVoid(entry: JournalEntrySummary) {
    const reason = window.prompt(
      `Batalkan jurnal ${entry.reference_no ?? entry.id}?\n\nJurnal yang dibatalkan (void) tidak akan lagi masuk ke laporan (Laba Rugi, Neraca, dll), tapi datanya tetap tersimpan untuk jejak audit.\n\nAlasan pembatalan (opsional):`,
      ""
    );

    if (reason === null) return; // user pressed Cancel on the prompt

    const id = Number(entry.id);
    setActionError(null);
    setPendingActionId(id);

    try {
      await voidJournal(id, reason.trim() || undefined);
      setLocalReloadKey((key) => key + 1);
    } catch (voidError) {
      setActionError(voidError instanceof Error ? voidError.message : "Gagal membatalkan jurnal.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDelete(entry: JournalEntrySummary) {
    const confirmed = window.confirm(
      `Hapus permanen jurnal ${entry.reference_no ?? entry.id}?\n\nTindakan ini TIDAK BISA dibatalkan dan akan menghapus seluruh baris debit/kreditnya. Kalau hanya ingin mengeluarkannya dari laporan tapi tetap menyimpan riwayatnya, gunakan tombol Batalkan (void) saja.`
    );

    if (!confirmed) return;

    const id = Number(entry.id);
    setActionError(null);
    setPendingActionId(id);

    try {
      await deleteJournal(id);
      setLocalReloadKey((key) => key + 1);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus jurnal.");
    } finally {
      setPendingActionId(null);
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function toggleSelectOne(id: number, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const entry of entries) {
        const id = Number(entry.id);
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const allOnPageSelected = entries.length > 0 && entries.every((entry) => selectedIds.has(Number(entry.id)));

  async function handleExport(format: ExportFormat) {
    setExportingFormat(format);
    setExportError(null);

    try {
      await downloadJournalsExport(format, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined
      });
    } catch (downloadError) {
      setExportError(downloadError instanceof Error ? downloadError.message : "Gagal mengunduh jurnal.");
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleExportSelected(format: ExportFormat) {
    if (selectedIds.size === 0) return;

    setExportingFormat(format);
    setExportError(null);

    try {
      await downloadJournalsExport(format, { ids: Array.from(selectedIds) });
    } catch (downloadError) {
      setExportError(downloadError instanceof Error ? downloadError.message : "Gagal mengunduh jurnal terpilih.");
    } finally {
      setExportingFormat(null);
    }
  }

  const totalPages = meta?.total_pages ?? 0;

  return (
    <section className="rounded-md border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ListFilter size={18} className="text-brand" aria-hidden="true" />
          <h3 className="text-base font-semibold text-ink">Daftar Transaksi Jurnal</h3>
        </div>
        <div className="flex items-center gap-3">
          {meta && <span className="text-xs text-slate-500">{meta.total} transaksi</span>}
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={exportingFormat !== null}
              onClick={() => handleExport("xlsx")}
              type="button"
            >
              {exportingFormat === "xlsx" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet size={16} aria-hidden="true" />
              )}
              Excel
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={exportingFormat !== null}
              onClick={() => handleExport("pdf")}
              title="Export seluruh transaksi sesuai filter yang aktif"
              type="button"
            >
              {exportingFormat === "pdf" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <FileIcon size={16} aria-hidden="true" />
              )}
              PDF
            </button>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-teal-50/60 px-4 py-2.5">
          <span className="text-sm font-medium text-teal-800">{selectedIds.size} transaksi dipilih</span>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-200 bg-white px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={exportingFormat !== null}
              onClick={() => handleExportSelected("xlsx")}
              type="button"
            >
              {exportingFormat === "xlsx" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet size={16} aria-hidden="true" />
              )}
              Export Terpilih (Excel)
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-200 bg-white px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={exportingFormat !== null}
              onClick={() => handleExportSelected("pdf")}
              type="button"
            >
              {exportingFormat === "pdf" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <FileIcon size={16} aria-hidden="true" />
              )}
              Export Terpilih (PDF)
            </button>
            <button
              className="h-9 rounded-md px-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              onClick={clearSelection}
              type="button"
            >
              Batal pilih
            </button>
          </div>
        </div>
      )}

      {exportError && (
        <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-danger">{exportError}</div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <form className="flex items-center gap-2" onSubmit={handleSearchSubmit}>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              className="h-10 w-56 rounded-md border border-line pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari deskripsi / No Transaksi"
              value={searchInput}
            />
          </div>
          <button
            className="h-10 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-white"
            type="submit"
          >
            Cari
          </button>
        </form>

        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 hover:bg-panel"
          onClick={() => setIsFilterOpen(true)}
          type="button"
        >
          <ListFilter size={15} aria-hidden="true" />
          Filter Lebih Lanjut
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            className="h-10 rounded-md px-3 text-sm font-medium text-brand hover:underline"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setTag("");
              setPage(1);
            }}
            type="button"
          >
            Reset filter
          </button>
        )}
      </div>

      {(startDate || endDate || tag) && (
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
          {startDate && (
            <FilterChip label={`Dari ${formatDateID(startDate)}`} onRemove={() => setStartDate("")} />
          )}
          {endDate && <FilterChip label={`Sampai ${formatDateID(endDate)}`} onRemove={() => setEndDate("")} />}
          {tag && <FilterChip label={`Tag: ${tag}`} onRemove={() => setTag("")} />}
        </div>
      )}

      {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Memuat riwayat jurnal...</p>}
      {error && <div className="mx-4 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}
      {actionError && (
        <div className="mx-4 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{actionError}</div>
      )}

      {!isLoading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="bg-panel text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    aria-label="Pilih semua di halaman ini"
                    checked={allOnPageSelected}
                    className="h-4 w-4 rounded border-line accent-brand"
                    onChange={(event) => toggleSelectAllOnPage(event.target.checked)}
                    type="checkbox"
                  />
                </th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">No Transaksi</th>
                <th className="px-4 py-3">Deskripsi / Tag</th>
                <th className="px-4 py-3">Akun Debit</th>
                <th className="px-4 py-3">Akun Kredit</th>
                <th className="px-4 py-3 text-right">Nominal</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                    Belum ada transaksi jurnal.
                  </td>
                </tr>
              )}

              {entries.map((entry) => {
                const id = Number(entry.id);
                const isSelected = selectedIds.has(id);
                const isVoid = entry.status === "void";

                return (
                  <tr
                    className={`border-t border-line transition hover:bg-panel ${isSelected ? "bg-teal-50/40 hover:bg-teal-50/60" : ""}`}
                    key={entry.id}
                  >
                    <td className="px-4 py-3">
                      <input
                        aria-label={`Pilih transaksi ${entry.reference_no ?? entry.id}`}
                        checked={isSelected}
                        className="h-4 w-4 rounded border-line accent-brand"
                        onChange={(event) => toggleSelectOne(id, event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateID(entry.entry_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{entry.reference_no ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p>{entry.description}</p>
                      {entry.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {entry.tags.map((entryTag) => (
                            <button
                              className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-brand hover:bg-teal-100"
                              key={entryTag}
                              onClick={() => setTag(entryTag)}
                              type="button"
                            >
                              <TagIcon size={9} aria-hidden="true" />
                              {entryTag}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{entry.debit_accounts}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.credit_accounts}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink">
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[entry.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {statusLabel[entry.status] ?? entry.status}
                        </span>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-teal-50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          disabled={isVoid || pendingActionId === id}
                          onClick={() => onEditEntry(id)}
                          title={isVoid ? "Jurnal void tidak dapat diedit" : "Edit jurnal"}
                          type="button"
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          disabled={isVoid || pendingActionId === id}
                          onClick={() => handleVoid(entry)}
                          title={isVoid ? "Jurnal sudah void" : "Batalkan (void) jurnal"}
                          type="button"
                        >
                          <Ban size={15} aria-hidden="true" />
                        </button>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          disabled={pendingActionId === id}
                          onClick={() => handleDelete(entry)}
                          title="Hapus jurnal secara permanen"
                          type="button"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                      {isVoid && entry.void_reason && (
                        <p className="mt-1 max-w-[220px] text-xs text-slate-400" title={entry.void_reason}>
                          Alasan: {entry.void_reason}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
          <span>
            Halaman {meta.page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-3 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Sebelumnya
            </button>
            <button
              className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-3 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Selanjutnya
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {isFilterOpen && (
        <FilterPanel
          endDate={endDate}
          onApply={(next) => {
            setStartDate(next.startDate);
            setEndDate(next.endDate);
            setTag(next.tag);
            setPage(1);
            setIsFilterOpen(false);
          }}
          onClose={() => setIsFilterOpen(false)}
          startDate={startDate}
          tag={tag}
          tagSuggestions={tagSuggestions}
        />
      )}
    </section>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-slate-600">
      {label}
      <button className="text-slate-400 hover:text-danger" onClick={onRemove} type="button">
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}
