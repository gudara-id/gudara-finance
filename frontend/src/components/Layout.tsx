import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  FileText,
  Gauge,
  Landmark,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PiggyBank,
  Search,
  Settings,
  ShoppingBag,
  UserCircle,
  Users
} from "lucide-react";
import type { AuthUser } from "../types";
import { loadAppSettings } from "../lib/settings";

export type PageKey =
  | "dashboard"
  | "jurnal"
  | "buku-besar"
  | "aset"
  | "marketplace"
  | "piutang-utang"
  | "anggaran"
  | "laporan"
  | "tutup-buku"
  | "pengaturan"
  | "profil";

const menuGroups: { title: string; items: { key: PageKey; label: string; icon: typeof Gauge }[] }[] = [
  {
    title: "Workspace",
    items: [{ key: "dashboard", label: "Dashboard", icon: Gauge }]
  },
  {
    title: "Operasional",
    items: [
      { key: "jurnal", label: "Jurnal", icon: FileText },
      { key: "marketplace", label: "Marketplace", icon: ShoppingBag },
      { key: "piutang-utang", label: "Piutang & Utang", icon: Users },
      { key: "anggaran", label: "Anggaran", icon: PiggyBank }
    ]
  },
  {
    title: "Akuntansi",
    items: [
      { key: "buku-besar", label: "Buku Besar", icon: BookOpen },
      { key: "aset", label: "Daftar Aset", icon: Boxes },
      { key: "laporan", label: "Laporan Keuangan", icon: BarChart3 },
      { key: "tutup-buku", label: "Tutup Buku", icon: Lock },
      { key: "pengaturan", label: "Pengaturan", icon: Settings }
    ]
  }
];

// Role "sales" hanya boleh melihat Dashboard (ringkasan Piutang & Utang),
// menu Piutang & Utang itu sendiri, dan halaman Profil miliknya.
const salesMenuGroups: { title: string; items: { key: PageKey; label: string; icon: typeof Gauge }[] }[] = [
  {
    title: "Workspace",
    items: [
      { key: "dashboard", label: "Dashboard", icon: Gauge },
      { key: "piutang-utang", label: "Piutang & Utang", icon: Users }
    ]
  },
  {
    title: "Akun",
    items: [{ key: "profil", label: "Profil", icon: UserCircle }]
  }
];

const pageTitles: Record<PageKey, { section: string; title: string }> = {
  dashboard: { section: "Ringkasan", title: "Dashboard" },
  jurnal: { section: "Transaksi", title: "Jurnal" },
  "buku-besar": { section: "Akuntansi", title: "Buku Besar" },
  aset: { section: "Akuntansi", title: "Daftar Aset" },
  marketplace: { section: "Transaksi", title: "Marketplace" },
  "piutang-utang": { section: "Transaksi", title: "Piutang & Utang" },
  anggaran: { section: "Perencanaan", title: "Anggaran" },
  laporan: { section: "Laporan", title: "Laporan Keuangan" },
  "tutup-buku": { section: "Akuntansi", title: "Tutup Buku" },
  pengaturan: { section: "Sistem", title: "Pengaturan" },
  profil: { section: "Akun", title: "Profil" }
};

export function Layout({
  children,
  user,
  onLogout,
  activePage,
  onNavigate
}: {
  children: ReactNode;
  user: AuthUser;
  onLogout: () => void;
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
}) {
  const { section, title } = pageTitles[activePage];
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [appSettings, setAppSettings] = useState(() => loadAppSettings());
  const visibleMenuGroups = user.role === "sales" ? salesMenuGroups : menuGroups;

  useEffect(() => {
    const handleSettingsChange = () => setAppSettings(loadAppSettings());
    window.addEventListener("gudara-settings-change", handleSettingsChange);
    return () => window.removeEventListener("gudara-settings-change", handleSettingsChange);
  }, []);

  return (
    <div className="min-h-screen lg:flex">
      {isSidebarOpen && (
      <aside className="border-b border-white/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:fixed lg:inset-y-4 lg:left-4 lg:w-72 lg:rounded-lg lg:border">
        <div className="flex h-20 items-center gap-3 border-b border-slate-200/80 px-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white shadow-lg shadow-slate-900/15">
            <Landmark size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase text-slate-500">{appSettings.legalName}</p>
            <h1 className="truncate text-base font-bold text-ink">{appSettings.companyName} Finance</h1>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
            onClick={() => setIsSidebarOpen(false)}
            title="Tutup sidebar"
            type="button"
          >
            <PanelLeftClose size={17} aria-hidden="true" />
          </button>
        </div>

        <nav className="app-scrollbar flex gap-3 overflow-x-auto px-3 py-3 lg:block lg:space-y-5 lg:overflow-visible">
          {visibleMenuGroups.map((group) => (
            <div key={group.title} className="min-w-max lg:min-w-0">
              <p className="mb-2 hidden px-3 text-[11px] font-bold uppercase text-slate-400 lg:block">{group.title}</p>
              <div className="flex gap-2 lg:block lg:space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === activePage;

                  return (
                    <button
                      key={item.key}
                      className={[
                        "flex min-h-11 w-full shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
                        isActive
                          ? "bg-ink text-white shadow-lg shadow-slate-900/15"
                          : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                      ].join(" ")}
                      onClick={() => onNavigate(item.key)}
                      type="button"
                      title={item.label}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-4 hidden rounded-lg border border-slate-200 bg-slate-50/80 p-4 lg:block">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Building2 size={17} aria-hidden="true" />
            Sistem Aktif
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            <span>Basis laporan</span>
            <strong className="text-right capitalize text-slate-700">{appSettings.defaultReportBasis}</strong>
            <span>Lingkungan</span>
            <strong className="text-right capitalize text-slate-700">{appSettings.apiEnvironment}</strong>
          </div>
        </div>
      </aside>
      )}

      <main className={["flex-1 transition-[margin]", isSidebarOpen ? "lg:ml-80" : "lg:ml-0"].join(" ")}>
        <header className="sticky top-0 z-10 border-b border-white/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                onClick={() => setIsSidebarOpen((current) => !current)}
                title={isSidebarOpen ? "Tutup sidebar" : "Buka sidebar"}
                type="button"
              >
                <Menu size={18} aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-500">{section}</p>
                <h2 className="truncate text-xl font-bold text-ink">{title}</h2>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden h-10 min-w-64 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm md:flex">
                <Search size={16} aria-hidden="true" />
                <span className="truncate">Cari laporan, jurnal, akun...</span>
              </div>
              <div className="hidden rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm sm:block">
                {user.full_name} / {user.role}
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                onClick={onLogout}
                title="Logout"
                type="button"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-6">{children}</div>
      </main>
    </div>
  );
}
