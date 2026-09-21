"use client";

import { useState, type FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiFetch(`/auth/reset-password/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-950">
            A
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">AcuStock</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {success ? (
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">Password reset complete</h2>
              <p className="mt-2 text-sm text-slate-400">
                Your password has been successfully updated. You can now log in with your new credentials.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Sign in now
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white">Set new password</h1>
              <p className="mt-1 text-sm text-slate-400">
                Please enter a strong password for your account.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="reset-new-pw" className="mb-1.5 block text-sm font-medium text-slate-300">
                    New password
                  </label>
                  <input
                    id="reset-new-pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="reset-confirm-pw" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Confirm new password
                  </label>
                  <input
                    id="reset-confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="Re-enter password"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Updating..." : "Reset password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
