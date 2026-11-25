"use client";

import { useState, useEffect, useMemo, type FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-validate reset token on page mount
  useEffect(() => {
    let isMounted = true;
    async function checkToken() {
      try {
        const res = await apiFetch<{ valid: boolean; userName?: string; message?: string }>("/auth/verify-reset-token", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (isMounted) {
          if (res.valid) {
            setTokenValid(true);
            setUserName(res.userName || null);
          } else {
            setTokenValid(false);
            setError(res.message || "This password reset link is invalid or has expired.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setTokenValid(false);
          setError(err?.message || "Failed to verify reset token");
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    }

    if (token) {
      checkToken();
    } else {
      setTokenValid(false);
      setVerifying(false);
      setError("No reset token provided.");
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Enterprise Password Strength Metrics
  const strength = useMemo(() => {
    let score = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password),
    };

    if (checks.length) score++;
    if (checks.uppercase && checks.lowercase) score++;
    if (checks.number) score++;
    if (checks.symbol) score++;

    return { score, checks };
  }, [password]);

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
    if (strength.score < 3) {
      setError("Please choose a stronger password containing uppercase, numbers, and symbols");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiFetch(`/auth/reset-password/${token}`, {
        method: "POST",
        body: JSON.stringify({
          password,
          newPassword: password,
        }),
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
          {verifying ? (
            <div className="text-center py-6 space-y-3">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <p className="text-sm text-slate-400">Verifying security token...</p>
            </div>
          ) : tokenValid === false ? (
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-rose-400/10 text-rose-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Link Expired or Invalid</h2>
              <p className="text-sm text-slate-400">
                {error || "This password reset link has expired or has already been used. Password reset links are valid for 15 minutes."}
              </p>
              <div className="pt-2">
                <Link
                  href="/forgot-password"
                  className="inline-block rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
                >
                  Request a new link
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">Password reset complete</h2>
              <p className="mt-2 text-sm text-slate-400">
                Your password has been successfully updated. All previous sessions have been securely terminated.
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
                {userName ? `Resetting password for ${userName}.` : "Please enter a strong password for your account."}
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
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />

                  {/* Password Strength Meter */}
                  {password && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex gap-1.5 h-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`flex-1 rounded-full transition-all duration-300 ${
                              strength.score >= step
                                ? strength.score <= 2
                                  ? "bg-rose-500"
                                  : strength.score === 3
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                                : "bg-white/10"
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 pt-1">
                        <span className={strength.checks.length ? "text-emerald-400" : ""}>
                          {strength.checks.length ? "✓" : "•"} 8+ chars
                        </span>
                        <span className={strength.checks.uppercase ? "text-emerald-400" : ""}>
                          {strength.checks.uppercase ? "✓" : "•"} Uppercase
                        </span>
                        <span className={strength.checks.number ? "text-emerald-400" : ""}>
                          {strength.checks.number ? "✓" : "•"} Number
                        </span>
                        <span className={strength.checks.symbol ? "text-emerald-400" : ""}>
                          {strength.checks.symbol ? "✓" : "•"} Symbol
                        </span>
                      </div>
                    </div>
                  )}
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
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || strength.score < 2}
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
