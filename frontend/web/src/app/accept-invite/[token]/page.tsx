"use client";

import { useState, useEffect, useMemo, type FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface InviteMetadata {
  valid: boolean;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "USER";
  invitedBy: string;
  expiresAt: string;
  tenantId?: string;
}

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [verifying, setVerifying] = useState(true);
  const [inviteData, setInviteData] = useState<InviteMetadata | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  // Verify Invite Token on Mount
  useEffect(() => {
    let isMounted = true;
    async function verifyInvite() {
      try {
        const data = await apiFetch<InviteMetadata>(`/invites/verify/${token}`);
        if (isMounted) {
          if (data && data.valid) {
            setInviteData(data);
          } else {
            setVerifyError("This invite link is invalid or has already been used.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setVerifyError(err?.message || "This invitation has expired or is invalid.");
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    }

    if (token) {
      verifyInvite();
    } else {
      setVerifying(false);
      setVerifyError("Missing invitation token.");
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

  async function handleAccept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    if (name.trim().length < 2) {
      setSubmitError("Please enter your full name (minimum 2 characters).");
      return;
    }

    if (inviteData?.role === "USER" && !phone.trim()) {
      setSubmitError("Phone number is required for dispatch and user assignments.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }

    if (strength.score < 3) {
      setSubmitError("Please strengthen your password by including uppercase, numbers, and symbols.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiFetch<{
        success: boolean;
        message: string;
        token?: string;
        user?: {
          id: string;
          name: string;
          email: string;
          role: string;
        };
      }>("/invites/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          name: name.trim(),
          phone: phone.trim() || undefined,
          password,
          confirmPassword,
        }),
      });

      if (res.token) {
        localStorage.setItem("token", res.token);
      }

      setOnboarded(true);

      // Auto-redirect to dashboard after brief welcome
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to complete account setup. Please check your information.");
    } finally {
      setSubmitting(false);
    }
  }

  const roleBadgeColors: Record<string, string> = {
    ADMIN: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    MANAGER: "bg-sky-400/10 text-sky-300 border-sky-400/20",
    USER: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Brand Header */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-950">
            A
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">AcuStock</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {/* STATE 1: VERIFYING INVITATION */}
          {verifying && (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <p className="mt-4 text-sm font-medium text-slate-400">Verifying your secure invitation…</p>
            </div>
          )}

          {/* STATE 2: VERIFICATION FAILED / EXPIRED */}
          {!verifying && verifyError && (
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-rose-400/10 text-rose-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">Invitation Unavailable</h2>
              <p className="mt-2 text-sm text-slate-400">{verifyError}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/login"
                  className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-6 py-2.5 text-center text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
                >
                  Go to Sign In
                </Link>
                <Link
                  href="/forgot-password"
                  className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-center text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Reset Password
                </Link>
              </div>
            </div>
          )}

          {/* STATE 3: ONBOARDING SUCCESSFUL */}
          {!verifying && onboarded && (
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-white">Account Created Successfully!</h2>
              <p className="mt-2 text-sm text-slate-400">
                Welcome to AcuStock, <span className="font-semibold text-white">{name}</span>. You have joined as an active {inviteData?.role}.
              </p>
              <p className="mt-4 text-xs text-amber-300 animate-pulse">Launching your dashboard…</p>
            </div>
          )}

          {/* STATE 4: ONBOARDING DETAILS & PASSWORD FORM */}
          {!verifying && !verifyError && !onboarded && inviteData && (
            <div>
              <div className="border-b border-white/10 pb-5">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-white">Welcome to the Team</h1>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      roleBadgeColors[inviteData.role] || "bg-white/10 text-slate-300 border-white/20"
                    }`}
                  >
                    Role: {inviteData.role}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Invited by <span className="font-semibold text-slate-200">{inviteData.invitedBy}</span>. Complete your profile details and set a secure password to activate your account.
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <span>Registered Email:</span>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-amber-300">
                    {inviteData.email}
                  </span>
                </div>
              </div>

              {submitError && (
                <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleAccept} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="full-name" className="mb-1 block text-sm font-medium text-slate-300">
                    Full Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    id="full-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-300">
                    Phone Number {inviteData.role === "USER" && <span className="text-amber-400">*</span>}
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required={inviteData.role === "USER"}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {inviteData.role === "USER" ? "Required for dispatch notifications and warehouse routing." : "Optional for account security notifications."}
                  </p>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-300">
                    Create Password <span className="text-amber-400">*</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
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
                  <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-300">
                    Confirm Password <span className="text-amber-400">*</span>
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Activating account…" : "Complete Setup & Launch Dashboard"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
