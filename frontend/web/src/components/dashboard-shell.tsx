"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useSession } from "@/hooks/use-session";
import { useNotificationsData } from "@/hooks/use-feature-data";
import { useRealtimeState } from "@/components/realtime-provider";
import { UserMenu } from "@/components/user-menu";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useTheme } from "@/components/theme-provider";
import { OfflineScannerCache } from "@/components/offline-scanner-cache";
import { useWorkspace } from "@/hooks/use-workspace";
import { CommandMenu } from "@/components/command-menu";
import { NotificationPopover } from "@/components/notification-popover";
import { LiveToastContainer } from "@/components/live-toast-container";
import type { Role } from "@/lib/acustock";

/* ─── Icon SVGs ─────────────────────────────────────────────────────────────── */

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const icons = {
  dashboard:   "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  analytics:   "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  products:    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  stockIn:     "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  stockOut:    "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3",
  ledger:      "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z",
  remaining:   "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  po:          "M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3",
  so:          "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
  users:       "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  companies:   "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z",
  notifications: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  settings:    "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z",
  permissions: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
  privacy:     "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  billing:     "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  menu:        "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  close:       "M6 18L18 6M6 6l12 12",
};

/* ─── Nav item types ────────────────────────────────────────────────────────── */

type NavGroup = {
  label: string;
  items: { label: string; href: string; icon: string; badge?: number; roles?: Role[] }[];
};

function buildNavGroups(basePath: string, role: Role, unread: number): NavGroup[] {
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isManager = role === "MANAGER";

  return [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", href: basePath, icon: "dashboard" },
        { label: "Analytics", href: `${basePath}/analytics`, icon: "analytics" },
        ...(isAdmin || isManager ? [{ label: "Reports Hub", href: `${basePath}/reports`, icon: "analytics" }] : []),
      ],
    },
    {
      label: "Inventory",
      items: [
        { label: "Products", href: `${basePath}/products`, icon: "products" },
        { label: "Warehouses", href: `${basePath}/warehouses`, icon: "companies" },
        { label: "Stock Transfers", href: `${basePath}/stock-transfers`, icon: "so" },
        { label: "Units of Measure", href: `${basePath}/units`, icon: "products" },
        { label: "Stock IN", href: `${basePath}/stock-in`, icon: "stockIn" },
        { label: "Stock OUT", href: `${basePath}/stock-out`, icon: "stockOut" },
        { label: "Stock Ledger", href: `${basePath}/stock-ledger`, icon: "ledger" },
        { label: "Remaining Stock", href: `${basePath}/remaining-stock`, icon: "remaining" },
        { label: "Serial Search & Audit", href: `${basePath}/serials`, icon: "products" },
        { label: "Warranty Tracking", href: `${basePath}/warranty`, icon: "privacy" },
      ],
    },
    {
      label: "Orders & Logistics",
      items: [
        { label: "Purchase Orders", href: `${basePath}/purchase-orders`, icon: "po" },
        { label: "Sales Orders", href: `${basePath}/sales-orders`, icon: "so" },
        { label: "Shipments & Logistics", href: `${basePath}/shipments`, icon: "po" },
      ],
    },
    ...(isAdmin || isManager
      ? [
          {
            label: "Management",
            items: [
              ...(isAdmin ? [{ label: "Users", href: `${basePath}/users`, icon: "users" }] : []),
              ...(isAdmin ? [{ label: "Companies", href: `${basePath}/companies`, icon: "companies" }] : []),
              ...(isAdmin ? [{ label: "Team Invites", href: `${basePath}/invites`, icon: "users" }] : []),
              { label: "Notifications", href: `${basePath}/notifications`, icon: "notifications", badge: unread > 0 ? unread : undefined },
            ],
          },
        ]
      : [
          {
            label: "Personal",
            items: [
              { label: "Notifications", href: `${basePath}/notifications`, icon: "notifications", badge: unread > 0 ? unread : undefined },
            ],
          },
        ]),
    ...(isAdmin
      ? [
          {
            label: "System",
            items: [
              { label: "SuperAdmin Control", href: `${basePath}/super-control`, icon: "permissions" },
              { label: "Audit Logs", href: `${basePath}/audit-logs`, icon: "ledger" },
              { label: "Permissions", href: `${basePath}/settings/permissions`, icon: "permissions" },
              { label: "Privacy & GDPR", href: `${basePath}/settings/privacy`, icon: "privacy" },
              { label: "Billing", href: `${basePath}/billing`, icon: "billing" },
              { label: "Settings", href: `${basePath}/settings`, icon: "settings" },
            ],
          },
        ]
      : [
          {
            label: "Account",
            items: [{ label: "Settings", href: `${basePath}/settings`, icon: "settings" }],
          },
        ]),
  ];
}

/* ─── Dashboard Shell ───────────────────────────────────────────────────────── */

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const { refreshToken, connected } = useRealtimeState();
  const { unreadCount } = useNotificationsData(1, 1, refreshToken);
  const { theme, toggleTheme } = useTheme();
  const { workspace, subdomain } = useWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const roleSlug =
    user.role === "SUPER_ADMIN" || user.role === "ADMIN"
      ? "admin"
      : user.role.toLowerCase();
  const basePath = `/dashboard/${roleSlug}`;
  const navGroups = buildNavGroups(basePath, user.role, unreadCount);

  function isActive(href: string) {
    if (href === basePath) return pathname === basePath;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebarContent = (
    <>
      {/* Logo & Workspace Brand */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/20">
          {workspace?.name ? workspace.name.charAt(0).toUpperCase() : "A"}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight text-white">
            {workspace?.name || "AcuStock"}
          </div>
          <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="truncate font-mono">{workspace?.slug ? `${workspace.slug}.acustock` : `${roleSlug.toUpperCase()} Panel`}</span>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                      active
                        ? "bg-white/10 font-medium text-white shadow-sm"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon d={(icons as Record<string, string>)[item.icon] || icons.dashboard} className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Connection indicator */}
      <div className="border-t border-white/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-600"}`} />
          {connected ? "Real-time connected" : "Connecting…"}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-white/5 bg-slate-950 transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute right-3 top-4 rounded-lg p-1 text-slate-400 hover:text-white lg:hidden"
        >
          <Icon d={icons.close} className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="relative z-40 flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-slate-950/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
            >
              <Icon d={icons.menu} className="h-5 w-5" />
            </button>
            <Breadcrumbs />
          </div>

          <div className="flex items-center gap-3">
            {/* Active Workspace Pill */}
            {workspace && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-white">{workspace.name}</span>
                <span className="text-[10px] text-amber-300 font-mono">({workspace.slug})</span>
              </div>
            )}

            {/* Global Search trigger (⌘K) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-command-menu"));
                }
              }}
              className="hidden md:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              title="Search products, serials, orders... (⌘K)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search...</span>
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">⌘K</kbd>
            </button>

            {/* Notification Center Popover */}
            <NotificationPopover basePath={basePath} />

            {/* Theme Toggle Button */}
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
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

            {/* User menu */}
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <OfflineScannerCache />
      <CommandMenu />
      <LiveToastContainer />
    </div>
  );
}
