import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import type { PageKey } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { JournalHubPage } from "./pages/JournalHubPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SalesDashboardPage } from "./pages/SalesDashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LedgerPage } from "./pages/LedgerPage";
import { AssetsPage } from "./pages/AssetsPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { FinancialReportsPage } from "./pages/FinancialReportsPage";
import { BudgetPage } from "./pages/BudgetPage";
import { PiutangUtangPage } from "./pages/PiutangUtangPage";
import { BookClosingPage } from "./pages/BookClosingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { getMe, logout } from "./lib/api";
import { loadAppSettings } from "./lib/settings";
import type { AuthUser } from "./types";

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [activePage, setActivePage] = useState<PageKey>(() => loadAppSettings().landingPage);

  useEffect(() => {
    if (!localStorage.getItem("gudara_access_token")) {
      setIsLoadingSession(false);
      return;
    }

    getMe()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setIsLoadingSession(false));
  }, []);

  if (isLoadingSession) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">Memuat sesi...</div>;
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  // Role "sales" hanya boleh mengakses Dashboard, Piutang & Utang, dan Profil.
  // Kalau ada preferensi landing page tersimpan (localStorage) yang di luar
  // itu (mis. "laporan"), paksa kembali ke dashboard supaya tidak blank.
  const salesAllowedPages: PageKey[] = ["dashboard", "piutang-utang", "profil"];
  const effectivePage: PageKey =
    user.role === "sales" && !salesAllowedPages.includes(activePage) ? "dashboard" : activePage;

  return (
    <Layout
      user={user}
      activePage={effectivePage}
      onNavigate={setActivePage}
      onLogout={() => {
        logout();
        setUser(null);
      }}
    >
      {effectivePage === "dashboard" &&
        (user.role === "sales" ? <SalesDashboardPage user={user} /> : <DashboardPage user={user} />)}
      {effectivePage === "jurnal" && <JournalHubPage />}
      {effectivePage === "buku-besar" && <LedgerPage />}
      {effectivePage === "aset" && <AssetsPage />}
      {effectivePage === "marketplace" && <MarketplacePage />}
      {effectivePage === "piutang-utang" && <PiutangUtangPage user={user} />}
      {effectivePage === "anggaran" && <BudgetPage />}
      {effectivePage === "laporan" && <FinancialReportsPage />}
      {effectivePage === "tutup-buku" && <BookClosingPage user={user} />}
      {effectivePage === "pengaturan" && <SettingsPage user={user} />}
      {effectivePage === "profil" && (
        <ProfilePage
          user={user}
          onLogout={() => { logout(); setUser(null); }}
          onProfileUpdated={setUser}
        />
      )}
    </Layout>
  );
}
