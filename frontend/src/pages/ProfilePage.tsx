import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, LogOut, Mail, ShieldCheck, User } from "lucide-react";
import { updateProfile } from "../lib/api";
import type { AuthUser } from "../types";

const roleLabels: Record<AuthUser["role"], string> = {
  admin: "Admin",
  akuntan: "Akuntan",
  manajemen: "Manajemen",
  sales: "Sales"
};

const roleDescriptions: Record<AuthUser["role"], string> = {
  admin: "Akses penuh ke seluruh modul aplikasi.",
  akuntan: "Mengelola jurnal, akun, dan transaksi akuntansi.",
  manajemen: "Melihat laporan keuangan dan ringkasan kinerja.",
  sales: "Dapat melihat, membuat, dan mengedit data Piutang & Utang."
};

export function ProfilePage({
  user,
  onLogout,
  onProfileUpdated
}: {
  user: AuthUser;
  onLogout: () => void;
  onProfileUpdated: (user: AuthUser) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const wantsPasswordChange = newPassword.length > 0 || confirmPassword.length > 0 || currentPassword.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (wantsPasswordChange) {
      if (newPassword.length < 10) {
        setError("Password baru minimal 10 karakter.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Konfirmasi password baru tidak sama.");
        return;
      }
      if (!currentPassword) {
        setError("Masukkan password saat ini untuk mengubah password.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const updatedUser = await updateProfile({
        full_name: fullName.trim(),
        email: email.trim(),
        ...(wantsPasswordChange
          ? { current_password: currentPassword, new_password: newPassword }
          : {})
      });
      onProfileUpdated(updatedUser);
      setSuccessMessage("Profil berhasil diperbarui.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal memperbarui profil.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-900 bg-ink text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="flex items-center gap-4 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-bold">
            {user.full_name.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xl font-bold">{user.full_name}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-slate-200">
              <ShieldCheck size={13} aria-hidden="true" />
              {roleLabels[user.role]}
            </p>
            <p className="mt-1 text-xs text-slate-300">{roleDescriptions[user.role]}</p>
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-lg border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur"
      >
        <h3 className="text-sm font-bold uppercase text-slate-500">Informasi Akun</h3>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
            <AlertCircle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <User size={14} aria-hidden="true" />
            Nama Lengkap
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Mail size={14} aria-hidden="true" />
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <KeyRound size={14} aria-hidden="true" />
            Ubah Password (opsional — kosongkan jika tidak ingin mengubah)
          </p>

          <div className="space-y-3">
            <input
              type="password"
              placeholder="Password saat ini"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-ink focus:border-brand focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password baru (min. 10 karakter)"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-ink focus:border-brand focus:outline-none"
            />
            <input
              type="password"
              placeholder="Konfirmasi password baru"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-danger transition hover:bg-red-100"
          >
            <LogOut size={16} aria-hidden="true" />
            Keluar
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}
