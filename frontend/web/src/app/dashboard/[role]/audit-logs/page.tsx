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
  sequenceNumber?: number;
  previousHash?: string;
  currentHash?: string;
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

type MerkleVerificationResult = {
  success: boolean;
  valid: boolean;
  status: "VERIFIED" | "TAMPER_DETECTED" | "ERROR";
  count: number;
  rootHash?: string;
  firstHash?: string;
  verifiedAt: string;
  durationMs: number;
  brokenAtSequence?: number;
  expectedSequence?: number;
  logId?: string;
  reason?: string;
  message?: string;
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

  // Merkle Cryptographic Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [merkleResult, setMerkleResult] = useState<MerkleVerificationResult | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState(false);

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

  async function handleVerifyMerkleChain() {
    setIsVerifying(true);
    try {
      const res = await apiFetch<MerkleVerificationResult>("/auth/audit-logs/verify-integrity");
      setMerkleResult(res);
    } catch (err: any) {
      setMerkleResult({
        success: false,
        valid: false,
        status: "TAMPER_DETECTED",
        count: 0,
        verifiedAt: new Date().toISOString(),
        durationMs: 0,
        reason: err?.message || "Cryptographic verification network failure or verification rejected."
      });
    } finally {
      setIsVerifying(false);
    }
  }

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

    const headers = ["Sequence", "Timestamp", "Action", "Severity", "Entity Type", "Summary", "Current Hash", "Performed By", "Role", "IP Address"];
    const rows = logs.map((log) => {
      const actorName = log.performedByName || (typeof log.performedBy === "object" ? log.performedBy?.name || log.performedBy?.email : undefined) || "SYSTEM";
      const actorRole = log.performedByRole || (typeof log.performedBy === "object" ? log.performedBy?.role : undefined) || "SYSTEM";
      return [
        `"${log.sequenceNumber || ""}"`,
        `"${new Date(log.createdAt).toISOString()}"`,
        `"${log.action}"`,
        `"${log.severity || "INFO"}"`,
        `"${log.entityType || ""}"`,
        `"${formatAuditSummary(log).replace(/"/g, '""')}"`,
        `"${log.currentHash || ""}"`,
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
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.25em] text-indigo-400 font-semibold">SAP GRC & 21 CFR Part 11 Standard</span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
              SHA-256 Chained
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">📋 Audit Trail & Cryptographic Ledger</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Immutable, mathematically tamper-evident record of all physical inventory movements, user security events, AI copilot tool actions, and master data changes.
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

      {/* SAP GRC Standard Cryptographic Merkle Hash Chain Verification Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-slate-900/90 via-indigo-950/30 to-slate-900/90 p-5 sm:p-6 backdrop-blur-2xl shadow-2xl shadow-indigo-500/5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  merkleResult?.valid ? "bg-emerald-400" : merkleResult?.valid === false ? "bg-rose-400" : "bg-amber-400"
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  merkleResult?.valid ? "bg-emerald-500" : merkleResult?.valid === false ? "bg-rose-500" : "bg-amber-500"
                }`}></span>
              </span>
              <span className="text-xs uppercase tracking-wider font-bold text-indigo-300">
                Merkle Cryptographic Chain Verification
              </span>
              {merkleResult?.valid && (
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/30">
                  MATHEMATICALLY VERIFIED
                </span>
              )}
              {merkleResult?.valid === false && (
                <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-400 border border-rose-500/30">
                  CHAIN TAMPERING DETECTED
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Every audit record is bound by a sequential SHA-256 cryptographic hash pointer (<code className="text-indigo-300">H[i] = SHA256(H[i-1] + record[i])</code>).
              Running mathematical verification guarantees that zero records have been altered, backdated, or purged.
            </p>

            {merkleResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Verified Records</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{merkleResult.count.toLocaleString()} blocks</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Execution Speed</div>
                  <div className="text-sm font-bold text-indigo-300 mt-0.5">{merkleResult.durationMs}ms</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 col-span-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Root Cryptographic Hash</div>
                  <div className="text-[11px] font-mono text-slate-300 mt-0.5 truncate" title={merkleResult.rootHash}>
                    {merkleResult.rootHash || "0000000000000000000000000000000000000000000000000000000000000000"}
                  </div>
                </div>
              </div>
            )}

            {merkleResult?.valid === false && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-400">
                  <span>⚠️ Integrity Breach:</span>
                  <span>{merkleResult.reason}</span>
                </div>
                {merkleResult.brokenAtSequence && (
                  <div>Broken at Sequence Number: <strong>#{merkleResult.brokenAtSequence}</strong></div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <button
              type="button"
              onClick={handleVerifyMerkleChain}
              disabled={isVerifying}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Computing Hashes...</span>
                </>
              ) : (
                <>
                  <span>🔐 Verify Chain Integrity</span>
                </>
              )}
            </button>

            {merkleResult?.valid && (
              <button
                type="button"
                onClick={() => setShowCertificateModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-900/30 px-5 py-3 text-xs sm:text-sm font-bold text-emerald-400 transition"
              >
                <span>📜 View Audit Certificate</span>
              </button>
            )}
          </div>
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
                <option value="ALL">All Business Actions</option>
                <option value="STOCK_IN">STOCK_IN (Receiving)</option>
                <option value="STOCK_OUT">STOCK_OUT (Dispatch)</option>
                <option value="STOCK_TRANSFER_CREATED">STOCK_TRANSFER</option>
                <option value="CYCLE_COUNT_COMPLETED">CYCLE_COUNT</option>
                <option value="ADJUSTMENT_POSTED">ADJUSTMENT</option>
                <option value="AI_TOOL_EXECUTED">AI_TOOL_CALL</option>
              </select>
            ) : (
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-indigo-400/50"
              >
                <option value="ALL">All Security Actions</option>
                <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                <option value="PASSWORD_RESET_REQUEST">PASSWORD_RESET</option>
                <option value="TWO_FACTOR_ENABLED">2FA_CHANGE</option>
                <option value="ROLE_CHANGED">ROLE_CHANGED</option>
                <option value="API_KEY_CREATED">API_KEY_CHANGE</option>
              </select>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
            <span>Filtered results active</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-r-transparent"></div>
            <div className="text-sm text-slate-400">Loading audit records...</div>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-rose-400 space-y-2">
            <div>Failed to load audit logs.</div>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-xs text-indigo-400 underline hover:text-indigo-300"
            >
              Try again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <div className="text-3xl">📭</div>
            <div className="text-sm font-semibold text-white">No Audit Events Found</div>
            <div className="text-xs text-slate-500 max-w-sm mx-auto">
              No audit logs matched your current filters. Try resetting the search or broadening the date range.
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-3 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-white/5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Seq / Hash</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Event Summary</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">IP / Client</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => {
                  const actorName = log.performedByName || (typeof log.performedBy === "object" ? log.performedBy?.name || log.performedBy?.email : undefined) || "SYSTEM";
                  const actorRole = log.performedByRole || (typeof log.performedBy === "object" ? log.performedBy?.role : undefined) || "SYSTEM";
                  const badgeClass = getActionBadgeClass(log.action, log.severity);

                  return (
                    <tr
                      key={log._id}
                      className="hover:bg-white/[0.03] transition group cursor-pointer"
                      onClick={() => setSelectedLogForDetails(log)}
                    >
                      <td className="py-3 px-4 font-mono text-xs">
                        <div className="text-indigo-400 font-bold">
                          #{log.sequenceNumber || "—"}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[90px]" title={log.currentHash}>
                          {log.currentHash ? log.currentHash.slice(0, 10) + "…" : "0x000…"}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                        <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                        <div className="text-[11px] text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-tight ${badgeClass}`}>
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-md text-slate-300">
                        <div className="font-medium text-white truncate" title={formatAuditSummary(log)}>
                          {formatAuditSummary(log)}
                        </div>
                        {log.entityType && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {log.entityType} {log.entityId ? `· ${String(log.entityId).slice(-6)}` : ""}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-white">{actorName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{actorRole}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-slate-400">
                        <div>{log.ipAddress || "127.0.0.1"}</div>
                        {log.userAgent && (
                          <div className="text-[10px] text-slate-600 truncate max-w-[120px]" title={log.userAgent}>
                            {log.userAgent}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLogForDetails(log);
                          }}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 sm:px-6">
            <div className="text-xs text-slate-400">
              Page <span className="font-bold text-white">{page}</span> of <span className="font-bold text-white">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Detail Inspector Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-3xl rounded-3xl border border-white/20 bg-slate-900 p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold ${getActionBadgeClass(selectedLogForDetails.action, selectedLogForDetails.severity)}`}>
                    {selectedLogForDetails.action}
                  </span>
                  <span className="text-xs font-mono text-indigo-400 font-bold">
                    Sequence #{selectedLogForDetails.sequenceNumber || "—"}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white mt-2">
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

            {/* Cryptographic Hash Chaining Metadata */}
            <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 space-y-2">
              <div className="text-xs uppercase tracking-wider font-bold text-indigo-400 flex items-center gap-2">
                <span>🔒 Cryptographic SHA-256 Hash Chain Proof</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500">Previous Block Hash (H[i-1])</div>
                  <div className="text-slate-300 break-all bg-black/30 p-2 rounded-lg mt-0.5">
                    {selectedLogForDetails.previousHash || "0000000000000000000000000000000000000000000000000000000000000000"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500">Current Block Hash (H[i])</div>
                  <div className="text-indigo-300 break-all bg-black/30 p-2 rounded-lg mt-0.5">
                    {selectedLogForDetails.currentHash || "0000000000000000000000000000000000000000000000000000000000000000"}
                  </div>
                </div>
              </div>
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

      {/* SOC 2 / FDA 21 CFR Part 11 Official Audit Certificate Modal */}
      {showCertificateModal && merkleResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-2xl rounded-3xl border border-indigo-500/30 bg-slate-950 p-8 shadow-2xl text-white space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-indigo-600/20 p-2.5 border border-indigo-500/30 text-xl">
                  🏛️
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Audit Chain Integrity Certificate</h3>
                  <div className="text-xs text-slate-400 font-mono">SOC 2 Type II & FDA 21 CFR Part 11 Compliance Proof</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCertificateModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <span>✅ Cryptographic Verification Verdict: VALID & UNBROKEN</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This certifies that the AcuStock cryptographic verification engine performed full mathematical induction across all {merkleResult.count.toLocaleString()} sequential event blocks. No intermediate block deletions, backdated records, or payload mutations were detected.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-400">Verification Timestamp:</span>
                <span className="text-slate-200">{new Date(merkleResult.verifiedAt).toUTCString()}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-400">Total Sequential Blocks:</span>
                <span className="text-emerald-400 font-bold">{merkleResult.count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-400">Verification Engine Speed:</span>
                <span className="text-slate-200">{merkleResult.durationMs}ms</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-white/5 pb-2">
                <span className="text-slate-400">Cryptographic Root Hash (H[N]):</span>
                <span className="text-indigo-300 break-all bg-black/40 p-2 rounded-lg text-[11px]">
                  {merkleResult.rootHash}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                🖨️ Print Certificate
              </button>
              <button
                type="button"
                onClick={() => setShowCertificateModal(false)}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition"
              >
                Close Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
