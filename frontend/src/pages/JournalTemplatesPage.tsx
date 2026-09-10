import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Plus,
  Power,
  Repeat,
  Save,
  Tag as TagIcon,
  Trash2,
  X
} from "lucide-react";
import {
  createJournalTemplate,
  deleteJournalTemplate,
  fetchAccounts,
  fetchJournalTags,
  fetchJournalTemplateById,
  fetchJournalTemplates,
  generateJournalFromTemplate,
  setJournalTemplateActive,
  updateJournalTemplate
} from "../lib/api";
import { currentPeriodMonth, periodMonthLabel, shiftPeriodMonth } from "../lib/period";
import type { Account, JournalTemplate, JournalTemplateDetail, JournalTemplateLine } from "../types";

function moneyToNumber(value: string) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2
  }).format(value);
}

const emptyLine = (): JournalTemplateLine => ({ account_id: "", memo: "", debit: "", credit: "" });

/* ------------------------------------------------------------------ */
/* Tag input (chip) — versi ringkas, sama gayanya dengan Jurnal Umum   */
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
          placeholder={value.length === 0 ? "Ketik tag lalu Enter (opsional)" : ""}
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
/* Panel form Buat/Edit Template (slide-over)                          */
/* ------------------------------------------------------------------ */

function TemplateFormPanel({
  mode,
  templateId,
  template,
  isLoading,
  loadError,
  accounts,
  tagSuggestions,
  onClose,
  onSaved
}: {
  mode: "create" | "edit";
  templateId?: number;
  template?: JournalTemplateDetail | null;
  isLoading?: boolean;
  loadError?: string | null;
  accounts: Account[];
  tagSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [lines, setLines] = useState<JournalTemplateLine[]>([emptyLine(), emptyLine()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !template) return;

    setName(template.name);
    setDescription(template.description ?? "");
    setTags(template.tags ?? []);
    setLines(
      template.lines.map((line) => ({
        account_id: String(line.account_id),
        memo: line.memo ?? "",
        debit: Number(line.debit) > 0 ? String(line.debit) : "",
        credit: Number(line.credit) > 0 ? String(line.credit) : ""
      }))
    );
  }, [mode, template]);

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + moneyToNumber(String(line.debit)), 0);
    const credit = lines.reduce((sum, line) => sum + moneyToNumber(String(line.credit)), 0);
    const difference = Math.round((debit - credit + Number.EPSILON) * 100) / 100;
    return { debit, credit, difference, isBalanced: debit > 0 && credit > 0 && difference === 0 };
  }, [lines]);

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (name.trim().length === 0) messages.push("Nama template wajib diisi.");
    if (lines.length < 2) messages.push("Minimal 2 baris jurnal diperlukan.");
    if (lines.some((line) => !line.account_id)) messages.push("Setiap baris harus memilih akun.");
    if (
      lines.some(
        (line) => line.account_id && moneyToNumber(String(line.debit)) === 0 && moneyToNumber(String(line.credit)) === 0
      )
    ) {
      messages.push("Setiap baris harus memiliki nilai Debit atau Kredit lebih dari 0.");
    }
    if (!totals.isBalanced) messages.push("Total Debit dan Kredit harus sama (balance).");
    return messages;
  }, [name, lines, totals.isBalanced]);

  const formReady = mode === "create" || (!isLoading && !loadError && template);
  const canSubmit = formReady && validationMessages.length === 0 && !isSubmitting;

  function updateLine(index: number, patch: Partial<JournalTemplateLine>) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };
        if (patch.debit && moneyToNumber(String(patch.debit)) > 0) next.credit = "";
        if (patch.credit && moneyToNumber(String(patch.credit)) > 0) next.debit = "";
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

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      tags,
      lines
    };

    try {
      if (mode === "create") {
        await createJournalTemplate(payload);
      } else if (templateId) {
        await updateJournalTemplate(templateId, payload);
      }
      onSaved();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Gagal menyimpan template.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Repeat size={18} className="text-brand" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ink">
              {mode === "create" ? "Buat Template Jurnal" : "Edit Template Jurnal"}
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
          {mode === "edit" && isLoading && <p className="px-5 py-8 text-sm text-slate-500">Memuat detail template...</p>}
          {mode === "edit" && loadError && (
            <div className="mx-5 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{loadError}</div>
          )}

          {formReady && (
            <form className="space-y-5 px-5 py-5" id="template-form" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Nama Template <span className="text-danger">*</span>
                </span>
                <input
                  className={[
                    "mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100",
                    name.trim().length === 0 ? "border-red-300 bg-red-50" : "border-line"
                  ].join(" ")}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="mis. Sewa Kantor Bulanan"
                  value={name}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Deskripsi</span>
                <input
                  className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Jadi keterangan jurnal saat digenerate (opsional, default pakai nama template)"
                  value={description}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tag</span>
                <div className="mt-1">
                  <TagChipInput onChange={setTags} suggestions={tagSuggestions} value={tags} />
                </div>
              </label>

              <div>
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <h4 className="text-sm font-semibold text-ink">Detail Debit/Kredit (nominal default)</h4>
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
                          value={String(line.account_id)}
                        >
                          <option value="">Pilih akun</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.account_code} - {account.account_name}
                            </option>
                          ))}
                        </select>

                        <input
                          className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                          onChange={(event) => updateLine(index, { memo: event.target.value })}
                          placeholder="Memo baris (opsional)"
                          value={line.memo ?? ""}
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
                  <div className="min-h-14 rounded-md border border-line bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Total Debit</p>
                    <p className="mt-0.5 text-sm font-bold text-ink">{formatCurrency(totals.debit)}</p>
                  </div>
                  <div className="min-h-14 rounded-md border border-line bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Total Kredit</p>
                    <p className="mt-0.5 text-sm font-bold text-ink">{formatCurrency(totals.credit)}</p>
                  </div>
                  <div className="min-h-14 rounded-md border border-line bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Selisih</p>
                    <p className="mt-0.5 text-sm font-bold text-ink">{formatCurrency(Math.abs(totals.difference))}</p>
                  </div>
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
            form="template-form"
            type="submit"
          >
            <Save size={18} aria-hidden="true" />
            {isSubmitting ? "Menyimpan..." : mode === "create" ? "Simpan Template" : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman utama                                                       */
/* ------------------------------------------------------------------ */

export function JournalTemplatesPage() {
  const [periodMonth, setPeriodMonth] = useState(() => currentPeriodMonth());
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<JournalTemplateDetail | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);

  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateSuccessId, setGenerateSuccessId] = useState<number | null>(null);

  useEffect(() => {
    fetchAccounts()
      .then(setAccounts)
      .catch(() => {});
    refreshTagSuggestions();
  }, []);

  function refreshTagSuggestions() {
    fetchJournalTags()
      .then(setTagSuggestions)
      .catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchJournalTemplates(periodMonth)
      .then((result) => {
        if (cancelled) return;
        setTemplates(result.data);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat template jurnal.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [periodMonth, reloadKey]);

  function openEditPanel(id: number) {
    setEditingId(id);
    setEditingTemplate(null);
    setEditLoadError(null);
    setIsEditLoading(true);

    fetchJournalTemplateById(id)
      .then(setEditingTemplate)
      .catch((fetchError) => {
        setEditLoadError(fetchError instanceof Error ? fetchError.message : "Gagal memuat detail template.");
      })
      .finally(() => setIsEditLoading(false));
  }

  function closeEditPanel() {
    setEditingId(null);
    setEditingTemplate(null);
    setEditLoadError(null);
  }

  function handleFormSaved() {
    setIsCreateOpen(false);
    closeEditPanel();
    setReloadKey((key) => key + 1);
    refreshTagSuggestions();
  }

  async function handleGenerate(template: JournalTemplate) {
    const id = Number(template.id);
    setActionError(null);
    setPendingActionId(id);
    setGenerateSuccessId(null);

    try {
      const entry = await generateJournalFromTemplate(id, { period_month: periodMonth });
      setGenerateSuccessId(id);
      setReloadKey((key) => key + 1);
      void entry;
    } catch (generateError) {
      setActionError(generateError instanceof Error ? generateError.message : "Gagal generate jurnal dari template.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleToggleActive(template: JournalTemplate) {
    const id = Number(template.id);
    setActionError(null);
    setPendingActionId(id);

    try {
      await setJournalTemplateActive(id, !template.is_active);
      setReloadKey((key) => key + 1);
    } catch (toggleError) {
      setActionError(toggleError instanceof Error ? toggleError.message : "Gagal mengubah status template.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDelete(template: JournalTemplate) {
    const confirmed = window.confirm(
      `Hapus template "${template.name}"?\n\nJurnal yang sudah pernah digenerate dari template ini TIDAK ikut terhapus — hanya template dan riwayat generate-nya yang hilang.`
    );
    if (!confirmed) return;

    const id = Number(template.id);
    setActionError(null);
    setPendingActionId(id);

    try {
      await deleteJournalTemplate(id);
      setReloadKey((key) => key + 1);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus template.");
    } finally {
      setPendingActionId(null);
    }
  }

  const activeTemplates = templates.filter((template) => template.is_active);
  const needsGeneration = activeTemplates.filter((template) => !template.generated_this_period);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Template Jurnal Berulang</h2>
          <p className="text-sm text-slate-500">
            Simpan pola jurnal rutin (sewa, gaji, langganan) dan generate satu klik tiap bulan.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            onClick={() => setIsCreateOpen(true)}
            type="button"
          >
            <Plus size={18} aria-hidden="true" />
            Buat Template
          </button>
        </div>
      </div>

      {!isLoading && !error && needsGeneration.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">
              {needsGeneration.length} template belum digenerate untuk {periodMonthLabel(periodMonth)}
            </p>
            <p className="mt-0.5">{needsGeneration.map((t) => t.name).join(", ")}</p>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{actionError}</div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Memuat template jurnal...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

      {!isLoading && !error && templates.length === 0 && (
        <div className="rounded-md border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-slate-500">
          Belum ada template jurnal. Buat template untuk transaksi rutin seperti sewa atau langganan bulanan.
        </div>
      )}

      {!isLoading && !error && templates.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => {
            const id = Number(template.id);
            const isPending = pendingActionId === id;

            return (
              <div
                className={[
                  "rounded-md border bg-white p-4 shadow-sm",
                  template.is_active ? "border-line" : "border-line opacity-60"
                ].join(" ")}
                key={template.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink">{template.name}</h3>
                    {template.description && <p className="mt-0.5 text-xs text-slate-500">{template.description}</p>}
                  </div>
                  {!template.is_active && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      Nonaktif
                    </span>
                  )}
                </div>

                {template.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-brand"
                        key={tag}
                      >
                        <TagIcon size={9} aria-hidden="true" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-1 rounded-md border border-line bg-panel px-3 py-2 text-xs text-slate-600">
                  {template.lines.map((line) => (
                    <div className="flex items-center justify-between" key={line.id ?? `${line.account_id}`}>
                      <span className="truncate">{line.account_name}</span>
                      <span className="shrink-0 font-medium text-ink">
                        {Number(line.debit) > 0 ? formatCurrency(Number(line.debit)) : `(${formatCurrency(Number(line.credit))})`}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="font-bold text-ink">{formatCurrency(template.total_amount)}</span>
                </div>

                <div className="mt-3 border-t border-line pt-3">
                  {template.generated_this_period ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Sudah digenerate untuk {periodMonthLabel(periodMonth)}
                      {template.last_run_this_period?.reference_no && (
                        <span className="text-slate-400">({template.last_run_this_period.reference_no})</span>
                      )}
                    </div>
                  ) : generateSuccessId === id ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Berhasil digenerate.
                    </div>
                  ) : (
                    <button
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!template.is_active || isPending}
                      onClick={() => handleGenerate(template)}
                      type="button"
                    >
                      {isPending ? (
                        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Play size={15} aria-hidden="true" />
                      )}
                      Generate Jurnal untuk {periodMonthLabel(periodMonth)}
                    </button>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-line pt-3">
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-teal-50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isPending}
                    onClick={() => openEditPanel(id)}
                    title="Edit template"
                    type="button"
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isPending}
                    onClick={() => handleToggleActive(template)}
                    title={template.is_active ? "Nonaktifkan template" : "Aktifkan template"}
                    type="button"
                  >
                    <Power size={15} aria-hidden="true" />
                  </button>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isPending}
                    onClick={() => handleDelete(template)}
                    title="Hapus template"
                    type="button"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCreateOpen && (
        <TemplateFormPanel
          accounts={accounts}
          mode="create"
          onClose={() => setIsCreateOpen(false)}
          onSaved={handleFormSaved}
          tagSuggestions={tagSuggestions}
        />
      )}

      {editingId !== null && (
        <TemplateFormPanel
          accounts={accounts}
          isLoading={isEditLoading}
          loadError={editLoadError}
          mode="edit"
          onClose={closeEditPanel}
          onSaved={handleFormSaved}
          tagSuggestions={tagSuggestions}
          template={editingTemplate}
          templateId={editingId}
        />
      )}
    </div>
  );
}
