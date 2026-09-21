import { AppShell } from "@/components/app-shell";

const modules = [
  ["Dashboard", "Stats, charts, recent activity, top performers."],
  ["Products", "Product master data, search, create, and update flows."],
  ["Stock IN / OUT", "Ledger-backed inventory movement and serial tracking."],
  ["Users / Roles", "Admin, manager, user lifecycle and permissions."],
  ["Notifications", "Unread count, live feed, and deep links."],
  ["Settings", "Serial policy, account controls, and profile tools."],
];

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Implementation slice 1
            </span>
            <span className="text-sm text-slate-400">Next.js shell mapped to the current backend</span>
          </div>

          <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            A modern base for the AcuStock dashboards.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            The new frontend lives in its own folder, keeps the legacy app intact, and is ready to
            consume the existing authenticated API surface.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {modules.map(([title, description]) => (
              <article key={title} className="soft-border rounded-3xl bg-slate-950/55 p-5">
                <div className="text-lg font-semibold text-white">{title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
          <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Backend map</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">API surfaces to wire next</h3>
          <div className="mt-6 space-y-3">
            {[
              ["/api/auth/*", "Session, login, logout, password reset"],
              ["/api/reports/*", "Dashboard analytics and summaries"],
              ["/api/stock/*", "Ledger, serials, summary, stock actions"],
              ["/api/users/*", "User management and access control"],
              ["/api/notifications/*", "Realtime list and unread badge"],
            ].map(([endpoint, description]) => (
              <div key={endpoint} className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3">
                <div className="font-mono text-sm text-amber-200">{endpoint}</div>
                <div className="mt-1 text-sm text-slate-300">{description}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
