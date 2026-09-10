import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Eye, ListFilter, Loader2, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import {
  createApBill,
  createArInvoice,
  createContact,
  deleteApBill,
  deleteArInvoice,
  downloadArInvoiceExport,
  fetchAccounts,
  fetchAgingReport,
  fetchApBillById,
  fetchApBills,
  fetchArInvoiceById,
  fetchArInvoices,
  fetchContacts,
  payApBill,
  payArInvoice,
  updateApBill,
  updateArInvoice,
  voidApBill,
  voidArInvoice
} from "../lib/api";
import { formatCurrency, formatDateID } from "../lib/format";
import type {
  Account,
  AgingBucketKey,
  AgingReport,
  ApBill,
  ArInvoice,
  AuthUser,
  Contact,
  ContactType,
  PaymentStatus
} from "../types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const statusLabels: Record<PaymentStatus, string> = {
  belum_lunas: "Belum Lunas",
  sebagian: "Dibayar Sebagian",
  lunas: "Lunas",
  jatuh_tempo: "Jatuh Tempo",
  void: "Dibatalkan"
};

const statusBadgeClass: Record<PaymentStatus, string> = {
  belum_lunas: "bg-slate-100 text-slate-600",
  sebagian: "bg-amber-50 text-amber-700",
  lunas: "bg-emerald-50 text-emerald-700",
  jatuh_tempo: "bg-red-50 text-danger",
  void: "bg-slate-100 text-slate-400 line-through"
};

const bucketLabels: Record<AgingBucketKey, string> = {
  belum_jatuh_tempo: "Belum Jatuh Tempo",
  "1_30": "1-30 Hari",
  "31_60": "31-60 Hari",
  "61_90": "61-90 Hari",
  "90_plus": ">90 Hari"
};

type TabKey = "piutang" | "utang" | "aging" | "kontak";

const tabs: { key: TabKey; label: string }[] = [
  { key: "piutang", label: "Piutang" },
  { key: "utang", label: "Utang" },
  { key: "aging", label: "Umur Piutang/Utang" },
  { key: "kontak", label: "Kontak" }
];

export function PiutangUtangPage({ user }: { user: AuthUser }) {
  // Role "sales" boleh membuat & mengedit invoice/tagihan/kontak, tapi TIDAK
  // boleh mencatat pembayaran, membatalkan (void), atau menghapus data.
  const canDeleteOrVoid = user.role !== "sales";
  const [activeTab, setActiveTab] = useState<TabKey>("piutang");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);

  function reloadContacts() {
    fetchContacts({ type: "customer" }).then(setCustomers).catch(() => {});
    fetchContacts({ type: "supplier" }).then(setSuppliers).catch(() => {});
  }

  useEffect(() => {
    fetchAccounts().then(setAccounts).catch(() => {});
    reloadContacts();
  }, []);

  const cashAccounts = useMemo(() => accounts.filter((account) => account.account_type === "asset"), [accounts]);
  const revenueAccounts = useMemo(() => accounts.filter((account) => account.account_type === "revenue"), [accounts]);
  const debitAccountsForBill = useMemo(
    () => accounts.filter((account) => ["asset", "expense", "cogs"].includes(account.account_type)),
    [accounts]
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
              activeTab === tab.key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "piutang" && (
        <InvoiceBillSection
          kind="ar"
          contacts={customers}
          moneyAccounts={cashAccounts}
          categoryAccounts={revenueAccounts}
          categoryLabel="Akun Pendapatan"
          onContactsChanged={reloadContacts}
          canDeleteOrVoid={canDeleteOrVoid}
        />
      )}

      {activeTab === "utang" && (
        <InvoiceBillSection
          kind="ap"
          contacts={suppliers}
          moneyAccounts={cashAccounts}
          categoryAccounts={debitAccountsForBill}
          categoryLabel="Akun Persediaan/Beban"
          onContactsChanged={reloadContacts}
          canDeleteOrVoid={canDeleteOrVoid}
        />
      )}

      {activeTab === "aging" && <AgingReportSection />}

      {activeTab === "kontak" && (
        <ContactsSection customers={customers} suppliers={suppliers} onChanged={reloadContacts} canManage />
      )}
    </div>
  );
}

// =====================================================================
// Piutang / Utang (invoice & tagihan) — dipakai untuk dua tab sekaligus,
// tinggal beda `kind` dan daftar akunnya
// =====================================================================

type InvoiceOrBill = ArInvoice | ApBill;

