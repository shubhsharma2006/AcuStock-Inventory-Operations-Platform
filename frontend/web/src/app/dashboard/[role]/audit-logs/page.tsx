"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

type AuditItem = {
  _id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  performedBy?: { name?: string; email?: string; role?: string } | string;
  performedByName?: string;
  performedByRole?: string;
  targetUser?: { name?: string; email?: string };
  targetUserName?: string;
  targetRole?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    summary?: string;
  };
  details?: Record<string, unknown>;
};

type ActivityResponse = {
  success: boolean;
  activities: AuditItem[];
  total: number;
  page: number;
  totalPages: number;
};

export default function AuditLogsPage() {
  const [activeTab, setActiveTab] = useState<"BUSINESS" | "SECURITY">("BUSINESS");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityTypeFilter, setEntityTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "25");

  if (actionFilter !== "ALL") queryParams.set("action", actionFilter);
  if (entityTypeFilter !== "ALL") queryParams.set("entityType", entityTypeFilter);
  if (search.trim()) queryParams.set("search", search.trim());

  const { data: activityData, isLoading, error } = useQuery<ActivityResponse>({
    queryKey: ["activity-logs", activeTab, actionFilter, entityTypeFilter, search, page],
    queryFn: () => {
      const endpoint = activeTab === "BUSINESS" 
        ? `/activity?${queryParams.toString()}`
        : `/auth/audit-logs?${queryParams.toString()}`;
      return apiFetch<ActivityResponse>(endpoint);
    },
  });

  const logs = activityData?.activities || [];
  const totalPages = activityData?.totalPages || 1;

  const getActionBadgeClass = (action: string, severity?: string) => {
    if (severity === "CRITICAL" || action.includes("DELETE") || action.includes("CANCEL")) {
      return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
    if (severity === "WARNING" || action.includes("ADJUST") || action.includes("REVERSE")) {
      return "bg-amber-500/10 text-amber-300 border border-amber-500/20";
    }
    if (action.includes("CREATED") || action.includes("IN") || action.includes("APPROVED") || action.includes("RECEIVED")) {
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
    if (action.includes("OUT") || action.includes("DISPATCHED")) {
      return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    }
    return "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">📋 Activity Trail & Compliance Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Immutable audit record of all business transactions, stock adjustments, orders, and security events.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/60 p-1 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => { setActiveTab("BUSINESS"); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "BUSINESS"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📦 Business Operations
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("SECURITY"); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "SECURITY"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🛡️ Security & Access
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by summary, actor, or action..."
          className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-400/40"
        />

        {activeTab === "BUSINESS" ? (
          <>
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="ALL">All Entities</option>
              <option value="Item">Item / Product</option>
              <option value="StockLedger">Stock Ledger</option>
              <option value="PurchaseOrder">Purchase Order</option>
              <option value="SalesOrder">Sales Order</option>
              <option value="Company">Company</option>
              <option value="Permission">Permission</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="ALL">All Actions</option>
              <option value="STOCK_IN">Stock IN</option>
              <option value="STOCK_OUT">Stock OUT</option>
              <option value="STOCK_ADJUSTED">Stock Adjusted</option>
              <option value="ITEM_CREATED">Item Created</option>
              <option value="ITEM_UPDATED">Item Updated</option>
              <option value="ITEM_DELETED">Item Deleted</option>
              <option value="ITEM_IMPORTED">Item Bulk Imported</option>
              <option value="PO_CREATED">PO Created</option>
              <option value="PO_RECEIVED">PO Received</option>
              <option value="PO_STATUS_CHANGED">PO Status Changed</option>
              <option value="SO_CREATED">SO Created</option>
              <option value="SO_DISPATCHED">SO Dispatched</option>
              <option value="SO_STATUS_CHANGED">SO Status Changed</option>
              <option value="COMPANY_CREATED">Company Created</option>
              <option value="COMPANY_UPDATED">Company Updated</option>
              <option value="COMPANY_DELETED">Company Deleted</option>
              <option value="SETTING_CHANGED">Setting Changed</option>
              <option value="PERMISSION_UPDATED">Permission Updated</option>
            </select>
          </>
        ) : (
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none"
          >
            <option value="ALL">All Security Actions</option>
            <option value="LOGIN_SUCCESS">Login Success</option>
            <option value="LOGIN_FAILED">Login Failed</option>
            <option value="PASSWORD_CHANGED">Password Changed</option>
            <option value="PASSWORD_RESET_BY_ADMIN">Password Reset by Admin</option>
            <option value="2FA_ENABLED">2FA Enabled</option>
            <option value="2FA_DISABLED">2FA Disabled</option>
            <option value="ACCOUNT_CREATED">Account Created</option>
            <option value="ACCOUNT_DEACTIVATED">Account Deactivated</option>
          </select>
        )}

        <div className="flex items-center justify-end text-xs text-slate-400">
          Showing {logs.length} of {activityData?.total || 0} events
        </div>
      </div>

      {isLoading && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 p-8 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-slate-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Loading activity stream...
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-2xl shadow-black/40">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Summary / Details</th>
                <th className="px-6 py-4">Performed By</th>
                <th className="px-6 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {logs.map((log) => {
                const actorName =
                  log.performedByName ||
                  (typeof log.performedBy === "object" ? log.performedBy?.name || log.performedBy?.email : undefined) ||
                  "SYSTEM";
                const actorRole =
                  log.performedByRole ||
                  (typeof log.performedBy === "object" ? log.performedBy?.role : undefined) ||
                  "SYSTEM";

                const isExpanded = expandedRow === log._id;
                const hasChanges = !!(log.changes?.before || log.changes?.after || log.details);

                return (
                  <tr key={log._id} className="group transition hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold font-mono ${getActionBadgeClass(log.action, log.severity)}`}>
                        {log.action}
                      </span>
                      {log.entityType && (
                        <div className="text-[11px] font-mono text-slate-400 mt-1">
                          {log.entityType}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-200">
                        {log.changes?.summary || (log.details ? JSON.stringify(log.details) : "—")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-white">{actorName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{actorRole}</div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {hasChanges ? (
                        <button
                          type="button"
                          onClick={() => setExpandedRow(isExpanded ? null : log._id)}
                          className="rounded-lg border border-white/10 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-600 hover:text-white"
                        >
                          {isExpanded ? "Hide Diff" : "View Diff"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    No activity logs match the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Expanded Diffs Container */}
          {expandedRow && (
            <div className="border-t border-white/10 bg-slate-950/80 p-6 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-white">Event Snapshot & Audit Diff</h4>
                <button
                  type="button"
                  onClick={() => setExpandedRow(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close ✕
                </button>
              </div>
              {(() => {
                const item = logs.find((l) => l._id === expandedRow);
                if (!item) return null;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                    {item.changes?.before && (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4">
                        <div className="font-semibold text-rose-400 mb-2 uppercase tracking-wide">Previous State (Before)</div>
                        <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(item.changes.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {item.changes?.after && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                        <div className="font-semibold text-emerald-400 mb-2 uppercase tracking-wide">New State (After)</div>
                        <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(item.changes.after, null, 2)}
                        </pre>
                      </div>
                    )}
                    {item.details && !item.changes?.before && !item.changes?.after && (
                      <div className="col-span-2 rounded-xl border border-white/10 bg-slate-900/50 p-4">
                        <div className="font-semibold text-indigo-300 mb-2 uppercase tracking-wide">Event Details</div>
                        <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(item.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/60 px-6 py-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 hover:bg-white/5"
              >
                ← Previous
              </button>
              <div className="text-xs text-slate-400">
                Page <span className="font-bold text-white">{page}</span> of {totalPages}
              </div>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 hover:bg-white/5"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
