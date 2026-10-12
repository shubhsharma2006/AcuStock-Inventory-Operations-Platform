"use client";

import { useState, useMemo } from "react";
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
  details?: Record<string, any>;
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
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState<"ALL" | "TODAY" | "7D" | "30D">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditItem | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Compute startDate based on dateRange
  const startDate = useMemo(() => {
    if (dateRange === "ALL") return undefined;
    const now = new Date();
    if (dateRange === "TODAY") {
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    }
    if (dateRange === "7D") {
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    }
    if (dateRange === "30D") {
      now.setDate(now.getDate() - 30);
      return now.toISOString();
    }
    return undefined;
  }, [dateRange]);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "25");

  if (actionFilter !== "ALL") queryParams.set("action", actionFilter);
  if (entityTypeFilter !== "ALL") queryParams.set("entityType", entityTypeFilter);
  if (severityFilter !== "ALL") queryParams.set("severity", severityFilter);
  if (startDate) queryParams.set("startDate", startDate);
  if (search.trim()) queryParams.set("search", search.trim());

  const { data: activityData, isLoading, error, refetch } = useQuery<ActivityResponse>({
    queryKey: ["activity-logs", activeTab, actionFilter, entityTypeFilter, severityFilter, dateRange, search, page],
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
    if (severity === "CRITICAL" || action.includes("DELETE") || action.includes("CANCEL") || action.includes("BLOCKED")) {
      return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
    }
    if (severity === "WARNING" || action.includes("ADJUST") || action.includes("REVERSE") || action.includes("FAILED")) {
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    }
    if (action.includes("CREATED") || action.includes("IN") || action.includes("APPROVED") || action.includes("RECEIVED") || action.includes("SUCCESS")) {
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    }
    if (action.includes("OUT") || action.includes("DISPATCHED")) {
      return "bg-blue-500/15 text-blue-400 border border-blue-500/30";
    }
    return "bg-purple-500/15 text-purple-300 border border-purple-500/30";
  };

  function formatAuditSummary(log: AuditItem): string {
    if (log.changes?.summary) return log.changes.summary;
    if (log.details?.summary && typeof log.details.summary === "string") return log.details.summary;

    const action = log.action;
    const details = log.details || {};

    if (action === "LOGIN_SUCCESS") {
      return `Successful sign-in${log.ipAddress ? ` from IP ${log.ipAddress}` : ""}`;
    }
    if (action === "LOGIN_FAILED") {
      return `Failed sign-in attempt${details.reason ? `: ${details.reason}` : ""}`;
    }
    if (action === "AI_TOOL_EXECUTED") {
      return `🤖 Tool Call: [${details.toolName || "Inventory Tool"}] executed${details.executionTimeMs ? ` in ${details.executionTimeMs}ms` : ""}`;
    }
    if (action === "AI_COPILOT_QUERY") {
      const q = details.prompt || (details.promptLength ? `${details.promptLength} chars` : "");
      return q ? `💬 Copilot Query: "${q.slice(0, 90)}${q.length > 90 ? '…' : ''}"` : "User asked AcuBot Copilot";
    }
    if (action === "AI_OCR_PROCESSED") {
      return `🔍 Vision OCR invoice extraction completed${details.matchedItems ? ` (${details.matchedItems} items matched)` : ""}`;
    }
    if (action === "STOCK_IN") {
      return `📥 Inward Stock: Received ${details.quantity || ""} units`;
    }
    if (action === "STOCK_OUT") {
      return `📤 Dispatch Stock: Issued ${details.quantity || ""} units`;
    }
    if (action === "STOCK_TRANSFER_CREATED") {
      return `🚚 Stock transfer request created`;
    }
    if (action === "PERMISSION_UPDATED") {
      return `🛡️ Role permissions updated for ${details.targetRole || "role"}`;
    }
    if (action === "SETTING_CHANGED") {
      return `⚙️ System setting updated`;
    }

    if (details && typeof details === "object" && Object.keys(details).length > 0) {
      const keys = Object.keys(details).slice(0, 2);
      return keys.map((k) => `${k}: ${details[k]}`).join(" · ");
    }

    return "—";
  }

  function handleExportCsv() {
    if (logs.length === 0) return;

    const headers = ["Timestamp", "Action", "Severity", "Entity Type", "Summary", "Performed By", "Role", "IP Address"];
    const rows = logs.map((log) => {
      const actorName = log.performedByName || (typeof log.performedBy === "object" ? log.performedBy?.name || log.performedBy?.email : undefined) || "SYSTEM";
      const actorRole = log.performedByRole || (typeof log.performedBy === "object" ? log.performedBy?.role : undefined) || "SYSTEM";
      return [
        `"${new Date(log.createdAt).toISOString()}"`,
        `"${log.action}"`,
        `"${log.severity || "INFO"}"`,
        `"${log.entityType || ""}"`,
        `"${formatAuditSummary(log).replace(/"/g, '""')}"`,
        `"${actorName}"`,
        `"${actorRole}"`,
        `"${log.ipAddress || ""}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `acustock-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleResetFilters() {
    setActionFilter("ALL");
    setEntityTypeFilter("ALL");
    setSeverityFilter("ALL");
    setDateRange("ALL");
    setSearch("");
    setPage(1);
  }

  const hasActiveFilters = actionFilter !== "ALL" || entityTypeFilter !== "ALL" || severityFilter !== "ALL" || dateRange !== "ALL" || !!search.trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-indigo-400 font-semibold">Regulatory Compliance</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">📋 Audit Trail & Compliance Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Immutable, cryptographically verifiable ledger of all stock transactions, logins, security changes, and AI operations.
          </p>
        </div>

        {/* Tab Switcher & Export */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-2xl border border-white/10 bg-slate-900/60 p-1 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => { setActiveTab("BUSINESS"); setPage(1); }}
              className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                activeTab === "BUSINESS"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              📦 Business Events
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("SECURITY"); setPage(1); }}
              className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                activeTab === "SECURITY"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🛡️ Security & Access
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition disabled:opacity-40"
            title="Export filtered records to CSV"
          >
            <span>📥 Export CSV</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Form */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-5 backdrop-blur-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by summary, actor, or action..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs sm:text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Range */}
          <div>
            <select
              value={dateRange}
              onChange={(e) => { setDateRange(e.target.value as any); setPage(1); }}
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-indigo-400/50"
            >
              <option value="ALL">📅 All Time</option>
              <option value="TODAY">📅 Today</option>
              <option value="7D">📅 Last 7 Days</option>
              <option value="30D">📅 Last 30 Days</option>
            </select>
          </div>

          {/* Severity */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-indigo-400/50"
            >
              <option value="ALL">All Severities</option>
              <option value="INFO">🟢 INFO</option>
              <option value="WARNING">🟡 WARNING</option>
              <option value="CRITICAL">🔴 CRITICAL</option>
            </select>
          </div>

          {/* Action Filter */}
          <div>
            {activeTab === "BUSINESS" ? (
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-indigo-400/50"
              >
                <option value="ALL">All Operations</option>
                <option value="STOCK_IN">Stock IN</option>
                <option value="STOCK_OUT">Stock OUT</option>
                <option value="STOCK_ADJUSTED">Stock Adjusted</option>
                <option value="AI_TOOL_EXECUTED">AI Tool Executed</option>
                <option value="AI_COPILOT_QUERY">AI Copilot Query</option>
                <option value="AI_OCR_PROCESSED">AI OCR Extraction</option>
                <option value="ITEM_CREATED">Item Created</option>
                <option value="ITEM_UPDATED">Item Updated</option>
                <option value="PO_CREATED">PO Created</option>
                <option value="SO_CREATED">SO Created</option>
                <option value="COMPANY_CREATED">Company Created</option>
                <option value="PERMISSION_UPDATED">Permission Updated</option>
              </select>
            ) : (
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-indigo-400/50"
              >
                <option value="ALL">All Security Events</option>
                <option value="LOGIN_SUCCESS">Login Success</option>
                <option value="LOGIN_FAILED">Login Failed</option>
                <option value="PASSWORD_CHANGED">Password Changed</option>
                <option value="PASSWORD_RESET_BY_ADMIN">Password Reset by Admin</option>
                <option value="2FA_ENABLED">2FA Enabled</option>
                <option value="2FA_DISABLED">2FA Disabled</option>
                <option value="ACCOUNT_CREATED">Account Created</option>
              </select>
            )}
          </div>
        </div>

        {/* Filter Footer */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-1">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-white">{logs.length}</strong> of <strong className="text-white">{activityData?.total || 0}</strong> events
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-amber-400 hover:text-amber-300 font-medium underline"
              >
                Reset filters
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="text-slate-400 hover:text-white transition flex items-center gap-1"
          >
            <span>🔄 Refresh Stream</span>
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 p-8 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-slate-400 text-sm">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Loading compliance audit stream...
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Action & Entity</th>
                  <th className="px-6 py-4">Summary Description</th>
                  <th className="px-6 py-4">Performed By</th>
                  <th className="px-6 py-4 text-right">Inspection</th>
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

                  const summary = formatAuditSummary(log);

                  return (
                    <tr key={log._id} className="group transition hover:bg-white/[0.03]">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                        <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{new Date(log.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono ${getActionBadgeClass(log.action, log.severity)}`}>
                          {log.action}
                        </span>
                        {log.entityType && (
                          <div className="text-[11px] font-mono text-slate-400 mt-1">
                            {log.entityType} {log.entityId ? `· #${log.entityId.slice(-6)}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-200 leading-snug line-clamp-2 max-w-xl">
                          {summary}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-white">{actorName}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{actorRole}</div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLogForDetails(log)}
                          className="rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-600 hover:text-white"
                          title="Inspect complete event telemetry and snapshot diff"
                        >
                          👁️ Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-500">
                      No activity logs match the selected filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/60 px-6 py-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 hover:bg-white/10 transition"
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
                className="rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 hover:bg-white/10 transition"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Event Inspection Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/15 bg-slate-900 p-6 sm:p-8 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-0.5 text-xs font-bold font-mono ${getActionBadgeClass(selectedLogForDetails.action, selectedLogForDetails.severity)}`}>
                    {selectedLogForDetails.action}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {new Date(selectedLogForDetails.createdAt).toLocaleString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">
                  {formatAuditSummary(selectedLogForDetails)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Event Meta Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-500">Actor</div>
                <div className="text-xs font-semibold text-white truncate mt-1">
                  {selectedLogForDetails.performedByName || (typeof selectedLogForDetails.performedBy === "object" ? selectedLogForDetails.performedBy?.name : "SYSTEM")}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-500">Role</div>
                <div className="text-xs font-semibold text-indigo-300 font-mono mt-1">
                  {selectedLogForDetails.performedByRole || (typeof selectedLogForDetails.performedBy === "object" ? selectedLogForDetails.performedBy?.role : "SYSTEM")}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-500">IP Address</div>
                <div className="text-xs font-mono text-slate-300 mt-1 truncate">
                  {selectedLogForDetails.ipAddress || "127.0.0.1"}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-500">Entity</div>
                <div className="text-xs font-mono text-slate-300 mt-1 truncate">
                  {selectedLogForDetails.entityType || "System"}
                </div>
              </div>
            </div>

            {/* Diffs (Before vs After) if present */}
            {(selectedLogForDetails.changes?.before || selectedLogForDetails.changes?.after) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 font-mono text-xs">
                {selectedLogForDetails.changes?.before && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4">
                    <div className="font-semibold text-rose-400 mb-2 uppercase tracking-wide">Previous State (Before)</div>
                    <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48 custom-scrollbar">
                      {JSON.stringify(selectedLogForDetails.changes.before, null, 2)}
                    </pre>
                  </div>
                )}
                {selectedLogForDetails.changes?.after && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                    <div className="font-semibold text-emerald-400 mb-2 uppercase tracking-wide">New State (After)</div>
                    <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48 custom-scrollbar">
                      {JSON.stringify(selectedLogForDetails.changes.after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Full Event Details Telemetry */}
            {selectedLogForDetails.details && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                    Technical Event Telemetry
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedLogForDetails.details, null, 2));
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 2000);
                    }}
                    className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1"
                  >
                    <span>{copiedJson ? "✅ Copied" : "📋 Copy JSON"}</span>
                  </button>
                </div>
                <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-2 bg-black/40 rounded-xl whitespace-pre-wrap max-h-60 custom-scrollbar">
                  {JSON.stringify(selectedLogForDetails.details, null, 2)}
                </pre>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
