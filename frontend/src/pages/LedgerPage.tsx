import { useEffect, useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { createAccount, deleteAccount, fetchChartOfAccounts, updateAccount } from "../lib/api";
import type { Account, AccountPayload } from "../types";

const typeLabels: Record<Account["account_type"], string> = {
  asset: "Aset",
  liability: "Liabilitas",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  expense: "Beban",
  cogs: "HPP"
};

const typeBadgeClass: Record<Account["account_type"], string> = {
  asset: "bg-blue-50 text-blue-700",
  liability: "bg-amber-50 text-amber-700",
  equity: "bg-purple-50 text-purple-700",
  revenue: "bg-emerald-50 text-emerald-700",
  expense: "bg-red-50 text-red-700",
  cogs: "bg-orange-50 text-orange-700"
};

const emptyForm: AccountPayload = {
  account_code: "",
  account_name: "",
  account_type: "asset",
  normal_balance: "debit",
  parent_account_id: null,
  is_active: true
};

export function LedgerPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<AccountPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function loadAccounts() {
    setIsLoading(true);
    setError(null);

    fetchChartOfAccounts(filter === "active" ? { isActive: true } : {})
      .then(setAccounts)
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat data akun.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(loadAccounts, [filter]);

  const parentOptions = useMemo(
    () => accounts.filter((account) => account.id !== editingId && account.is_active),
    [accounts, editingId]
  );

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setMessage(null);
    setError(null);
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setForm({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      normal_balance: account.normal_balance,
      parent_account_id: account.parent_account_id ?? null,
      is_active: account.is_active
    });
    setMessage(null);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        ...form,
        account_code: form.account_code.trim(),
        account_name: form.account_name.trim(),
        parent_account_id: form.parent_account_id || null
      };

      if (editingId) {
        await updateAccount(editingId, payload);
        setMessage("Akun berhasil diperbarui.");
      } else {
        await createAccount(payload);
        setMessage("Akun baru berhasil dibuat.");
      }

      setForm(emptyForm);
      setEditingId(null);
      loadAccounts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan akun.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(account: Account) {
    const confirmed = window.confirm(`Hapus akun ${account.account_code} - ${account.account_name}?`);
    if (!confirmed) return;

    setError(null);
    setMessage(null);

    try {
      await deleteAccount(account.id);
      setMessage("Akun berhasil dihapus.");
      if (editingId === account.id) resetForm();
      loadAccounts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus akun.");
    }
  }

  return (
    <div className="space-y-5">
      <form className="rounded-md border border-line bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-brand">
              {editingId ? <Pencil size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">{editingId ? "Edit Akun Buku Besar" : "Buat Akun Buku Besar"}</h3>
              <p className="text-sm text-slate-500">Kelola Chart of Accounts untuk jurnal dan laporan.</p>
            </div>
          </div>

          {editingId && (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={resetForm}
              type="button"
            >
              <X size={16} aria-hidden="true" />
              Batal Edit
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Kode Akun</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setForm((current) => ({ ...current, account_code: event.target.value }))}
              required
              value={form.account_code}
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">Nama Akun</span>
            <input
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setForm((current) => ({ ...current, account_name: event.target.value }))}
              required
              value={form.account_name}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Tipe</span>
            <select
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) =>
                setForm((current) => ({ ...current, account_type: event.target.value as Account["account_type"] }))
              }
              value={form.account_type}
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Saldo Normal</span>
            <select
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) =>
                setForm((current) => ({ ...current, normal_balance: event.target.value as Account["normal_balance"] }))
              }
              value={form.normal_balance}
            >
              <option value="debit">Debit</option>
              <option value="credit">Kredit</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Induk Akun</span>
            <select
              className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setForm((current) => ({ ...current, parent_account_id: event.target.value || null }))}
              value={form.parent_account_id ?? ""}
            >
              <option value="">Tanpa induk</option>
              {parentOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.account_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3">
            <input
              checked={Boolean(form.is_active)}
              className="h-4 w-4 accent-teal-700"
              onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              type="checkbox"
            />
            <span className="text-sm font-medium text-slate-700">Akun aktif</span>
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSaving}
            type="submit"
          >
            <Save size={17} aria-hidden="true" />
            {isSaving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Buat Akun"}
          </button>
        </div>
      </form>

      {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <BookOpen size={18} className="text-brand" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ink">Daftar Akun</h3>
          </div>

          <div className="inline-flex rounded-md border border-line bg-white p-1">
            {(["active", "all"] as const).map((value) => (
              <button
                key={value}
                className={[
                  "h-9 rounded px-3 text-sm font-semibold",
                  filter === value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
                ].join(" ")}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "active" ? "Aktif" : "Semua"}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Memuat data akun...</p>}

        {!isLoading && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama Akun</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3">Saldo Normal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                      Belum ada akun.
                    </td>
                  </tr>
                )}

                {accounts.map((account) => (
                  <tr className="border-t border-line" key={account.id}>
                    <td className="px-4 py-3 font-medium text-ink">{account.account_code}</td>
                    <td className="px-4 py-3">{account.account_name}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${typeBadgeClass[account.account_type]}`}>
                        {typeLabels[account.account_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {account.normal_balance === "debit" ? "Debit" : "Kredit"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          account.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        ].join(" ")}
                      >
                        {account.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50"
                          onClick={() => startEdit(account)}
                          title="Edit akun"
                          type="button"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-danger hover:bg-red-50"
                          onClick={() => handleDelete(account)}
                          title="Hapus akun"
                          type="button"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
