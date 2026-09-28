"use client";

import { DashboardMetrics } from "@/components/dashboard-metrics";
import { DashboardKpiStrip } from "@/components/dashboard-kpi-strip";
import { useAdminDashboardData } from "@/hooks/use-dashboard-data";
import { useRealtimeState } from "@/components/realtime-provider";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatCurrency(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

export function AdminDashboardView() {
  const { refreshToken } = useRealtimeState();
  const { data, loading, error } = useAdminDashboardData(true, refreshToken);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-8 text-center text-rose-200">
        Failed to load live admin operational data.
      </div>
    );
  }

  const { stats, charts, lowStockAlerts, recentActivity, topPerformers } = data;

  const maxStockIn = Math.max(...charts.stockMovement.stockIn, 1);
  const maxStockOut = Math.max(...(charts.stockMovement.stockOut || []), 1);
  const maxBar = Math.max(maxStockIn, maxStockOut, 1);

  return (
    <div className="space-y-6">
      {/* Hero Welcome */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 lg:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-bold text-slate-950">
              A
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Operations Command Center
              </h2>
              <p className="text-sm text-slate-400">
                Real-time metrics from your inventory engine
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Financial & Operational KPI Radar */}
      <DashboardKpiStrip basePath="/dashboard/admin" refreshToken={refreshToken} />

      {/* Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Products"
          value={formatCount(stats.totalProducts)}
          hint={`${stats.activeProducts} active`}
          icon="📦"
          gradient="from-sky-500/20 to-blue-600/20"
          borderColor="border-sky-500/30"
          textColor="text-sky-300"
        />
        <MetricCard
          label="Companies"
          value={formatCount(stats.totalCompanies)}
          hint={`${stats.activeCompanies} active`}
          icon="🏢"
          gradient="from-amber-500/20 to-orange-600/20"
          borderColor="border-amber-500/30"
          textColor="text-amber-300"
        />
        <MetricCard
          label="Stock Units"
          value={formatCount(stats.totalStockItems)}
          hint={`${stats.productsInStock} products in stock`}
          icon="📊"
          gradient="from-emerald-500/20 to-green-600/20"
          borderColor="border-emerald-500/30"
          textColor="text-emerald-300"
        />
        <MetricCard
          label="Today's Movement"
          value={`${formatCount(stats.stockInToday)} / ${formatCount(stats.stockOutToday)}`}
          hint={`${stats.stockInTodayCount + stats.stockOutTodayCount} entries today`}
          icon="🔄"
          gradient="from-violet-500/20 to-purple-600/20"
          borderColor="border-violet-500/30"
          textColor="text-violet-300"
        />
      </div>

      {/* Stock Movement Chart + Low Stock Alerts */}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Stock Movement</div>
              <h3 className="mt-1 text-xl font-bold tracking-tight text-white">7-Day Trend</h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Stock IN
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
                Stock OUT
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {charts.stockMovement.labels.map((label, index) => {
              const inVal = charts.stockMovement.stockIn[index] || 0;
              const outVal = charts.stockMovement.stockOut?.[index] || 0;
              const day = label.slice(5); // "2026-09-01" → "09-01"

              return (
                <div key={label} className="group rounded-xl border border-white/5 bg-slate-950/40 p-3 transition hover:border-white/10">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-mono font-medium">{day}</span>
                    <span>
                      <span className="text-emerald-400">{inVal} in</span>
                      {" / "}
                      <span className="text-rose-400">{outVal} out</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                        style={{ width: `${maxBar > 0 ? (inVal / maxBar) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-700"
                        style={{ width: `${maxBar > 0 ? (outVal / maxBar) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="rounded-[1.75rem] border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-rose-400">Low Stock Alerts</div>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white">Items needing attention</h3>
          <div className="mt-5 space-y-3">
            {lowStockAlerts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                <div className="text-2xl mb-2">✅</div>
                All products are well-stocked
              </div>
            ) : (
              lowStockAlerts.slice(0, 6).map((item) => (
                <div key={item.productId} className="rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3 transition hover:border-rose-500/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white text-sm">{item.productName}</div>
                      <div className="text-xs text-slate-500">{item.shortName || ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-rose-400">{item.currentStock} left</div>
                      <div className="text-xs text-slate-500">Reorder at {item.reorderLevel}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
                      style={{ width: `${Math.min(100, item.reorderLevel > 0 ? (item.currentStock / item.reorderLevel) * 100 : 50)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* Recent Activity + Top Performers */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">Recent Activity</div>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white">Latest stock movements</h3>
          <div className="mt-5 space-y-2">
            {recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                No recent stock movements recorded.
              </div>
            ) : (
              recentActivity.slice(0, 6).map((item) => (
                <div key={item._id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3 transition hover:border-white/10">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${item.type === "IN" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {item.type}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-white">{item.productName}</div>
                      <div className="text-xs text-slate-500">
                        {item.userName}
                        {item.companyName ? ` → ${item.companyName}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{item.quantity} units</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Top Performers</div>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white">Most active operators</h3>
          <div className="mt-5 space-y-2">
            {topPerformers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                No operator activity recorded yet.
              </div>
            ) : (
              topPerformers.slice(0, 5).map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3 transition hover:border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-sm font-bold text-amber-300">
                      #{index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-white">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.role}</div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold text-white">{item.transactions} txns</div>
                    <div className="text-slate-500">{item.totalQuantity} units</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  gradient,
  borderColor,
  textColor,
}: {
  label: string;
  value: string;
  hint: string;
  icon: string;
  gradient: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <div className={`rounded-2xl border ${borderColor} bg-gradient-to-br ${gradient} p-5 backdrop-blur-xl transition hover:scale-[1.02]`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-widest ${textColor}`}>{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{hint}</div>
    </div>
  );
}
