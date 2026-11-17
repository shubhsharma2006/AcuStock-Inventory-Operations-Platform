"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

interface AdjustmentItem {
  productId: string;
  sku?: string;
  name?: string;
  currentQuantity: number;
  newQuantity: number;
  varianceQuantity: number;
  unitCost: number;
  varianceValue: number;
}

interface AdjustmentRecord {
  _id: string;
  adjustmentNumber: string;
  type: string;
  reasonCode: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  totalVarianceUnits: number;
  totalVarianceValue: number;
  notes?: string;
  createdAt: string;
  createdBy?: { name: string; email: string };
  approvedBy?: { name: string; email: string };
}

export default function AdjustmentsPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const { data, isLoading } = useQuery<{ success: boolean; data: AdjustmentRecord[] }>({
    queryKey: ["adjustments", filterStatus],
    queryFn: () => apiFetch(`/api/adjustments${filterStatus !== "ALL" ? `?status=${filterStatus}` : ""}`),
  });

  const { data: reasonCodesData } = useQuery<{ success: boolean; reasonCodes: { code: string; label: string; type: string }[] }>({
    queryKey: ["adjustment-reason-codes"],
    queryFn: () => apiFetch("/api/adjustments/reason-codes"),
  });

  const adjustments = data?.data || [];
  const reasonCodes = reasonCodesData?.reasonCodes || [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/adjustments/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adjustments"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/adjustments/${id}/reject`, { method: "POST", body: JSON.stringify({ rejectionReason: "Rejected by auditor" }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adjustments"] });
    },
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 border border-rose-500/20">
              Stock Control & Governance
            </span>
            <span className="text-xs text-slate-400">• Dual-Approval Variance Resolution</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            Inventory Adjustments, Scrap & Damage
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Formal audit workflow for commercial write-offs, warehouse damages, found stock, and quality rejections with 11 standard reason codes.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Adjustments</div>
          <div className="mt-2 text-2xl font-extrabold text-white">{adjustments.length}</div>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-amber-300">Pending Dual-Approval</div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400">
            {adjustments.filter((a) => a.status === "PENDING_APPROVAL").length}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-emerald-300">Approved & Posted</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">
            {adjustments.filter((a) => a.status === "APPROVED").length}
          </div>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-rose-300">Total Variance Value</div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-rose-400">
            ₹{adjustments.reduce((sum, a) => sum + Math.abs(a.totalVarianceValue || 0), 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        {["ALL", "PENDING_APPROVAL", "APPROVED", "REJECTED"].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              filterStatus === st
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {st.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Adjustments Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-xl">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading adjustments registry…</div>
        ) : adjustments.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-base font-bold text-white">No Adjustments Found</div>
            <p className="mt-1 text-xs text-slate-500">
              No stock adjustments match the selected status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Adjustment #</th>
                  <th className="py-3 px-4">Reason Code</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-center">Variance Units</th>
                  <th className="py-3 px-4 text-right">Net Value Impact</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {isAdmin && <th className="py-3 px-4 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {adjustments.map((adj) => (
                  <tr key={adj._id} className="hover:bg-white/5 transition">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {adj.adjustmentNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-amber-300 border border-white/5">
                        {adj.reasonCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{adj.type}</td>
                    <td className="py-3 px-4 text-center font-mono font-semibold">
                      {adj.totalVarianceUnits > 0 ? `+${adj.totalVarianceUnits}` : adj.totalVarianceUnits}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      ₹{Math.abs(adj.totalVarianceValue || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          adj.status === "APPROVED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : adj.status === "PENDING_APPROVAL"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {adj.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-center">
                        {adj.status === "PENDING_APPROVAL" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => approveMutation.mutate(adj._id)}
                              className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(adj._id)}
                              className="rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

