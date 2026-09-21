"use client";

import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Role } from "@/lib/acustock";

/* ─── Role 1: SUPER_ADMIN Dashboard Home ────────────────────────────────────── */

export function SuperAdminDashboardView() {
  const { user } = useSession();

  const { data: sessionsData } = useQuery<{ activeCount: number }>({
    queryKey: ["superadmin-sessions-count"],
    queryFn: () => apiFetch<{ activeCount: number }>("/superadmin/active-sessions"),
  });

  const { data: usersData } = useQuery<{ users: unknown[] }>({
    queryKey: ["superadmin-users-count"],
    queryFn: () => apiFetch<{ users: unknown[] }>("/superadmin/users"),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/10 via-slate-900/60 to-slate-950 p-6 backdrop-blur-xl sm:p-8">
        <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
          👑 SuperAdmin Control Center
        </div>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          Welcome back, {user?.name || "Super Admin"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          You have full platform sovereignty. Manage system admins, configure per-user ID custom permissions, monitor active sessions, and oversee tenant isolation.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/super_admin/super-control"
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
          >
            Launch SuperAdmin Control Center
          </Link>
          <Link
            href="/dashboard/super_admin/audit-logs"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            View System Audit Logs
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-slate-400">Total Registered Users</div>
          <div className="mt-2 text-3xl font-bold text-white">{usersData?.users?.length || 0}</div>
          <div className="mt-1 text-xs text-slate-400">Across all system roles</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-emerald-400">Active Online Sessions</div>
          <div className="mt-2 text-3xl font-bold text-emerald-300">{sessionsData?.activeCount || 0}</div>
          <div className="mt-1 text-xs text-slate-400">Live active sessions</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-sky-400">RBAC Security Level</div>
          <div className="mt-2 text-3xl font-bold text-sky-300">4-Role Enforced</div>
          <div className="mt-1 text-xs text-slate-400">ID-based granular permission builder active</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Role 3: MANAGER Dashboard Home ───────────────────────────────────────── */

export function ManagerDashboardView() {
  const { user } = useSession();

  const { data: myData } = useQuery<{ summary?: { totalStockIn: number; totalStockOut: number; stockInCount: number; stockOutCount: number } }>({
    queryKey: ["my-manager-activity"],
    queryFn: () => apiFetch("/reports/my-activity"),
  });

  const summary = myData?.summary;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-400/10 via-slate-900/60 to-slate-950 p-6 backdrop-blur-xl sm:p-8">
        <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
          📋 Manager Workspace
        </div>
        <h1 className="mt-3 text-3xl font-bold text-white">
          Warehouse & Operations Hub — {user?.name || "Manager"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Manage day-to-day warehouse operations, execute stock IN/OUT transactions, process Purchase & Sales Orders, and oversee carrier logistics.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/manager/stock-in"
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
          >
            + New Stock IN
          </Link>
          <Link
            href="/dashboard/manager/stock-out"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            - New Stock OUT
          </Link>
          <Link
            href="/dashboard/manager/purchase-orders"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Purchase Orders
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-emerald-400">Total Stock In</div>
          <div className="mt-2 text-2xl font-bold text-white">{summary?.totalStockIn || 0} units</div>
          <div className="mt-1 text-xs text-slate-400">{summary?.stockInCount || 0} entries</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-sky-400">Total Stock Out</div>
          <div className="mt-2 text-2xl font-bold text-white">{summary?.totalStockOut || 0} units</div>
          <div className="mt-1 text-xs text-slate-400">{summary?.stockOutCount || 0} dispatches</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-amber-300">Quick Links</div>
          <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-300">
            <Link href="/dashboard/manager/remaining-stock" className="hover:text-amber-300">→ Check Remaining Stock</Link>
            <Link href="/dashboard/manager/stock-ledger" className="hover:text-amber-300">→ Stock Movement Ledger</Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-purple-300">Orders & Logistics</div>
          <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-300">
            <Link href="/dashboard/manager/sales-orders" className="hover:text-purple-300">→ Manage Sales Orders</Link>
            <Link href="/dashboard/manager/shipments" className="hover:text-purple-300">→ Carrier Shipments</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Role 4: USER Dashboard Home ─────────────────────────────────────────── */

export function UserDashboardView() {
  const { user } = useSession();

  const { data: myData } = useQuery<{ summary?: { totalStockIn: number; totalStockOut: number; stockInCount: number; stockOutCount: number } }>({
    queryKey: ["my-user-activity"],
    queryFn: () => apiFetch("/reports/my-activity"),
  });

  const summary = myData?.summary;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-purple-400/20 bg-gradient-to-r from-purple-400/10 via-slate-900/60 to-slate-950 p-6 backdrop-blur-xl sm:p-8">
        <div className="inline-flex rounded-full border border-purple-400/30 bg-purple-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-200">
          👤 Fulfillment Specialist
        </div>
        <h1 className="mt-3 text-3xl font-bold text-white">
          Inventory Specialist Hub — {user?.name || "User"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          Execute assigned stock movements, search available serial numbers, view inventory catalog, and manage shipments assigned to your workspace.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/user/stock-in"
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
          >
            + Stock IN Entry
          </Link>
          <Link
            href="/dashboard/user/stock-out"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            - Dispatch Stock OUT
          </Link>
          <Link
            href="/dashboard/user/products"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Browse Products
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-emerald-400">My Stock IN Entries</div>
          <div className="mt-2 text-3xl font-bold text-white">{summary?.stockInCount || 0}</div>
          <div className="mt-1 text-xs text-slate-400">{summary?.totalStockIn || 0} total units added</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-sky-400">My Stock OUT Dispatches</div>
          <div className="mt-2 text-3xl font-bold text-white">{summary?.stockOutCount || 0}</div>
          <div className="mt-1 text-xs text-slate-400">{summary?.totalStockOut || 0} total units dispatched</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-amber-300">Quick Actions</div>
          <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-300">
            <Link href="/dashboard/user/remaining-stock" className="hover:text-amber-300">→ Check Available Stock</Link>
            <Link href="/dashboard/user/warranty" className="hover:text-amber-300">→ Lookup Serial Warranty</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Generic Fallback Page ─────────────────────────────────────────────────── */

export function DashboardPage({ role }: { role: Role }) {
  if (role === "SUPER_ADMIN") return <SuperAdminDashboardView />;
  if (role === "MANAGER") return <ManagerDashboardView />;
  if (role === "USER") return <UserDashboardView />;
  return null;
}
