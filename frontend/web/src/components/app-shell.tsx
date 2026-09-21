"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/acustock";
import { RealtimeProvider, useRealtimeState } from "@/components/realtime-provider";
import { useNotificationsData } from "@/hooks/use-feature-data";

type NavItem = {
  label: string;
  href: string;
  badge?: string;
};

function buildNavItems(basePath: string): NavItem[] {
  return [
    { label: "Dashboard", href: basePath, badge: "Overview" },
    { label: "Products", href: `${basePath}/products` },
    { label: "Stock IN", href: `${basePath}/stock-in` },
    { label: "Stock OUT", href: `${basePath}/stock-out` },
    { label: "Stock Ledger", href: `${basePath}/stock-ledger` },
    { label: "Remaining Stock", href: `${basePath}/remaining-stock` },
    { label: "Notifications", href: `${basePath}/notifications` },
    { label: "Settings", href: `${basePath}/settings` },
  ];
}

export function AppShell({
  children,
  basePath = "/dashboard",
  title = "Modern dashboard foundation",
  subtitle = "Next.js workspace",
  user,
}: {
  children: ReactNode;
  basePath?: string;
  title?: string;
  subtitle?: string;
  user?: AuthUser | null;
}) {
  return (
    <RealtimeProvider user={user ?? ({ _id: "", role: "USER" } as AuthUser)}>
      <AppShellFrame basePath={basePath} title={title} subtitle={subtitle} user={user}>
        {children}
      </AppShellFrame>
    </RealtimeProvider>
  );
}

function AppShellFrame({
  children,
  basePath,
  title,
  subtitle,
  user,
}: {
  children: ReactNode;
  basePath: string;
  title: string;
  subtitle: string;
  user?: AuthUser | null;
}) {
  const pathname = usePathname();
  const navItems = buildNavItems(basePath);
  const { refreshToken, connected } = useRealtimeState();
  const { unreadCount } = useNotificationsData(1, 1, refreshToken);

  return (
    <div className="page-shell relative min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-[0_30px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
        <aside className="hidden w-[280px] shrink-0 border-r border-white/10 bg-slate-950/70 p-6 lg:flex lg:flex-col">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-base font-black text-slate-950 shadow-lg shadow-amber-500/20">
              A
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-white">AcuStock</div>
              <div className="text-xs text-slate-400">{subtitle}</div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition ${active ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/6 hover:text-white"}`}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
            <div className="mb-2 text-xs uppercase tracking-[0.25em] text-amber-300/90">Deployment</div>
            <p className="leading-6">
              This app is isolated from the legacy frontend and is mapped to the existing backend API.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6 lg:px-8">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/80">AcuStock Web</div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">{title}</h1>
              {user ? (
                <div className="mt-1 text-sm text-slate-400">
                  Signed in as <span className="text-white">{user.name || user.email || user.phone || "User"}</span>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`${basePath}/notifications`}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:text-white"
              >
                <span>{connected ? "●" : "○"}</span>
                <span>Notifications</span>
                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-semibold text-slate-950">
                  {unreadCount}
                </span>
              </Link>
              <Link
                href="/login"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Login
              </Link>
            </div>
          </header>

          <main className="flex-1 px-5 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
