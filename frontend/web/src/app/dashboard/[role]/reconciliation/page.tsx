"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

interface ReconciliationRecord {
  _id: string;
  taskNumber: string;
  cycleCountId?: string;
  productId?: { _id: string; name: string; sku?: string; uom?: string; salesPrice?: number };
  warehouseId?: { _id: string; name: string; code?: string };
  expectedQty: number;
  countedQty: number;
  varianceQty: number;
  varianceValue: number;
  status: "PENDING_AUDIT" | "APPROVED" | "POSTED" | "REJECTED";
  reasonCode?: string;
  notes?: string;
  createdAt: string;
}

export default function ReconciliationPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: rawData, isLoading } = useQuery<{ success: boolean; tasks?: ReconciliationRecord[]; data?: ReconciliationRecord[] }>({
    queryKey: ["reconciliation-tasks"],
    queryFn: () => apiFetch("/reconciliation"),
  });

  const tasks: ReconciliationRecord[] = Array.isArray(rawData)
    ? rawData
    : rawData?.tasks || rawData?.data || [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/reconciliation/${id}/approve`, { method: "POST" }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-tasks"] });
      setSuccessMsg(res?.message || "Variance approved and posted to Stock Ledger.");
      setTimeout(() => setSuccessMsg(null), 4000);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/reconciliation/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-tasks"] });
      setSuccessMsg("Discrepancy marked as rejected.");
      setTimeout(() => setSuccessMsg(null), 4000);
    },
  });

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === "ALL") return true;
    return t.status === filterStatus;
  });

  const pendingCount = tasks.filter((t) => t.status === "PENDING_AUDIT").length;
  const postedCount = tasks.filter((t) => t.status === "POSTED" || t.status === "APPROVED").length;
  const totalVarianceCost = tasks.reduce((acc, t) => acc + Math.abs(t.varianceValue || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
              Audit & Governance
            </span>
            <span className="text-xs text-slate-400">• Discrepancy Resolution Queue</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            Cycle Count Reconciliation Queue
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Review physical inventory counting discrepancies. Approvals automatically post balancing StockLedger adjustments with signed reason codes.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-300">
          ✓ {successMsg}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Audit Variances</div>
          <div className="mt-2 text-2xl font-extrabold text-white">{tasks.length}</div>
          <div className="mt-1 text-xs text-slate-500">Recorded across physical stocktakes</div>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-amber-300">Pending Supervisor Approval</div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400">{pendingCount}</div>
          <div className="mt-1 text-xs text-amber-400/70">Awaiting sign-off before balance adjustment</div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-emerald-300">Reconciled & Ledger-Adjusted</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">{postedCount}</div>
          <div className="mt-1 text-xs text-emerald-400/70">Immutable ledger transactions posted</div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Filter Queue:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
            >
              <option value="ALL">All Items ({tasks.length})</option>
              <option value="PENDING_AUDIT">Pending Audit ({pendingCount})</option>
              <option value="POSTED">Posted & Balanced ({postedCount})</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div className="text-xs text-slate-400">
            Total Variance Exposure: <strong className="font-mono text-rose-300">₹{totalVarianceCost.toLocaleString()}</strong>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading Reconciliation Tasks…</div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-3xl mb-2">🎉</div>
            <div className="text-base font-bold text-white">Reconciliation Queue Empty</div>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              All physical inventory audits are in sync with the Stock Ledger. When an operator records count discrepancies during a stocktake, they will appear here for supervisor sign-off.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Task #</th>
                  <th className="py-3 px-4">Product Details</th>
                  <th className="py-3 px-4 text-center">Expected (Book)</th>
                  <th className="py-3 px-4 text-center">Counted (Physical)</th>
                  <th className="py-3 px-4 text-center">Net Variance</th>
                  <th className="py-3 px-4 text-right">Value Impact</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {isAdmin && <th className="py-3 px-4 text-center">Supervisor Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredTasks.map((t) => {
                  const isPositive = t.varianceQty > 0;
                  return (
                    <tr key={t._id} className="hover:bg-white/5 transition">
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {t.taskNumber || t._id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{t.productId?.name || "Product"}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {t.productId?.sku || "—"} • {t.warehouseId?.name || "Warehouse"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">{t.expectedQty}</td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-white">
                        {t.countedQty}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {isPositive ? (
                          <span className="text-emerald-400">+{t.varianceQty} (Surplus)</span>
                        ) : t.varianceQty < 0 ? (
                          <span className="text-rose-400">{t.varianceQty} (Loss)</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-300">
                        ₹{Math.abs(t.varianceValue || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            t.status === "POSTED" || t.status === "APPROVED"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : t.status === "REJECTED"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {t.status.replace("_", " ")}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-center">
                          {t.status === "PENDING_AUDIT" ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => approveMutation.mutate(t._id)}
                                disabled={approveMutation.isPending}
                                className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt("Enter rejection reason:");
                                  if (reason) rejectMutation.mutate({ id: t._id, reason });
                                }}
                                disabled={rejectMutation.isPending}
                                className="rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">✓ Audited</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

