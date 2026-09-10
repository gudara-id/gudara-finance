import { useEffect, useMemo, useState } from "react";
import { Boxes, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createFixedAsset,
  deleteFixedAsset,
  fetchAccounts,
  fetchFixedAssets,
  updateFixedAsset
} from "../lib/api";
import type { Account, FixedAsset, FixedAssetListMeta, FixedAssetPayload, FixedAssetStatus } from "../types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const statusLabels: Record<FixedAssetStatus, string> = {
  aktif: "Aktif",
  nonaktif: "Nonaktif",
  dijual: "Dijual",
  rusak: "Rusak"
};

const statusBadgeClass: Record<FixedAssetStatus, string> = {
  aktif: "bg-emerald-50 text-emerald-700",
  nonaktif: "bg-slate-100 text-slate-500",
  dijual: "bg-blue-50 text-blue-700",
  rusak: "bg-red-50 text-danger"
};

type FormState = {
  asset_code: string;
  asset_name: string;
  account_id: string;
  quantity: string;
  acquisition_date: string;
  acquisition_cost: string;
  residual_value: string;
  useful_life_months: string;
  location: string;
  status: FixedAssetStatus;
  notes: string;
};

const emptyForm: FormState = {
  asset_code: "",
  asset_name: "",
  account_id: "",
  quantity: "1",
  acquisition_date: today(),
  acquisition_cost: "",
  residual_value: "0",
  useful_life_months: "48",
  location: "",
  status: "aktif",
  notes: ""
};

