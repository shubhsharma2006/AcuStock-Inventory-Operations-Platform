"use client";

import { useState, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type FlowStep = "REQUEST" | "OTP" | "SUCCESS";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<FlowStep>("REQUEST");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Enterprise Password Strength calculation
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

  // Step 1: Request OTP / Reset Link
  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await apiFetch<{ message: string; otpCode?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), identifier: email.trim() }),
      });
      setStep("OTP");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset code");
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP code
  async function handleResendOtp() {
    setResending(true);
    setResendStatus(null);
    setError(null);

    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), identifier: email.trim() }),
      });
      setResendStatus("A new 6-digit verification code has been dispatched to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
    }
  }

  // Step 2: Submit 6-digit OTP and New Password
  async function handleResetWithOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setError("Please enter a valid 6-digit verification code");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (strength.score < 3) {
      setError("Password is too weak. Please include uppercase, lowercase, numbers, and special characters.");
      return;
    }

    setLoading(true);

    try {
      await apiFetch("/auth/reset-password-otp", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          identifier: email.trim(),
          otp: cleanOtp,
          password,
          newPassword: password,
        }),
      });
      setStep("SUCCESS");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password. Please verify the code.");
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
          {/* STEP 3: SUCCESS CONFIRMATION */}
          {step === "SUCCESS" && (
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-white">Password Reset Successful</h2>
              <p className="mt-2 text-sm text-slate-400">
                Your password has been securely updated. All previous active sessions have been terminated.
              </p>
              <Link
                href="/login"
                className="mt-6 block w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 text-center font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-orange-400"
              >
                Sign in to your account
              </Link>
            </div>
          )}

          {/* STEP 2: INLINE 6-DIGIT OTP + NEW PASSWORD */}
          {step === "OTP" && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white">Enter 6-Digit Code</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Sent to <span className="font-semibold text-amber-300">{email}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("REQUEST");
                    setError(null);
                    setResendStatus(null);
                  }}
                  className="text-xs text-slate-400 underline hover:text-white"
                >
                  Change email
                </button>
              </div>

              {resendStatus && (
                <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-300">
                  {resendStatus}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleResetWithOtp} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="otp-input" className="mb-1 block text-sm font-medium text-slate-300">
                    6-Digit Verification Code
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-amber-300 outline-none transition placeholder:text-slate-600 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="••••••"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                    <span>Valid for 10 minutes</span>
                    <button
                      type="button"
                      disabled={resending}
                      onClick={handleResendOtp}
                      className="font-medium text-amber-400 transition hover:text-amber-300 disabled:opacity-50"
                    >
                      {resending ? "Sending…" : "Resend code"}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-300">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="••••••••"
                  />

                  {/* Password Strength Indicator */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-all ${
                              strength.score >= level
                                ? level <= 1
                                  ? "bg-rose-500"
                                  : level <= 2
                                  ? "bg-amber-500"
                                  : level <= 3
                                  ? "bg-blue-500"
                                  : "bg-emerald-500"
                                : "bg-white/10"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-400">
                        <span className={strength.checks.length ? "text-emerald-400" : ""}>• 8+ characters</span>
                        <span className={strength.checks.uppercase && strength.checks.lowercase ? "text-emerald-400" : ""}>
                          • Upper & lowercase
                        </span>
                        <span className={strength.checks.number ? "text-emerald-400" : ""}>• Numbers</span>
                        <span className={strength.checks.symbol ? "text-emerald-400" : ""}>• Special characters</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Resetting password…" : "Reset password"}
                </button>
              </form>

              <div className="mt-5 border-t border-white/10 pt-4 text-center">
                <p className="text-xs text-slate-500">
                  Prefer direct link? You can also click the reset link sent to your email.
                </p>
                <Link href="/login" className="mt-2 inline-block text-sm text-slate-400 hover:text-white">
                  ← Back to sign in
                </Link>
              </div>
            </div>
          )}

          {/* STEP 1: INITIAL EMAIL ENTRY */}
          {step === "REQUEST" && (
            <>
              <h1 className="text-xl font-bold text-white">Reset your password</h1>
              <p className="mt-1 text-sm text-slate-400">
                Enter your registered email. We&apos;ll dispatch a 6-digit OTP and reset link.
              </p>

              <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Email address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="you@company.com"
                    autoComplete="email"
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
                  className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending code…" : "Send verification code"}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-slate-400">
                Remember your password?{" "}
                <Link href="/login" className="font-medium text-amber-300 transition hover:text-amber-200">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