function InvoiceBillSection({
  kind,
  contacts,
  moneyAccounts,
  categoryAccounts,
  categoryLabel,
  onContactsChanged,
  canDeleteOrVoid
}: {
  kind: "ar" | "ap";
  contacts: Contact[];
  moneyAccounts: Account[];
  categoryAccounts: Account[];
  categoryLabel: string;
  onContactsChanged: () => void;
  canDeleteOrVoid: boolean;
}) {
  const isAr = kind === "ar";
  const noun = isAr ? "Invoice" : "Tagihan";
  const contactLabel = isAr ? "Pelanggan" : "Supplier";
  const contactType: ContactType = isAr ? "customer" : "supplier";

  const [items, setItems] = useState<InvoiceOrBill[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid" | "void">("open");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkVoiding, setIsBulkVoiding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceOrBill | null>(null);
  const [payingItem, setPayingItem] = useState<InvoiceOrBill | null>(null);
  const [viewingItem, setViewingItem] = useState<InvoiceOrBill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceOrBill | null>(null);

  const activeFilterCount = [startDate, endDate].filter(Boolean).length;

  function load() {
    setIsLoading(true);
    setLoadError(null);
    const params = { status: statusFilter, search: search || undefined, startDate: startDate || undefined, endDate: endDate || undefined };
    const fetcher = isAr ? fetchArInvoices(params) : fetchApBills(params);
    fetcher
      .then((result) => {
        setItems(result.data);
        setTotalOutstanding(result.meta.total_outstanding);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : `Gagal memuat daftar ${noun.toLowerCase()}.`))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, statusFilter, search, startDate, endDate]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      for (const item of items) {
        const id = Number(item.id);
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

  const allOnPageSelected = items.length > 0 && items.every((item) => selectedIds.has(Number(item.id)));

  async function handleVoid(item: InvoiceOrBill) {
    const no = "invoice_no" in item ? item.invoice_no : item.bill_no;
    if (!window.confirm(`Batalkan ${no}? Jurnalnya akan di-void dan tidak lagi masuk laporan.`)) return;

    setActionError(null);
    setPendingActionId(Number(item.id));
    try {
      if (isAr) {
        await voidArInvoice(item.id);
      } else {
        await voidApBill(item.id);
      }
      load();
    } catch (voidError) {
      setActionError(voidError instanceof Error ? voidError.message : "Gagal membatalkan.");
    } finally {
      setPendingActionId(null);
    }
  }

  // Kalau item ini belum pernah dibayar dan belum void, hapus langsung
  // pakai window.confirm biasa (jalur ringan, seperti sebelumnya). Kalau
  // sudah ada pembayaran atau sudah void, `password` datang dari modal
  // DeleteConfirmModal — tanpa window.confirm lagi karena modalnya sendiri
  // sudah jadi langkah konfirmasinya.
  async function handleDelete(item: InvoiceOrBill, password?: string) {
    const no = "invoice_no" in item ? item.invoice_no : item.bill_no;

    if (!password) {
      const confirmed = window.confirm(
        `Hapus permanen ${no}?\n\nTindakan ini TIDAK BISA dibatalkan dan akan menghapus jurnalnya juga.`
      );
      if (!confirmed) return;
    }

    const id = Number(item.id);
    setActionError(null);
    setPendingActionId(id);
    try {
      if (isAr) {
        await deleteArInvoice(id, password);
      } else {
        await deleteApBill(id, password);
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setDeleteTarget(null);
      load();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : `Gagal menghapus ${noun.toLowerCase()}.`;
      if (password) {
        // Lempar lagi supaya modal-nya sendiri yang menampilkan error ini
        // (mis. "Password salah") di dalam form, bukan di banner halaman.
        throw new Error(message);
      }
      setActionError(message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleExport(item: InvoiceOrBill) {
    const id = Number(item.id);
    setActionError(null);
    setExportingId(id);
    try {
      await downloadArInvoiceExport(id);
    } catch (exportError) {
      setActionError(exportError instanceof Error ? exportError.message : "Gagal mengunduh invoice.");
    } finally {
      setExportingId(null);
    }
  }

  async function handleBulkVoid() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Batalkan ${selectedIds.size} ${noun.toLowerCase()} terpilih?`)) return;

    setIsBulkVoiding(true);
    setActionError(null);
    let failed = 0;

    for (const id of selectedIds) {
      try {
        if (isAr) {
          await voidArInvoice(id);
        } else {
          await voidApBill(id);
        }
      } catch {
        failed += 1;
      }
    }

    setIsBulkVoiding(false);
    clearSelection();
    load();

    if (failed > 0) {
      setActionError(`${failed} dari ${selectedIds.size} gagal dibatalkan (kemungkinan sudah ada pembayaran atau sudah void).`);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-ink">
              {isAr ? "Piutang Non-Marketplace" : "Utang ke Supplier"}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? "Invoice ke pelanggan wholesale/reseller di luar TikTok Shop/Shopee/Tokopedia."
                : "Tagihan dari supplier kain/bahan baku, dengan tanggal jatuh tempo."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus size={16} aria-hidden="true" />
            {noun} Baru
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex gap-1 rounded-md border border-line p-1 text-xs">
            {(["open", "paid", "all", "void"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={[
                  "rounded px-2.5 py-1.5 font-medium transition",
                  statusFilter === option ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                ].join(" ")}
              >
                {option === "open" ? "Terbuka" : option === "paid" ? "Lunas" : option === "void" ? "Dibatalkan" : "Semua"}
              </button>
            ))}
          </div>

          {statusFilter === "open" && (
            <p className="text-sm text-slate-600">
              Total belum lunas: <span className="font-semibold text-ink">{formatCurrency(totalOutstanding)}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <form className="flex flex-1 min-w-[220px] gap-2" onSubmit={handleSearchSubmit}>
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={`Cari No. ${noun.toLowerCase()} / deskripsi / ${contactLabel.toLowerCase()}`}
                className="h-9 w-full rounded-md border border-line pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cari
            </button>
          </form>
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ListFilter size={15} aria-hidden="true" />
            Filter Tanggal
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {(startDate || endDate) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
            {startDate && <FilterChip label={`Dari ${formatDateID(startDate)}`} onRemove={() => setStartDate("")} />}
            {endDate && <FilterChip label={`Sampai ${formatDateID(endDate)}`} onRemove={() => setEndDate("")} />}
          </div>
        )}

        {actionError && (
          <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{actionError}</div>
        )}

        {canDeleteOrVoid && selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-teal-50/60 px-4 py-2.5">
            <span className="text-sm font-medium text-teal-800">{selectedIds.size} {noun.toLowerCase()} dipilih</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isBulkVoiding}
                onClick={handleBulkVoid}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-teal-200 bg-white px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkVoiding ? "Membatalkan..." : "Batalkan Terpilih"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Batal Pilih
              </button>
            </div>
          </div>
        )}

        {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Memuat data...</p>}

        {loadError && (
          <div className="mx-4 mb-4 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{loadError}</div>
        )}

        {!isLoading && !loadError && items.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">Belum ada {noun.toLowerCase()} yang cocok.</p>
        )}

        {!isLoading && !loadError && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(event) => toggleSelectAllOnPage(event.target.checked)}
                      className="h-4 w-4 rounded border-line text-brand focus:ring-teal-100"
                    />
                  </th>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">{contactLabel}</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Jatuh Tempo</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3 text-right">Terbayar</th>
                  <th className="px-4 py-3 text-right">Sisa</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const id = Number(item.id);
                  const no = "invoice_no" in item ? item.invoice_no : item.bill_no;
                  const date = "invoice_date" in item ? item.invoice_date : item.bill_date;
                  const isSelected = selectedIds.has(id);
                  const isVoid = item.status === "void";
                  const isEditable = !isVoid && item.paid_amount === 0;
                  const isPending = pendingActionId === id;
                  return (
                    <tr className={`border-t border-line align-top hover:bg-panel ${isSelected ? "bg-teal-50/40" : ""}`} key={item.id}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) => toggleSelectOne(id, event.target.checked)}
                          className="h-4 w-4 rounded border-line text-brand focus:ring-teal-100"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        <button type="button" onClick={() => setViewingItem(item)} className="hover:underline">
                          {no}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.contact_name}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateID(date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateID(item.due_date)}</td>
                      <td className="px-4 py-3 text-right text-ink">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(item.paid_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">{formatCurrency(item.balance)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[item.payment_status]}`}>
                          {statusLabels[item.payment_status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingItem(item)}
                            title="Lihat detail"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-line px-2 text-slate-500 hover:bg-slate-50"
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>

                          {isAr && (
                            <button
                              type="button"
                              onClick={() => handleExport(item)}
                              disabled={exportingId === Number(item.id)}
                              title="Export PDF untuk konsumen"
                              className="inline-flex h-8 items-center justify-center rounded-md border border-line px-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {exportingId === Number(item.id) ? (
                                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Download size={14} aria-hidden="true" />
                              )}
                            </button>
                          )}

                          {canDeleteOrVoid && !isVoid && item.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => setPayingItem(item)}
                              className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Bayar
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isVoid || isPending}
                            onClick={() => setEditingItem(item)}
                            title={
                              isVoid
                                ? `${noun} void tidak dapat diedit`
                                : item.paid_amount > 0
                                  ? "Sudah ada pembayaran — akan diminta konfirmasi password"
                                  : `Edit ${noun.toLowerCase()}`
                            }
                            className="inline-flex h-8 items-center justify-center rounded-md border border-line px-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>

                          {canDeleteOrVoid && isEditable && (
                            <button
                              type="button"
                              onClick={() => handleVoid(item)}
                              disabled={isPending}
                              className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-medium text-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Batalkan
                            </button>
                          )}

                          {canDeleteOrVoid && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => (isVoid || item.paid_amount > 0 ? setDeleteTarget(item) : handleDelete(item))}
                              title={
                                isVoid || item.paid_amount > 0
                                  ? "Sudah ada pembayaran/void — akan diminta konfirmasi password"
                                  : `Hapus ${noun.toLowerCase()}`
                              }
                              className="inline-flex h-8 items-center justify-center rounded-md border border-line px-2 text-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(isFormOpen || editingItem) && (
        <InvoiceBillForm
          kind={kind}
          contacts={contacts}
          contactType={contactType}
          contactLabel={contactLabel}
          categoryAccounts={categoryAccounts}
          categoryLabel={categoryLabel}
          moneyAccounts={moneyAccounts}
          editItem={editingItem}
          onClose={() => {
            setIsFormOpen(false);
            setEditingItem(null);
          }}
          onCreated={() => {
            setIsFormOpen(false);
            setEditingItem(null);
            load();
          }}
          onContactsChanged={onContactsChanged}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          noun={noun}
          onClose={() => setDeleteTarget(null)}
          onConfirm={(password) => handleDelete(deleteTarget, password)}
        />
      )}

      {payingItem && (
        <PaymentForm
          kind={kind}
          item={payingItem}
          moneyAccounts={moneyAccounts}
          onClose={() => setPayingItem(null)}
          onPaid={() => {
            setPayingItem(null);
            load();
          }}
        />
      )}

      {viewingItem && (
        <InvoiceBillDetailModal
          kind={kind}
          item={viewingItem}
          contactLabel={contactLabel}
          onClose={() => setViewingItem(null)}
        />
      )}

      {isFilterOpen && (
        <DateFilterPanel
          startDate={startDate}
          endDate={endDate}
          onApply={(next) => {
            setStartDate(next.startDate);
            setEndDate(next.endDate);
            setIsFilterOpen(false);
          }}
          onClose={() => setIsFilterOpen(false)}
        />
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      {label}
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-slate-700">
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}

function DateFilterPanel({
  startDate,
  endDate,
  onApply,
  onClose
}: {
  startDate: string;
  endDate: string;
  onApply: (next: { startDate: string; endDate: string }) => void;
  onClose: () => void;
}) {
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Filter Tanggal</h3>
          <button className="text-slate-500 hover:text-ink" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Dari Tanggal</span>
            <input
              type="date"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Sampai Tanggal</span>
            <input
              type="date"
              value={draftEnd}
              onChange={(event) => setDraftEnd(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => onApply({ startDate: "", endDate: "" })}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-line text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onApply({ startDate: draftStart, endDate: draftEnd })}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-brand text-sm font-medium text-white hover:opacity-90"
          >
            Filter
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceBillDetailModal({
  kind,
  item,
  contactLabel,
  onClose
}: {
  kind: "ar" | "ap";
  item: InvoiceOrBill;
  contactLabel: string;
  onClose: () => void;
}) {
  const isAr = kind === "ar";
  const [detail, setDetail] = useState<InvoiceOrBill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadArInvoiceExport(item.id);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Gagal mengunduh invoice.");
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const fetcher = isAr ? fetchArInvoiceById(item.id) : fetchApBillById(item.id);
    fetcher
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat detail.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, kind]);

  const no = "invoice_no" in item ? item.invoice_no : item.bill_no;
  const date = "invoice_date" in item ? item.invoice_date : item.bill_date;
  const accountLabel = "revenue_account_id" in item ? "Akun Pendapatan" : "Akun Persediaan/Beban";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-ink">{no}</h3>
            <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass[item.payment_status]}`}>
              {statusLabels[item.payment_status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAr && (
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                title="Export PDF untuk konsumen"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download size={14} aria-hidden="true" />
                )}
                Export PDF
              </button>
            )}
            <button className="text-slate-500 hover:text-ink" onClick={onClose} type="button">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {isLoading && <p className="text-sm text-slate-500">Memuat detail...</p>}
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}
          {exportError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{exportError}</div>}

          {!isLoading && !error && detail && (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-slate-500">{contactLabel}</dt>
                <dd className="text-right text-ink">{detail.contact_name}</dd>
                <dt className="text-slate-500">Tanggal</dt>
                <dd className="text-right text-ink">{formatDateID(date)}</dd>
                <dt className="text-slate-500">Jatuh Tempo</dt>
                <dd className="text-right text-ink">{formatDateID(detail.due_date)}</dd>
                <dt className="text-slate-500">{accountLabel}</dt>
                <dd className="text-right text-ink">{detail.account_code} - {detail.account_name}</dd>
                <dt className="text-slate-500">Deskripsi</dt>
                <dd className="col-span-2 text-ink">{detail.description}</dd>
                {item.status === "void" && "void_reason" in detail && (detail as { void_reason?: string }).void_reason && (
                  <>
                    <dt className="text-slate-500">Alasan Void</dt>
                    <dd className="col-span-2 text-ink">{(detail as { void_reason?: string }).void_reason}</dd>
                  </>
                )}
              </dl>

              {detail.items && detail.items.length > 0 ? (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Rincian Item</h4>
                  <div className="overflow-hidden rounded-md border border-line">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="w-8 px-2 py-1.5 text-left font-medium">No</th>
                          <th className="px-2 py-1.5 text-left font-medium">Deskripsi</th>
                          <th className="w-12 px-2 py-1.5 text-right font-medium">Qty</th>
                          <th className="px-2 py-1.5 text-right font-medium">Harga Satuan</th>
                          <th className="px-2 py-1.5 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {detail.items.map((lineItem, index) => (
                          <tr key={index}>
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5 text-ink">{lineItem.description}</td>
                            <td className="px-2 py-1.5 text-right text-slate-600">{lineItem.qty}</td>
                            <td className="px-2 py-1.5 text-right text-slate-600">{formatCurrency(lineItem.unit_price)}</td>
                            <td className="px-2 py-1.5 text-right text-ink">{formatCurrency(lineItem.qty * lineItem.unit_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Subtotal</dt>
                      <dd className="text-ink">{formatCurrency(detail.subtotal_amount ?? detail.amount)}</dd>
                    </div>
                    {Boolean(detail.discount_amount) && (
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Diskon</dt>
                        <dd className="text-ink">-{formatCurrency(detail.discount_amount || 0)}</dd>
                      </div>
                    )}
                    {Boolean(detail.tax_amount) && (
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Pajak</dt>
                        <dd className="text-ink">{formatCurrency(detail.tax_amount || 0)}</dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-line pt-1.5 font-medium">
                      <dt className="text-ink">Jumlah {isAr ? "Invoice" : "Tagihan"}</dt>
                      <dd className="text-ink">{formatCurrency(detail.amount)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Terbayar</dt>
                      <dd className="text-ink">{formatCurrency(detail.paid_amount)}</dd>
                    </div>
                    <div className="flex items-center justify-between font-semibold">
                      <dt className="text-slate-700">Sisa</dt>
                      <dd className="text-ink">{formatCurrency(detail.balance)}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">Jumlah</dt>
                  <dd className="text-right text-ink">{formatCurrency(detail.amount)}</dd>
                  <dt className="text-slate-500">Terbayar</dt>
                  <dd className="text-right text-ink">{formatCurrency(detail.paid_amount)}</dd>
                  <dt className="font-medium text-slate-700">Sisa</dt>
                  <dd className="text-right font-semibold text-ink">{formatCurrency(detail.balance)}</dd>
                </dl>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Riwayat Pembayaran</h4>
                {(!detail.payments || detail.payments.length === 0) && (
                  <p className="text-sm text-slate-500">Belum ada pembayaran.</p>
                )}
                {detail.payments && detail.payments.length > 0 && (
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {detail.payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <p className="text-ink">{formatDateID(payment.payment_date)}</p>
                          <p className="text-xs text-slate-500">{payment.account_code} - {payment.account_name}</p>
                        </div>
                        <span className="font-medium text-ink">{formatCurrency(payment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal konfirmasi password untuk hapus permanen invoice/tagihan yang
// sudah ada pembayaran tercatat dan/atau sudah void. Ini satu-satunya
// jalur yang menembus proteksi normal — sengaja dipisah dari
// window.confirm biasa supaya orang tidak bisa hapus data yang sudah
// tersambung ke uang beneran cuma dengan satu klik "OK".
function DeleteConfirmModal({
  item,
  noun,
  onClose,
  onConfirm
}: {
  item: InvoiceOrBill;
  noun: string;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const no = "invoice_no" in item ? item.invoice_no : item.bill_no;
  const isVoid = item.status === "void";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!password) {
      setError("Password wajib diisi.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(password);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Gagal menghapus.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-md bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-danger">Hapus Permanen — {no}</h3>
          <button className="text-slate-500 hover:text-ink" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {noun} ini {item.paid_amount > 0 && "sudah ada pembayaran tercatat"}
            {item.paid_amount > 0 && isVoid && " dan "}
            {isVoid && "sudah dibatalkan (void)"}. Tindakan ini{" "}
            <strong>TIDAK BISA dibatalkan</strong> — {item.paid_amount > 0 && "riwayat pembayaran, "}jurnal
            akuntansinya akan ikut terhapus permanen.
          </p>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Password Konfirmasi</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-red-100"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-danger px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Menghapus..." : "Hapus Permanen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InvoiceBillForm({
  kind,
  contacts,
  contactType,
  contactLabel,
  categoryAccounts,
  categoryLabel,
  moneyAccounts,
  editItem,
  onClose,
  onCreated,
  onContactsChanged
}: {
  kind: "ar" | "ap";
  contacts: Contact[];
  contactType: ContactType;
  contactLabel: string;
  categoryAccounts: Account[];
  categoryLabel: string;
  moneyAccounts: Account[];
  editItem?: InvoiceOrBill | null;
  onClose: () => void;
  onCreated: () => void;
  onContactsChanged: () => void;
}) {
  const isAr = kind === "ar";
  const isEditing = Boolean(editItem);
  const [contactId, setContactId] = useState(() => (editItem ? String(editItem.contact_id) : ""));
  const [date, setDate] = useState(() => {
    if (!editItem) return today();
    return "invoice_date" in editItem ? editItem.invoice_date : editItem.bill_date;
  });
  const [dueDate, setDueDate] = useState(() => editItem?.due_date ?? today());
  const [description, setDescription] = useState(() => editItem?.description ?? "");

  // Rincian item (No / Deskripsi / Qty / Harga Satuan), seperti invoice
  // formal. Kalau sedang edit invoice lama yang belum punya `items`
  // (dibuat sebelum fitur ini ada), turunkan satu baris item dari
  // description+amount yang lama supaya form tetap bisa dibuka & disimpan
  // ulang tanpa kehilangan data.
  const [items, setItems] = useState<{ description: string; qty: string; unitPrice: string }[]>(() => {
    if (editItem?.items && editItem.items.length > 0) {
      return editItem.items.map((item) => ({
        description: item.description,
        qty: String(item.qty),
        unitPrice: String(item.unit_price)
      }));
    }
    if (editItem) {
      return [{ description: editItem.description, qty: "1", unitPrice: String(editItem.amount) }];
    }
    return [{ description: "", qty: "1", unitPrice: "" }];
  });
  const [discountAmount, setDiscountAmount] = useState(() => (editItem?.discount_amount ? String(editItem.discount_amount) : ""));
  const [taxPercent, setTaxPercent] = useState(() => {
    const subtotal = editItem?.subtotal_amount || 0;
    const tax = editItem?.tax_amount || 0;
    if (subtotal > 0 && tax > 0) {
      const discount = editItem?.discount_amount || 0;
      return String(Math.round(((tax / (subtotal - discount)) * 100 + Number.EPSILON) * 100) / 100);
    }
    return "";
  });

  const [categoryAccountId, setCategoryAccountId] = useState(() => {
    if (!editItem) return "";
    return "revenue_account_id" in editItem ? String(editItem.revenue_account_id) : String(editItem.expense_account_id);
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);

  // Kalau invoice/tagihan yang sedang diedit sudah punya pembayaran
  // tercatat, server akan menolak perubahan tanpa password konfirmasi —
  // tampilkan field-nya di form supaya user tidak perlu tebak-tebak.
  const needsPasswordConfirm = isEditing && Boolean(editItem) && Number(editItem?.paid_amount) > 0;
  const [confirmPassword, setConfirmPassword] = useState("");

  const [hasDp, setHasDp] = useState(false);
  const [dpAmount, setDpAmount] = useState("");
  const [dpAccountId, setDpAccountId] = useState("");
  const [dpNotes, setDpNotes] = useState("");

  function updateItem(index: number, patch: Partial<{ description: string; qty: string; unitPrice: string }>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, { description: "", qty: "1", unitPrice: "" }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const lineTotals = items.map((item) => (Number(item.qty) || 0) * (Number(item.unitPrice) || 0));
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  const discountNumber = Number(discountAmount) || 0;
  const taxPercentNumber = Number(taxPercent) || 0;
  const taxNumber = Math.max(subtotal - discountNumber, 0) * (taxPercentNumber / 100);
  const grandTotal = Math.round((subtotal - discountNumber + taxNumber + Number.EPSILON) * 100) / 100;
  const dpExceedsAmount = hasDp && grandTotal > 0 && (Number(dpAmount) || 0) > grandTotal;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!contactId) {
      setError(`${contactLabel} wajib dipilih.`);
      return;
    }

    const validItems = items.filter((item) => item.description.trim() !== "");
    if (validItems.length === 0) {
      setError("Minimal 1 baris item dengan deskripsi wajib diisi.");
      return;
    }
    if (validItems.some((item) => !(Number(item.qty) > 0))) {
      setError("Qty setiap item harus lebih dari 0.");
      return;
    }
    if (discountNumber > subtotal) {
      setError("Diskon tidak boleh melebihi subtotal.");
      return;
    }
    if (grandTotal <= 0) {
      setError("Total invoice/tagihan harus lebih dari 0.");
      return;
    }

    if (needsPasswordConfirm && !confirmPassword) {
      setError("Masukkan password akun kamu untuk konfirmasi, karena sudah ada pembayaran tercatat.");
      return;
    }

    if (!isEditing && hasDp) {
      if (!dpAmount || Number(dpAmount) <= 0) {
        setError("Jumlah DP wajib diisi dan lebih dari 0.");
        return;
      }
      if (dpExceedsAmount) {
        setError("Jumlah DP tidak boleh melebihi jumlah invoice/tagihan.");
        return;
      }
      if (!dpAccountId) {
        setError("Akun kas/bank tujuan DP wajib dipilih.");
        return;
      }
    }

    const itemsPayload = validItems.map((item) => ({
      description: item.description.trim(),
      qty: Number(item.qty),
      unit_price: Number(item.unitPrice) || 0
    }));

    setIsSaving(true);
    try {
      if (isEditing && editItem) {
        if (isAr) {
          await updateArInvoice(editItem.id, {
            contact_id: contactId,
            invoice_date: date,
            due_date: dueDate,
            description,
            items: itemsPayload,
            discount_amount: discountNumber,
            tax_amount: taxNumber,
            revenue_account_id: categoryAccountId || undefined,
            password: needsPasswordConfirm ? confirmPassword : undefined
          });
        } else {
          await updateApBill(editItem.id, {
            contact_id: contactId,
            bill_date: date,
            due_date: dueDate,
            description,
            items: itemsPayload,
            discount_amount: discountNumber,
            tax_amount: taxNumber,
            expense_account_id: categoryAccountId || undefined,
            password: needsPasswordConfirm ? confirmPassword : undefined
          });
        }
        onCreated();
        return;
      }

      let created;
      if (isAr) {
        created = await createArInvoice({
          contact_id: contactId,
          invoice_date: date,
          due_date: dueDate,
          description,
          items: itemsPayload,
          discount_amount: discountNumber,
          tax_amount: taxNumber,
          revenue_account_id: categoryAccountId || undefined
        });
      } else {
        created = await createApBill({
          contact_id: contactId,
          bill_date: date,
          due_date: dueDate,
          description,
          items: itemsPayload,
          discount_amount: discountNumber,
          tax_amount: taxNumber,
          expense_account_id: categoryAccountId || undefined
        });
      }

      if (hasDp) {
        const paymentPayload = {
          payment_date: date,
          amount: dpAmount,
          account_id: dpAccountId,
          notes: dpNotes || "DP saat pembuatan invoice"
        };
        if (isAr) {
          await payArInvoice(created.id, paymentPayload);
        } else {
          await payApBill(created.id, paymentPayload);
        }
      }

      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">
            {isEditing ? `Edit ${isAr ? "Invoice" : "Tagihan"}` : isAr ? "Invoice Baru" : "Tagihan Baru"}
          </h3>
          <button className="text-slate-500 hover:text-ink" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}

          <label className="block">
            <span className="text-xs font-medium text-slate-600">{contactLabel}</span>
            <div className="mt-1 flex gap-2">
              <select
                className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                value={contactId}
                onChange={(event) => setContactId(event.target.value)}
              >
                <option value="">Pilih {contactLabel.toLowerCase()}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsAddingContact(true)}
                className="inline-flex h-10 shrink-0 items-center rounded-md border border-line px-3 text-sm text-slate-600 hover:bg-slate-50"
              >
                + Baru
              </button>
            </div>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Tanggal</span>
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Jatuh Tempo</span>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Judul / Deskripsi {isAr ? "Invoice" : "Tagihan"}</span>
            <input
              type="text"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={isAr ? "mis. Pengadaan perangkat kantor" : "mis. Pembelian bahan baku"}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Rincian Item</span>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Plus size={12} aria-hidden="true" /> Tambah Item
              </button>
            </div>

            <div className="overflow-hidden rounded-md border border-line">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-2 text-left font-medium">No</th>
                    <th className="px-2 py-2 text-left font-medium">Deskripsi</th>
                    <th className="w-16 px-2 py-2 text-right font-medium">Qty</th>
                    <th className="w-28 px-2 py-2 text-right font-medium">Harga Satuan</th>
                    <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(event) => updateItem(index, { description: event.target.value })}
                          placeholder="Nama barang/jasa"
                          className="h-8 w-full rounded border border-line px-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.qty}
                          onChange={(event) => updateItem(index, { qty: event.target.value })}
                          className="h-8 w-full rounded border border-line px-2 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                          className="h-8 w-full rounded border border-line px-2 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{formatCurrency(lineTotals[index] || 0)}</td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          disabled={items.length <= 1}
                          className="text-slate-400 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                          title="Hapus baris"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-line bg-slate-50 px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Diskon (Rp)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                  placeholder="0"
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Pajak / PPN (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxPercent}
                  onChange={(event) => setTaxPercent(event.target.value)}
                  placeholder="0"
                  className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                />
              </label>
            </div>

            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="text-ink">{formatCurrency(subtotal)}</dd>
              </div>
              {discountNumber > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Diskon</dt>
                  <dd className="text-ink">-{formatCurrency(discountNumber)}</dd>
                </div>
              )}
              {taxNumber > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Pajak ({taxPercentNumber}%)</dt>
                  <dd className="text-ink">{formatCurrency(taxNumber)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-line pt-1.5 text-base font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink">{formatCurrency(grandTotal)}</dd>
              </div>
            </dl>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">{categoryLabel}</span>
            <select
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              value={categoryAccountId}
              onChange={(event) => setCategoryAccountId(event.target.value)}
            >
              <option value="">Default ({isAr ? "Penjualan Barang Dagang" : "Persediaan Barang Dagang"})</option>
              {categoryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.account_name}
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-slate-500">
            {isAr
              ? "Jurnal otomatis: debit Piutang Usaha, kredit akun pendapatan di atas sebesar Total di atas."
              : "Jurnal otomatis: debit akun di atas, kredit Utang Usaha sebesar Total di atas."}
          </p>

          {!isEditing && (
            <>
              <label className="flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={hasDp}
                  onChange={(event) => setHasDp(event.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand focus:ring-teal-100"
                />
                <span className="text-sm font-medium text-slate-700">
                  {isAr ? "Sudah terima DP / pembayaran awal?" : "Sudah bayar DP / pembayaran awal?"}
                </span>
              </label>

              {hasDp && (
                <div className="space-y-3 rounded-md border border-line px-3 py-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Jumlah DP (Rp)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required={hasDp}
                        value={dpAmount}
                        onChange={(event) => setDpAmount(event.target.value)}
                        className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                      />
                      {dpExceedsAmount && (
                        <span className="mt-1 block text-xs text-danger">Melebihi jumlah {isAr ? "invoice" : "tagihan"}.</span>
                      )}
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Akun Kas/Bank Tujuan</span>
                      <select
                        className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                        value={dpAccountId}
                        onChange={(event) => setDpAccountId(event.target.value)}
                      >
                        <option value="">Pilih akun</option>
                        {moneyAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_code} - {account.account_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Catatan DP (opsional)</span>
                    <input
                      type="text"
                      value={dpNotes}
                      onChange={(event) => setDpNotes(event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    Sisa piutang/utang akan otomatis berstatus "Dibayar Sebagian" setelah invoice/tagihan ini disimpan.
                  </p>
                </div>
              )}
            </>
          )}

          {needsPasswordConfirm && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-xs text-amber-700">
                {isAr ? "Invoice" : "Tagihan"} ini sudah ada pembayaran tercatat ({formatCurrency(editItem?.paid_amount ?? 0)}).
                Masukkan password akun kamu untuk konfirmasi sebelum menyimpan perubahan.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Password Konfirmasi</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="current-password"
                  className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                />
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving
              ? "Menyimpan..."
              : isEditing
                ? "Simpan Perubahan & Perbarui Jurnal"
                : `Simpan ${isAr ? "Invoice" : "Tagihan"}${hasDp ? " + DP" : ""} & Posting Jurnal`}
          </button>
        </form>
      </div>

      {isAddingContact && (
        <QuickAddContactForm
          contactType={contactType}
          onClose={() => setIsAddingContact(false)}
          onCreated={(contact) => {
            setIsAddingContact(false);
            setContactId(String(contact.id));
            onContactsChanged();
          }}
        />
      )}
    </div>
  );
}

function PaymentForm({
  kind,
  item,
  moneyAccounts,
  onClose,
  onPaid
}: {
  kind: "ar" | "ap";
  item: InvoiceOrBill;
  moneyAccounts: Account[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const isAr = kind === "ar";
  const no = "invoice_no" in item ? item.invoice_no : item.bill_no;
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState(String(item.balance));
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!accountId) {
      setError("Akun kas/bank wajib dipilih.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = { payment_date: paymentDate, amount, account_id: accountId, notes: notes || undefined };
      if (isAr) {
        await payArInvoice(item.id, payload);
      } else {
        await payApBill(item.id, payload);
      }
      onPaid();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyimpan pembayaran.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-md bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">{isAr ? "Terima Pembayaran" : "Bayar Tagihan"} — {no}</h3>
          <button className="text-slate-500 hover:text-ink" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <p className="text-sm text-slate-600">
            {item.contact_name} — sisa <span className="font-semibold text-ink">{formatCurrency(item.balance)}</span>
          </p>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Tanggal {isAr ? "Terima" : "Bayar"}</span>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Jumlah (Rp)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              max={item.balance}
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Akun Kas/Bank Tujuan</span>
            <select
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Pilih akun</option>
              {moneyAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.account_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Catatan (opsional)</span>
            <input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Menyimpan..." : "Simpan & Posting Jurnal"}
          </button>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// Laporan Umur Piutang/Utang (Aging Report)
// =====================================================================

function AgingReportSection() {
  const [type, setType] = useState<"ar" | "ap">("ar");
  const [asOfDate, setAsOfDate] = useState(today());
  const [report, setReport] = useState<AgingReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchAgingReport(type, asOfDate)
      .then(setReport)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat laporan."))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, asOfDate]);

  const bucketKeys: AgingBucketKey[] = ["belum_jatuh_tempo", "1_30", "31_60", "61_90", "90_plus"];

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-md border border-line p-1 text-xs">
            <button
              type="button"
              onClick={() => setType("ar")}
              className={["rounded px-3 py-1.5 font-medium transition", type === "ar" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"].join(" ")}
            >
              Umur Piutang
            </button>
            <button
              type="button"
              onClick={() => setType("ap")}
              className={["rounded px-3 py-1.5 font-medium transition", type === "ap" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"].join(" ")}
            >
              Umur Utang
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            Per tanggal
            <input
              type="date"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
              className="h-9 rounded-md border border-line px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
        </div>
      </section>

      {isLoading && <p className="text-sm text-slate-500">Memuat laporan...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

      {!isLoading && !error && report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {bucketKeys.map((key) => (
              <div key={key} className="rounded-md border border-line bg-white p-3 shadow-sm">
                <p className="text-xs text-slate-500">{bucketLabels[key]}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{formatCurrency(report.buckets[key])}</p>
              </div>
            ))}
          </div>

          <section className="rounded-md border border-line bg-white shadow-sm">
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-base font-semibold text-ink">
                Total {type === "ar" ? "Piutang" : "Utang"} Terbuka: {formatCurrency(report.total)}
              </h3>
              <p className="text-xs text-slate-500">Per {formatDateID(report.as_of_date)}, dikelompokkan per pelanggan/supplier.</p>
            </div>

            {report.by_contact.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Tidak ada {type === "ar" ? "piutang" : "utang"} terbuka.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{type === "ar" ? "Pelanggan" : "Supplier"}</th>
                      {bucketKeys.map((key) => (
                        <th className="px-4 py-3 text-right" key={key}>
                          {bucketLabels[key]}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.by_contact.map((row) => (
                      <tr className="border-t border-line" key={row.contact_id}>
                        <td className="px-4 py-3 font-medium text-ink">{row.contact_name}</td>
                        {bucketKeys.map((key) => (
                          <td className="px-4 py-3 text-right text-slate-600" key={key}>
                            {row[key] > 0 ? formatCurrency(row[key]) : "—"}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-semibold text-ink">{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold text-ink">
                      <td className="px-4 py-3">Total</td>
                      {bucketKeys.map((key) => (
                        <td className="px-4 py-3 text-right" key={key}>
                          {formatCurrency(report.buckets[key])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">{formatCurrency(report.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// =====================================================================
// Kontak (Pelanggan / Supplier)
// =====================================================================

function ContactsSection({
  customers,
  suppliers,
  onChanged,
  canManage
}: {
  customers: Contact[];
  suppliers: Contact[];
  onChanged: () => void;
  canManage: boolean;
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<ContactType>("customer");

  return (
    <div className="space-y-4">
      {([
        { type: "customer" as const, title: "Pelanggan (Wholesale/Reseller)", list: customers },
        { type: "supplier" as const, title: "Supplier (Kain/Bahan Baku)", list: suppliers }
      ]).map((group) => (
        <section key={group.type} className="rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand" aria-hidden="true" />
              <h3 className="text-base font-semibold text-ink">{group.title}</h3>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setDefaultType(group.type);
                  setIsFormOpen(true);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Plus size={14} aria-hidden="true" />
                Tambah
              </button>
            )}
          </div>

          {group.list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Belum ada kontak.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse text-sm">
                <thead className="bg-panel text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">Telepon</th>
                    <th className="px-4 py-3">Alamat</th>
                  </tr>
                </thead>
                <tbody>
                  {group.list.map((contact) => (
                    <tr className="border-t border-line" key={contact.id}>
                      <td className="px-4 py-3 font-medium text-ink">{contact.name}</td>
                      <td className="px-4 py-3 text-slate-600">{contact.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{contact.address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {isFormOpen && (
        <QuickAddContactForm
          contactType={defaultType}
          onClose={() => setIsFormOpen(false)}
          onCreated={() => {
            setIsFormOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function QuickAddContactForm({
  contactType,
  onClose,
  onCreated
}: {
  contactType: ContactType;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}) {
  const [type, setType] = useState<ContactType>(contactType);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const contact = await createContact({
        contact_type: type,
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined
      });
      onCreated(contact);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyimpan kontak.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-md bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Kontak Baru</h3>
          <button className="text-slate-500 hover:text-ink" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Tipe</span>
            <select
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
              value={type}
              onChange={(event) => setType(event.target.value as ContactType)}
            >
              <option value="customer">Pelanggan</option>
              <option value="supplier">Supplier</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Nama</span>
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Telepon (opsional)</span>
            <input
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Alamat (opsional)</span>
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Menyimpan..." : "Simpan Kontak"}
          </button>
        </form>
      </div>
    </div>
  );
}
