"use client";

import { useState, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { login, authenticate2fa } from "@/lib/api";
import { getRoleHome, type Role, ACUSTOCK_API_BASE_URL } from "@/lib/acustock";

const roles: Role[] = ["SUPER_ADMIN", "ADMIN", "MANAGER", "USER"];

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const oauthErrors: Record<string, string> = {
  oauth_denied: "Google sign-in was cancelled.",
  token_exchange: "Failed to authenticate with Google. Please try again.",
  userinfo_failed: "Could not retrieve your Google profile.",
  no_email: "Your Google account doesn't have an email address.",
  account_disabled: "Your account has been disabled. Contact your administrator.",
  server_error: "An unexpected error occurred. Please try again.",
  missing_params: "Authentication flow was interrupted. Please try again.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(() => {
    // Persist last-used role so user doesn't have to re-select on every visit
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("acustock_last_role") as Role | null;
      if (saved && ["SUPER_ADMIN", "ADMIN", "MANAGER", "USER"].includes(saved)) return saved;
    }
    return "SUPER_ADMIN";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA MFA Challenge State
  const oauthMfaRequired = searchParams.get("mfa") === "required";
  const [mfaPending, setMfaPending] = useState(oauthMfaRequired);
  const [tempToken, setTempToken] = useState<string | null>(oauthMfaRequired ? "oauth-cookie" : null);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const oauthError = searchParams.get("error");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await login(identifier.trim(), password, role);
      
      // Check if 2FA is required
      if (response.mfaRequired && response.tempToken) {
        setTempToken(response.tempToken);
        setMfaPending(true);
        setLoading(false);
        return;
      }

      if (response.forcePasswordReset || response.code === "FORCE_PASSWORD_RESET") {
        router.push("/reset-password");
        return;
      }

      router.push(getRoleHome(response.user.role));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tempToken || !mfaCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await authenticate2fa(tempToken, mfaCode.trim());
      router.push(getRoleHome(response.user.role));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    const googleUrl = `${ACUSTOCK_API_BASE_URL}/auth/google?role=${role}`;
    window.location.href = googleUrl;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      {/* Theme Toggle Top Right */}
      <div className="absolute right-6 top-6 z-20">
        <button
          id="login-theme-toggle"
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-all duration-200 hover:border-amber-400/40 hover:bg-white/10 hover:text-amber-300 active:scale-95"
        >
          {theme === "dark" ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      {/* Background gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-amber-500/5 blur-3xl" />
        <div className="absolute -bottom-1/4 right-0 h-[600px] w-[600px] rounded-full bg-orange-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-950 shadow-lg shadow-amber-500/20">
            A
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-white">AcuStock</div>
            <div className="text-xs text-slate-500">Inventory Management</div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <h1 className="text-xl font-semibold text-white">Sign in to your account</h1>
          <p className="mt-1 text-sm text-slate-400">
            Enter your credentials to access your workspace.
          </p>

          {/* OAuth error banner */}
          {oauthError && oauthErrors[oauthError] && (
            <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {oauthErrors[oauthError]}
            </div>
          )}

          {/* Google OAuth button */}
          {GOOGLE_CLIENT_ID && (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900/60 px-3 text-slate-500">Or continue with email</span>
                </div>
              </div>
            </>
          )}

          {mfaPending ? (
            /* 2FA MFA Challenge Form */
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
                🔐 Two-Factor Authentication required for this account.
              </div>

              <div>
                <label htmlFor="mfa-code-input" className="mb-1.5 block text-sm font-medium text-slate-300">
                  {useRecoveryCode ? "Backup Recovery Code" : "6-Digit Authentication Code"}
                </label>
                <input
                  id="mfa-code-input"
                  type="text"
                  autoFocus
                  inputMode={useRecoveryCode ? "text" : "numeric"}
                  maxLength={useRecoveryCode ? 14 : 6}
                  value={mfaCode}
                  onChange={(event) => {
                    const val = event.target.value;
                    setMfaCode(useRecoveryCode ? val.toUpperCase() : val.replace(/\D/g, "").slice(0, 6));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-center font-mono text-lg font-bold tracking-widest text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                  placeholder={useRecoveryCode ? "XXXX-XXXX-XXXX" : "000000"}
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                id="mfa-verify-submit"
                disabled={loading || !mfaCode.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify & Sign In"}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode(!useRecoveryCode);
                    setMfaCode("");
                    setError(null);
                  }}
                  className="text-xs text-amber-300/80 transition hover:text-amber-200"
                >
                  {useRecoveryCode ? "← Use 6-digit Authenticator code" : "Use a backup recovery code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaPending(false);
                    setTempToken(null);
                    setMfaCode("");
                    setError(null);
                  }}
                  className="text-xs text-slate-400 transition hover:text-slate-300"
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            /* Login form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-identifier" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Email or phone
                </label>
                <input
                  id="login-identifier"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                  placeholder="admin@acustock.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-sm font-medium text-slate-300">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs text-amber-300/80 transition hover:text-amber-200">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                    placeholder="Your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="login-role" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Role
                </label>
                <select
                  id="login-role"
                  value={role}
                  onChange={(event) => {
                    const newRole = event.target.value as Role;
                    setRole(newRole);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("acustock_last_role", newRole);
                    }
                  }}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                >
                  {roles.map((item) => (
                    <option key={item} value={item} className="bg-slate-950">
                      {item === "SUPER_ADMIN" ? "Super Admin" : item.charAt(0) + item.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
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
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-amber-300 transition hover:text-amber-200">
              Create organization workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