export function AssetsPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [meta, setMeta] = useState<FixedAssetListMeta | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const assetAccounts = useMemo(() => accounts.filter((account) => account.account_type === "asset"), [accounts]);

  function loadAssets() {
    setIsLoading(true);
    setError(null);

    fetchFixedAssets({ status: statusFilter || undefined, accountId: accountFilter || undefined, search: search || undefined })
      .then((result) => {
        setAssets(result.data);
        setMeta(result.meta);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat daftar aset.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    fetchAccounts().then(setAccounts).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, accountFilter]);

  function openCreateForm() {
    setEditingId(null);
    setForm({ ...emptyForm, account_id: assetAccounts[0] ? String(assetAccounts[0].id) : "" });
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditForm(asset: FixedAsset) {
    setEditingId(asset.id);
    setForm({
      asset_code: asset.asset_code,
      asset_name: asset.asset_name,
      account_id: String(asset.account_id),
      quantity: String(asset.quantity),
      acquisition_date: asset.acquisition_date,
      acquisition_cost: String(asset.acquisition_cost),
      residual_value: String(asset.residual_value),
      useful_life_months: String(asset.useful_life_months),
      location: asset.location ?? "",
      status: asset.status,
      notes: asset.notes ?? ""
    });
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit() {
    setFormError(null);

    if (!form.asset_code.trim() || !form.asset_name.trim() || !form.account_id) {
      setFormError("Kode aset, nama aset, dan akun wajib diisi.");
      return;
    }

    const payload: FixedAssetPayload = {
      asset_code: form.asset_code.trim(),
      asset_name: form.asset_name.trim(),
      account_id: Number(form.account_id),
      quantity: Number(form.quantity) || 1,
      acquisition_date: form.acquisition_date,
      acquisition_cost: form.acquisition_cost || "0",
      residual_value: form.residual_value || "0",
      useful_life_months: Number(form.useful_life_months) || 1,
      location: form.location.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined
    };

    setIsSaving(true);
    try {
      if (editingId) {
        await updateFixedAsset(editingId, payload);
      } else {
        await createFixedAsset(payload);
      }
      closeForm();
      loadAssets();
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Gagal menyimpan aset.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(asset: FixedAsset) {
    if (!window.confirm(`Hapus aset "${asset.asset_name}" (${asset.asset_code})? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }

    try {
      await deleteFixedAsset(asset.id);
      loadAssets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus aset.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-line bg-white px-3 py-3 shadow-sm sm:px-4">
          <p className="text-[11px] font-semibold uppercase leading-tight text-slate-500 sm:text-xs">Total Harga Perolehan</p>
          <p className="mt-1 truncate text-base font-bold text-ink sm:text-lg">{formatCurrency(meta?.total_acquisition_cost ?? 0)}</p>
        </div>
        <div className="rounded-md border border-line bg-white px-3 py-3 shadow-sm sm:px-4">
          <p className="text-[11px] font-semibold uppercase leading-tight text-slate-500 sm:text-xs">Akumulasi Penyusutan</p>
          <p className="mt-1 truncate text-base font-bold text-ink sm:text-lg">{formatCurrency(meta?.total_accumulated_depreciation ?? 0)}</p>
        </div>
        <div className="col-span-2 rounded-md border border-line bg-white px-3 py-3 shadow-sm sm:px-4 lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase leading-tight text-slate-500 sm:text-xs">Nilai Buku Saat Ini</p>
          <p className="mt-1 truncate text-base font-bold text-ink sm:text-lg">{formatCurrency(meta?.total_book_value ?? 0)}</p>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <Boxes size={18} className="text-brand" aria-hidden="true" />
            <h3 className="text-base font-semibold text-ink">Daftar Aset Tetap</h3>
            {meta && <span className="text-xs text-slate-400">({meta.count})</span>}
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-700"
            onClick={openCreateForm}
            type="button"
          >
            <Plus size={16} aria-hidden="true" />
            Tambah Aset
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Cari</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100 sm:w-48"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && loadAssets()}
              placeholder="Kode atau nama aset"
              type="text"
              value={search}
            />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:contents">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Kategori</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100 sm:w-48"
                onChange={(event) => setAccountFilter(event.target.value)}
                value={accountFilter}
              >
                <option value="">Semua kategori</option>
                {assetAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_code} - {account.account_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">Status</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100 sm:w-40"
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              >
                <option value="">Semua status</option>
                {(Object.keys(statusLabels) as FixedAssetStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={loadAssets}
            type="button"
          >
            Terapkan
          </button>
        </div>

        {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Memuat daftar aset...</p>}
        {error && <div className="mx-4 my-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

        {!isLoading && !error && assets.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Belum ada aset yang tercatat.</p>
        )}

        {!isLoading && !error && assets.length > 0 && (
          <>
            {/* Mobile / tablet: card list. Keeps every figure readable without horizontal scrolling. */}
            <div className="divide-y divide-line lg:hidden">
              {assets.map((asset) => (
                <div className="px-4 py-4" key={asset.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{asset.asset_name}</p>
                      <p className="text-xs text-slate-500">
                        {asset.asset_code} · {asset.account_name}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[asset.status]}`}>
                      {statusLabels[asset.status]}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Tgl Perolehan</p>
                      <p className="text-ink">{asset.acquisition_date}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Umur Manfaat</p>
                      <p className="text-ink">
                        {asset.months_elapsed}/{asset.useful_life_months} bln
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Harga Perolehan</p>
                      <p className="font-medium text-ink">{formatCurrency(asset.acquisition_cost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Akum. Penyusutan</p>
                      <p className="text-ink">{formatCurrency(asset.accumulated_depreciation)}</p>
                    </div>
                    <div className="col-span-2 rounded-md bg-panel px-3 py-2">
                      <p className="text-xs text-slate-500">Nilai Buku</p>
                      <p className="text-base font-bold text-ink">{formatCurrency(asset.book_value)}</p>
                    </div>
                  </div>

                  {(asset.quantity > 1 || asset.location || asset.is_fully_depreciated) && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {asset.quantity > 1 && <span>{asset.quantity} unit</span>}
                      {asset.location && <span>{asset.location}</span>}
                      {asset.is_fully_depreciated && <span className="text-amber-600">Penyusutan penuh</span>}
                    </div>
                  )}

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      onClick={() => openEditForm(asset)}
                      type="button"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-danger hover:bg-red-50"
                      onClick={() => handleDelete(asset)}
                      type="button"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Kode</th>
                    <th className="px-4 py-3">Nama Aset</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Tgl Perolehan</th>
                    <th className="px-4 py-3 text-right">Harga Perolehan</th>
                    <th className="px-4 py-3 text-right">Akumulasi Penyusutan</th>
                    <th className="px-4 py-3 text-right">Nilai Buku</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr className="border-t border-line align-top transition hover:bg-panel" key={asset.id}>
                      <td className="px-4 py-3 font-medium text-ink">{asset.asset_code}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{asset.asset_name}</p>
                        {asset.quantity > 1 && <p className="text-xs text-slate-500">{asset.quantity} unit</p>}
                        {asset.location && <p className="text-xs text-slate-500">{asset.location}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{asset.account_name}</td>
                      <td className="px-4 py-3 text-slate-600">{asset.acquisition_date}</td>
                      <td className="px-4 py-3 text-right text-ink">{formatCurrency(asset.acquisition_cost)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency(asset.accumulated_depreciation)}
                        <p className="text-xs text-slate-400">
                          {asset.months_elapsed}/{asset.useful_life_months} bln
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">{formatCurrency(asset.book_value)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[asset.status]}`}>
                          {statusLabels[asset.status]}
                        </span>
                        {asset.is_fully_depreciated && (
                          <p className="mt-1 text-xs text-amber-600">Penyusutan penuh</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50"
                            onClick={() => openEditForm(asset)}
                            title="Edit"
                            type="button"
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-danger hover:bg-red-50"
                            onClick={() => handleDelete(asset)}
                            title="Hapus"
                            type="button"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">{editingId ? "Edit Aset" : "Tambah Aset"}</h3>
              <button className="text-slate-500 hover:text-ink" onClick={closeForm} type="button">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{formError}</div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Kode Aset</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setForm((prev) => ({ ...prev, asset_code: event.target.value }))}
                    placeholder="IT-009"
                    type="text"
                    value={form.asset_code}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Kategori (Akun)</span>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))}
                    value={form.account_id}
                  >
                    <option value="">Pilih akun</option>
                    {assetAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_code} - {account.account_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Nama Aset</span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setForm((prev) => ({ ...prev, asset_name: event.target.value }))}
                  placeholder="Laptop Advan Workmate"
                  type="text"
                  value={form.asset_name}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Jumlah Unit</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    min={1}
                    onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
                    type="number"
                    value={form.quantity}
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-600">Tanggal Perolehan</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setForm((prev) => ({ ...prev, acquisition_date: event.target.value }))}
                    type="date"
                    value={form.acquisition_date}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Harga Perolehan (Rp)</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    min={0}
                    onChange={(event) => setForm((prev) => ({ ...prev, acquisition_cost: event.target.value }))}
                    type="number"
                    value={form.acquisition_cost}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Nilai Residu (Rp)</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    min={0}
                    onChange={(event) => setForm((prev) => ({ ...prev, residual_value: event.target.value }))}
                    type="number"
                    value={form.residual_value}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Umur Manfaat (bulan)</span>
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    min={1}
                    onChange={(event) => setForm((prev) => ({ ...prev, useful_life_months: event.target.value }))}
                    type="number"
                    value={form.useful_life_months}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Status</span>
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as FixedAssetStatus }))}
                    value={form.status}
                  >
                    {(Object.keys(statusLabels) as FixedAssetStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Lokasi (opsional)</span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="Gudang, Kantor, dsb."
                  type="text"
                  value={form.location}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Catatan (opsional)</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={2}
                  value={form.notes}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
              <button
                className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={closeForm}
                type="button"
              >
                Batal
              </button>
              <button
                className="h-10 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                disabled={isSaving}
                onClick={handleSubmit}
                type="button"
              >
                {isSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
