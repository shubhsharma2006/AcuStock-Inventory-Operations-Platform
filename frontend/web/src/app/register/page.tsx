"use client";

import { useState, useMemo, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

function generateSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

export default function RegisterTenantPage() {
  const router = useRouter();

  // Form State
  const [workspaceName, setWorkspaceName] = useState("");
  const [industry, setIndustry] = useState("Manufacturing & Assembly");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Status & Error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPayload, setSuccessPayload] = useState<{
    workspaceName: string;
    slug: string;
    adminEmail: string;
  } | null>(null);

  // Dynamic Workspace Slug
  const slug = useMemo(() => {
    return generateSlug(workspaceName) || "your-workspace";
  }, [workspaceName]);

  // Password strength score (0 to 4)
  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workspaceName.trim() || !adminName.trim() || !email.trim() || !password) {
      setError("Please complete all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!agreeTerms) {
      setError("Please accept the Terms of Service & Privacy Policy to continue.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<{
        success: boolean;
        message: string;
        tenant: { name: string; slug: string };
        admin: { email: string };
      }>("/auth/register-tenant", {
        method: "POST",
        body: JSON.stringify({
          workspaceName: workspaceName.trim(),
          adminName: adminName.trim(),
          email: email.trim().toLowerCase(),
          password,
          industry,
          currency,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        }),
      });

      if (response.success) {
        setSuccessPayload({
          workspaceName: response.tenant.name,
          slug: response.tenant.slug,
          adminEmail: response.admin.email,
        });

        // Smooth redirect to admin dashboard
        setTimeout(() => {
          router.push("/dashboard/admin");
          router.refresh();
        }, 1800);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create organization workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 p-4 sm:p-6 lg:p-8 overflow-hidden font-sans">
      {/* Dynamic Background Glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-[700px] rounded-full bg-gradient-to-tr from-amber-500/15 to-orange-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 h-96 w-96 rounded-full bg-gradient-to-br from-teal-500/10 to-emerald-500/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 font-black text-slate-950 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              A
            </div>
            <span className="text-2xl font-black tracking-tight text-white">
              Acu<span className="text-amber-400">Stock</span>
            </span>
          </Link>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-0.5 text-xs font-semibold text-amber-300 uppercase tracking-wider">
            <span>🚀 14-Day Enterprise Free Trial</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Create Your SaaS Organization
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Provision a dedicated multi-tenant workspace with isolated data, automated ledger, and role-based policies.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-6">
          {successPayload ? (
            <div className="py-12 text-center space-y-4 animate-scale-up">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 text-4xl shadow-xl">
                ✨
              </div>
              <h2 className="text-2xl font-black text-white">Workspace Provisioned!</h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                Welcome, <strong className="text-amber-300">{successPayload.workspaceName}</strong>. Your isolated workspace (
                <span className="font-mono text-emerald-400">https://{successPayload.slug}.acustock.com</span>) is initialized.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 pt-4">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Redirecting you to the Admin Dashboard…
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-xs font-medium text-rose-200 flex items-start gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Section 1: Workspace Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 border-b border-white/10 pb-2">
                  1. Organization & Workspace
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Company / Organization Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Industrial Supplies"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Primary Industry
                    </label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                    >
                      <option value="Manufacturing & Assembly">Manufacturing & Assembly</option>
                      <option value="Retail & Consumer Goods">Retail & Consumer Goods</option>
                      <option value="Logistics & Warehousing">Logistics & Warehousing</option>
                      <option value="Electronics & Hardware">Electronics & Hardware</option>
                      <option value="Healthcare & Pharma">Healthcare & Pharma</option>
                      <option value="E-Commerce & D2C">E-Commerce & D2C</option>
                      <option value="Automotive & Spare Parts">Automotive & Spare Parts</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Subdomain URL Preview */}
                <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">Workspace Subdomain URL:</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    https://{slug}.acustock.com
                  </span>
                </div>
              </div>

              {/* Section 2: Administrator Credentials */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 border-b border-white/10 pb-2">
                  2. Primary Administrator Account
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Admin Full Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Jenkins"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Work Email <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="sarah@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Master Password <span className="text-amber-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">Minimum 8 characters</span>
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                  />

                  {/* Password Strength Meter */}
                  {password.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex h-1.5 flex-1 gap-1">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`h-full flex-1 rounded-full transition-all ${
                              step <= passwordStrength
                                ? passwordStrength <= 2
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                                : "bg-slate-800"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {passwordStrength <= 1
                          ? "Weak"
                          : passwordStrength <= 2
                          ? "Fair"
                          : passwordStrength === 3
                          ? "Good"
                          : "Strong"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Localization & Trial Package */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 border-b border-white/10 pb-2">
                  3. Trial Package & Currency
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Billing Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                    >
                      <option value="INR">₹ INR — Indian Rupee (UPI / Domestic)</option>
                      <option value="USD">$ USD — US Dollar (Global / Stripe)</option>
                    </select>
                  </div>

                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/90 leading-relaxed">
                    🎁 <strong>Trial Inclusions:</strong> 15 Team Seats, 500 Product SKUs, Full Stock Ledger & Audit capabilities without credit card upfront.
                  </div>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-2 pt-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  id="agree-terms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-slate-950 text-amber-400 focus:ring-amber-400/20"
                />
                <label htmlFor="agree-terms" className="cursor-pointer">
                  I agree to the <span className="text-white hover:underline">Terms of Service</span>,{" "}
                  <span className="text-white hover:underline">Privacy Policy</span>, and strict multi-tenant data governance.
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-300 to-orange-500 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-60 transition shadow-xl shadow-amber-500/20"
              >
                {loading ? "Provisioning Isolated Workspace…" : "Launch Workspace & Start Trial →"}
              </button>
            </form>
          )}

          {/* Footer Link */}
          <div className="border-t border-white/10 pt-4 text-center text-xs text-slate-400">
            Already have an organization workspace?{" "}
            <Link href="/login" className="font-semibold text-amber-400 hover:text-amber-300 transition">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
