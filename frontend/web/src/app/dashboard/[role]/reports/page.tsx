"use client";

import { useState } from "react";
import { apiFetch, downloadAuthenticatedFile } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type UserSummary = {
  _id?: string;
  userId?: string;
  name: string;
  email: string;
  role: string;
  totalIn?: number;
  totalOut?: number;
  stockIn?: number;
  stockOut?: number;
  totalTransactions: number;
  lastActive?: string;
};

type UserActivityItem = {
  _id: string;
  type: "IN" | "OUT";
  quantity: number;
  createdAt: string;
  productId?: { name?: string; sku?: string };
  productName?: string;
  notes?: string;
  companyName?: string;
};

type StockMovementItem = {
  productId: string;
  productName: string;
  sku?: string;
  totalIn: number;
  totalOut: number;
  netChange: number;
};

type ScheduledReport = {
  _id: string;
  type: "daily_summary" | "weekly_low_stock";
  generatedAt: string;
  triggeredBy?: string;
  summary?: Record<string, unknown>;
  itemCount?: number;
};

export default function ReportsHubPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"user-activity" | "stock-velocity" | "export-center" | "scheduled">("user-activity");

  // Filter states
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Export states
  const [exportType, setExportType] = useState<"stock-ledger" | "user-activity" | "products">("stock-ledger");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportUserFilter, setExportUserFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 1. User Summary Query
  const { data: userSummaryData, isLoading: loadingSummary } = useQuery<{ success?: boolean; summary?: UserSummary[]; users?: UserSummary[] }>({
    queryKey: ["reports-user-summary"],
    queryFn: () => apiFetch<{ success?: boolean; summary?: UserSummary[]; users?: UserSummary[] }>("/reports/user-summary"),
  });

  const rawSummaryList: UserSummary[] = (userSummaryData?.summary || userSummaryData?.users || (Array.isArray(userSummaryData) ? userSummaryData : [])) as UserSummary[];

  // 2. User Specific Activity Drill-down Query
  const { data: userActivityData, isLoading: loadingActivity } = useQuery<{ success?: boolean; activity?: UserActivityItem[]; transactions?: UserActivityItem[] }>({
    queryKey: ["reports-user-drilldown", selectedUserId],
    queryFn: () =>
      selectedUserId
        ? apiFetch<{ success?: boolean; activity?: UserActivityItem[]; transactions?: UserActivityItem[] }>(`/reports/user-activity/${selectedUserId}`)
        : Promise.resolve({ activity: [] }),
    enabled: !!selectedUserId,
  });

  const activityList: UserActivityItem[] = userActivityData?.activity || userActivityData?.transactions || (Array.isArray(userActivityData) ? userActivityData : []);

  // 3. Stock Movement Query
  const { data: movementData, isLoading: loadingMovement } = useQuery<{ success?: boolean; movement?: StockMovementItem[] }>({
    queryKey: ["reports-stock-movement"],
    queryFn: () => apiFetch<{ success?: boolean; movement?: StockMovementItem[] }>("/reports/stock-movement"),
  });

  const movementList: StockMovementItem[] = movementData?.movement || (Array.isArray(movementData) ? movementData : []);

  // 4. Scheduled Reports Query
  const { data: scheduledData, isLoading: loadingScheduled } = useQuery<{ success?: boolean; reports?: ScheduledReport[] }>({
    queryKey: ["reports-scheduled"],
    queryFn: () => apiFetch<{ success?: boolean; reports?: ScheduledReport[] }>("/reports/scheduled"),
  });

  const scheduledList: ScheduledReport[] = scheduledData?.reports || [];

  // Trigger Scheduled Report Mutation
  const triggerReportMutation = useMutation({
    mutationFn: (type: "daily_summary" | "weekly_low_stock") =>
      apiFetch("/reports/scheduled/trigger", {
        method: "POST",
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-scheduled"] });
    },
  });

  // Handle Export Download
  async function handleExportDownload() {
    setIsExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      params.append("type", exportType);
      if (exportStartDate) params.append("startDate", exportStartDate);
      if (exportEndDate) params.append("endDate", exportEndDate);
      if (exportUserFilter) params.append("userId", exportUserFilter);

      const endpoint = `/reports/export?${params.toString()}`;
      await downloadAuthenticatedFile(endpoint, `${exportType}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Failed to generate export file");
    } finally {
      setIsExporting(false);
    }
  }

  const filteredUsers = rawSummaryList.filter((u) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (u.name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
            📊 Operational Intelligence & Compliance
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">Reports & Intelligence Hub</h1>
          <p className="text-sm text-slate-400">
            Audit per-operator ledger activity, monitor inventory velocity, and generate compliant CSV/Excel data exports.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab("user-activity")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "user-activity"
              ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 shadow"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white"
          }`}
        >
          👤 Operator Activity & Audits
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("stock-velocity")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "stock-velocity"
              ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 shadow"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white"
          }`}
        >
          📈 Stock Velocity & Trends
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("export-center")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "export-center"
              ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 shadow"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white"
          }`}
        >
          📥 Asynchronous Export Center
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scheduled")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "scheduled"
              ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 shadow"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white"
          }`}
        >
          ⏰ Automated Scheduled Reports
        </button>
      </div>

      {/* TAB 1: OPERATOR ACTIVITY & SUMMARY */}
      {activeTab === "user-activity" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter operators by name or email..."
              className="w-full max-w-sm rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
            />
            <div className="text-xs text-slate-400">
              Showing {filteredUsers.length} operators
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Operator</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4 text-center">Stock IN Units</th>
                    <th className="px-6 py-4 text-center">Stock OUT Units</th>
                    <th className="px-6 py-4 text-center">Total Ops</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingSummary ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Loading operator summaries…
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No operator records found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const uid = u._id || u.userId || "";
                      const key = uid || u.email || `operator-${idx}`;
                      const inQty = u.totalIn ?? u.stockIn ?? 0;
                      const outQty = u.totalOut ?? u.stockOut ?? 0;
                      return (
                        <tr key={key} className="hover:bg-white/[0.02] transition">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-white">{u.name || "Unknown"}</div>
                            <div className="text-xs text-slate-400">{u.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-medium text-emerald-400">
                            +{inQty}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-medium text-sky-400">
                            -{outQty}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-white">
                            {u.totalTransactions || (inQty + outQty)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedUserId(uid || null)}
                              className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
                            >
                              Inspect Activity
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* USER DRILLDOWN MODAL */}
      {selectedUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Operator Ledger Audit Trail</h2>
                <p className="text-xs text-slate-400">Chronological stock entries recorded by this operator.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              {loadingActivity ? (
                <div className="p-8 text-center text-slate-400">Loading ledger items…</div>
              ) : activityList.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No recorded transactions for this operator.</div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="py-2.5">Date</th>
                      <th className="py-2.5">Type</th>
                      <th className="py-2.5">Product</th>
                      <th className="py-2.5 text-center">Quantity</th>
                      <th className="py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activityList.map((item, idx) => (
                      <tr key={item._id || `act-${idx}`} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 text-slate-400">
                          {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                            item.type === "IN" ? "bg-emerald-400/10 text-emerald-400" : "bg-sky-400/10 text-sky-400"
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2.5 text-white font-medium">
                          {item.productId?.name || item.productName || "Unknown Item"}
                        </td>
                        <td className="py-2.5 text-center font-mono font-bold text-white">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 text-slate-400">
                          {item.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STOCK VELOCITY */}
      {activeTab === "stock-velocity" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-wider text-slate-400">Tracked Products</div>
              <div className="mt-2 text-3xl font-bold text-white">{movementList.length}</div>
              <div className="mt-1 text-xs text-slate-400">Active catalog items</div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-wider text-emerald-400">Total IN Throughput</div>
              <div className="mt-2 text-3xl font-bold text-emerald-300">
                +{movementList.reduce((acc, m) => acc + (m.totalIn || 0), 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Inflow across all warehouses</div>
            </div>

            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-wider text-sky-400">Total OUT Dispatch</div>
              <div className="mt-2 text-3xl font-bold text-sky-300">
                -{movementList.reduce((acc, m) => acc + (m.totalOut || 0), 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">Dispatched units</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">SKU</th>
                    <th className="px-6 py-4 text-center">Total IN</th>
                    <th className="px-6 py-4 text-center">Total OUT</th>
                    <th className="px-6 py-4 text-center">Net Balance</th>
                    <th className="px-6 py-4">Velocity Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingMovement ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Calculating stock movement…
                      </td>
                    </tr>
                  ) : movementList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No movement data found.
                      </td>
                    </tr>
                  ) : (
                    movementList.map((m, idx) => {
                      const totalOps = (m.totalIn || 0) + (m.totalOut || 0);
                      const inRatio = totalOps > 0 ? ((m.totalIn || 0) / totalOps) * 100 : 50;
                      return (
                        <tr key={m.productId || `mov-${idx}`} className="hover:bg-white/[0.02]">
                          <td className="px-6 py-4 font-semibold text-white">{m.productName}</td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-400">{m.sku || "—"}</td>
                          <td className="px-6 py-4 text-center font-mono text-emerald-400">+{m.totalIn || 0}</td>
                          <td className="px-6 py-4 text-center font-mono text-sky-400">-{m.totalOut || 0}</td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-white">{m.netChange ?? ((m.totalIn || 0) - (m.totalOut || 0))}</td>
                          <td className="px-6 py-4 w-48">
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                              <div style={{ width: `${inRatio}%` }} className="bg-emerald-400" title={`IN: ${inRatio.toFixed(0)}%`} />
                              <div style={{ width: `${100 - inRatio}%` }} className="bg-sky-400" title={`OUT: ${(100 - inRatio).toFixed(0)}%`} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EXPORT CENTER */}
      {activeTab === "export-center" && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Generate Parametric Data Export</h2>
            <p className="mt-1 text-xs text-slate-400">
              Stream sanitized, RFC 4180-compliant CSV exports directly from live multi-tenant ledgers.
            </p>
          </div>

          {exportError && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
              ⚠️ {exportError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Entity Type</label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value as "stock-ledger" | "user-activity" | "products")}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
              >
                <option value="stock-ledger">Stock Ledger (Detailed)</option>
                <option value="user-activity">User Activity Aggregations</option>
                <option value="products">Catalog Products List</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Start Date</label>
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">End Date</label>
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Specific Operator (Optional)</label>
              <select
                value={exportUserFilter}
                onChange={(e) => setExportUserFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
              >
                <option value="">All Operators</option>
                {rawSummaryList.map((u, idx) => {
                  const uid = u._id || u.userId || "";
                  return (
                    <option key={uid || `filter-user-${idx}`} value={uid}>
                      {u.name || u.email}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExportDownload}
              disabled={isExporting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Streaming Export File…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download CSV Export
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: AUTOMATED SCHEDULED REPORTS */}
      {activeTab === "scheduled" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
            <div>
              <h2 className="text-base font-bold text-white">Cron-Generated Audit Snapshots</h2>
              <p className="text-xs text-slate-400">Periodic reports automatically compiled at 06:00 UTC and dispatched via email.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => triggerReportMutation.mutate("daily_summary")}
                disabled={triggerReportMutation.isPending}
                className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
              >
                {triggerReportMutation.isPending ? "Triggering…" : "⚡ Trigger Daily Summary Now"}
              </button>
              <button
                type="button"
                onClick={() => triggerReportMutation.mutate("weekly_low_stock")}
                disabled={triggerReportMutation.isPending}
                className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-400/20 disabled:opacity-50"
              >
                {triggerReportMutation.isPending ? "Triggering…" : "⚡ Trigger Weekly Low Stock"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Report Type</th>
                  <th className="px-6 py-4">Generated At</th>
                  <th className="px-6 py-4">Trigger Mode</th>
                  <th className="px-6 py-4 text-right">Items Included</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingScheduled ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      Loading scheduled reports…
                    </td>
                  </tr>
                ) : scheduledList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No automated reports have been recorded yet. Click a trigger button above to run one manually.
                    </td>
                  </tr>
                ) : (
                  scheduledList.map((r, idx) => (
                    <tr key={r._id || `sched-${idx}`} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-4 font-semibold text-white">
                        <span className="capitalize">{r.type.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(r.generatedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300 capitalize">
                          {r.triggeredBy || "cron"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-white">
                        {r.itemCount ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
