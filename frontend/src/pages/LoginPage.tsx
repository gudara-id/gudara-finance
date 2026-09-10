import { useState } from "react";
import { Landmark, LogIn } from "lucide-react";
import { login } from "../lib/api";
import type { AuthUser } from "../types";

export function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("admin@gudara.id");
  const [password, setPassword] = useState("Admin12345!");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      onLogin(session.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login gagal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-5">
      <form className="w-full max-w-md rounded-md border border-line bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-brand text-white">
            <Landmark size={23} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase text-brand">Gudara</p>
            <h1 className="text-xl font-bold text-ink">Login Keuangan</h1>
          </div>
        </div>

        <label className="mb-4 block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>

        <label className="mb-5 block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}

        <button
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isSubmitting}
          type="submit"
        >
          <LogIn size={18} aria-hidden="true" />
          {isSubmitting ? "Masuk..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
