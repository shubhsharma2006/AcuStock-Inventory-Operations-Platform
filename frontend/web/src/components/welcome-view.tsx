"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useProfileData } from "@/hooks/use-feature-data";
import type { Role } from "@/lib/acustock";

type WelcomeSummary = {
  totalItems: number;
  lowStockCount: number;
  unreadNotifications: number;
  tenantName: string;
};

export function WelcomeView({ role }: { role: Role }) {
  const router = useRouter();
  const { profile } = useProfileData();
  const [summary, setSummary] = useState<WelcomeSummary>({
    totalItems: 0,
    lowStockCount: 0,
    unreadNotifications: 0,
    tenantName: "AcuStock Enterprise",
  });
  const [loading, setLoading] = useState(true);
  const [skipEveryLogin, setSkipEveryLogin] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("acustock_skip_welcome") === "true";
    }
    return false;
  });

  const roleSlug = role.toLowerCase().replace(/_/g, "-");
  const dashboardHome = `/dashboard/${roleSlug}`;

  // Time-aware greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    async function loadSummary() {
      try {
        const [itemsRes, notifRes] = await Promise.allSettled([
          apiFetch<any>("/items?limit=100"),
          apiFetch<any>("/notifications/unread-count"),
        ]);

        let itemsCount = 0;
        let lowCount = 0;
        if (itemsRes.status === "fulfilled" && itemsRes.value) {
          const list = Array.isArray(itemsRes.value) ? itemsRes.value : itemsRes.value.items || [];
          itemsCount = list.length;
          lowCount = list.filter((i: any) => (i.currentStock || 0) <= (i.minStockAlert || 5)).length;
        }

        let unread = 0;
        if (notifRes.status === "fulfilled" && notifRes.value) {
          unread = notifRes.value.unreadCount || 0;
        }

        setSummary({
          totalItems: itemsCount,
          lowStockCount: lowCount,
          unreadNotifications: unread,
          tenantName: "Default Organization",
        });
      } catch {
        // Fallback gracefully
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, []);

  function handleToggleSkip(checked: boolean) {
    setSkipEveryLogin(checked);
    if (typeof window !== "undefined") {
      localStorage.setItem("acustock_skip_welcome", checked ? "true" : "false");
    }
  }

  function handleContinue() {
    router.push(dashboardHome);
  }

  const roleBadgeTitle =
    role === "SUPER_ADMIN"
      ? "👑 Super Administrator (Root)"
      : role === "ADMIN"
      ? "🛡️ Organization Administrator"
      : role === "MANAGER"
      ? "👔 Operations Manager"
      : "📦 Inventory Associate";

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4 sm:py-8">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-amber-950/20 p-6 sm:p-10 shadow-2xl backdrop-blur-2xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-200">
              <span>{roleBadgeTitle}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {greeting},{" "}
              <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-orange-400 bg-clip-text text-transparent">
                {profile?.name || "Team Member"}
              </span>
              !
            </h1>

            <p className="text-sm sm:text-base leading-relaxed text-slate-300">
              Logged in as <span className="font-semibold text-white">{profile?.email || "user@acustock.internal"}</span>. Your workspace and inventory systems are synced and operational.
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-3">
            <button
              type="button"
              onClick={handleContinue}
              className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-amber-500/30 active:scale-[0.98]"
            >
              <span>Enter Main Dashboard</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>

            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none hover:text-slate-300">
              <input
                type="checkbox"
                checked={skipEveryLogin}
                onChange={(e) => handleToggleSkip(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-amber-400"
              />
              <span>Skip welcome screen on future logins</span>
            </label>
          </div>
        </div>

        {/* Live Operational Health Strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-white/10 pt-6">
          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Catalog SKUs</div>
            <div className="mt-1 text-2xl font-bold text-white">
              {loading ? "…" : summary.totalItems}
            </div>
            <div className="text-[11px] text-slate-500">Active tracked items</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Stock Alerts</div>
            <div className={`mt-1 text-2xl font-bold ${summary.lowStockCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {loading ? "…" : summary.lowStockCount}
            </div>
            <div className="text-[11px] text-slate-500">Low or out of stock</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Urgent Notifications</div>
            <div className={`mt-1 text-2xl font-bold ${summary.unreadNotifications > 0 ? "text-rose-400" : "text-slate-300"}`}>
              {loading ? "…" : summary.unreadNotifications}
            </div>
            <div className="text-[11px] text-slate-500">Unread in inbox</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">System Status</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Operational
            </div>
            <div className="text-[11px] text-slate-500">Realtime synced</div>
          </div>
        </div>
      </div>

      {/* Quick Launchpad Sections */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">🚀 Quick Operations Launchpad</h2>
          <span className="text-xs text-slate-400">Direct shortcuts to common daily workflows</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Stock IN */}
          <Link
            href={`/dashboard/${roleSlug}/stock-in`}
            className="group rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-xl">
                📥
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-amber-300">
                  Stock IN (Inbound)
                </h3>
                <p className="text-xs text-slate-400">Receive supplier shipments with OCR/barcode</p>
              </div>
            </div>
          </Link>

          {/* Card 2: Stock OUT */}
          <Link
            href={`/dashboard/${roleSlug}/stock-out`}
            className="group rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-xl">
                📤
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-amber-300">
                  Stock OUT (Dispatch)
                </h3>
                <p className="text-xs text-slate-400">Pick, serialize, and fulfill sales orders</p>
              </div>
            </div>
          </Link>

          {/* Card 3: Products Catalog */}
          <Link
            href={`/dashboard/${roleSlug}/products`}
            className="group rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-400/10 text-xl">
                🏷️
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-amber-300">
                  Products & Catalog
                </h3>
                <p className="text-xs text-slate-400">Manage SKUs, categories, and thresholds</p>
              </div>
            </div>
          </Link>

          {/* Card 4: Remaining Stock */}
          <Link
            href={`/dashboard/${roleSlug}/remaining-stock`}
            className="group rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-xl">
                📦
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-amber-300">
                  Remaining Stock & Health
                </h3>
                <p className="text-xs text-slate-400">Inspect ledger balances across warehouses</p>
              </div>
            </div>
          </Link>

          {/* Card 5: Notifications Feed */}
          <Link
            href={`/dashboard/${roleSlug}/notifications`}
            className="group rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 text-xl">
                🔔
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-amber-300">
                  Notifications & Feeds
                </h3>
                <p className="text-xs text-slate-400">Review critical warnings and team updates</p>
              </div>
            </div>
          </Link>

          {/* Card 6: Settings / SuperAdmin */}
          <Link
            href={role === "SUPER_ADMIN" ? `/dashboard/${roleSlug}/super-control` : `/dashboard/${roleSlug}/settings`}
            className="group rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-400/20 bg-slate-400/10 text-xl">
                ⚙️
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-amber-300">
                  {role === "SUPER_ADMIN" ? "SuperAdmin Control" : "Enterprise Settings"}
                </h3>
                <p className="text-xs text-slate-400">RBAC permissions, CSV export, and audits</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
