"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { Portal } from "@/components/ui/portal";

interface CycleCountItem {
  _id: string;
  productId: string;
  sku: string;
  productName: string;
  expectedQuantity?: number;
  countedQuantity: number | null;
  variance?: number;
  varianceValue?: number;
  reasonCode: string;
  notes?: string;
}

interface CycleCountSession {
  _id: string;
  countNumber: string;
  warehouseId: { _id: string; name: string; code?: string; location?: string };
  status: "DRAFT" | "IN_PROGRESS" | "PENDING_APPROVAL" | "RECONCILED" | "CANCELLED";
  blindCount: boolean;
  items: CycleCountItem[];
  assignedTo?: { _id: string; name: string; email: string };
  supervisedBy?: { _id: string; name: string; email: string };
  totalVarianceUnits: number;
  totalVarianceValue: number;
  notes?: string;
  reconciledAt?: string;
  reconciledBy?: { _id: string; name: string };
  createdAt: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code?: string;
}

const REASON_CODES = [
  { value: "NONE", label: "No Discrepancy / Normal" },
  { value: "SHRINKAGE", label: "Shrinkage / Missing Unaccounted" },
  { value: "DAMAGED_WRITE_OFF", label: "Damaged / Broken Write-off" },
  { value: "FOUND_IN_AISLE", label: "Found Stock / Unrecorded Inflow" },
  { value: "MISPLACED_RETURN", label: "Misplaced Customer Return" },
  { value: "INVENTORY_AUDIT", label: "Audit Count Correction" },
];

export default function CycleCountsPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("ALL");

  // Create form state
  const [createWarehouseId, setCreateWarehouseId] = useState<string>("");
  const [createBlindCount, setCreateBlindCount] = useState<boolean>(true);
  const [createNotes, setCreateNotes] = useState<string>("");

  // Edit counts state for selected session
  const [editedCounts, setEditedCounts] = useState<Record<string, { countedQuantity: number | null; reasonCode: string; notes: string }>>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [reconcileSuccessMsg, setReconcileSuccessMsg] = useState<string | null>(null);

  // Queries
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/api/warehouses"),
  });

  const { data: sessions = [], isLoading } = useQuery<CycleCountSession[]>({
    queryKey: ["cycle-counts", statusFilter, warehouseFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (warehouseFilter !== "ALL") params.append("warehouseId", warehouseFilter);
      return apiFetch(`/api/cycle-counts?${params.toString()}`);
    },
  });

  const { data: selectedSession, isLoading: isLoadingSession } = useQuery<CycleCountSession>({
    queryKey: ["cycle-count", selectedSessionId],
    queryFn: () => apiFetch(`/api/cycle-counts/${selectedSessionId}`),
    enabled: Boolean(selectedSessionId),
  });

  // Create session mutation
  const createMutation = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/cycle-counts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["cycle-counts"] });
      setIsCreateModalOpen(false);
      setSelectedSessionId(data._id);
      setCreateWarehouseId("");
      setCreateNotes("");
    },
  });

  // Submit counts mutation
  const submitCountsMutation = useMutation({
    mutationFn: ({ id, counts, submitForApproval }: { id: string; counts: any[]; submitForApproval: boolean }) =>
      apiFetch(`/api/cycle-counts/${id}/counts`, {
        method: "PUT",
        body: JSON.stringify({ counts, submitForApproval }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycle-counts"] });
      queryClient.invalidateQueries({ queryKey: ["cycle-count", selectedSessionId] });
      setSaveSuccessMsg("Physical counts saved successfully.");
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    },
  });

  // Reconcile mutation
  const reconcileMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/cycle-counts/${id}/reconcile`, {
        method: "POST",
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["cycle-counts"] });
      queryClient.invalidateQueries({ queryKey: ["cycle-count", selectedSessionId] });
      setReconcileSuccessMsg(res.message || "Cycle count reconciled and ledger adjusted.");
      setTimeout(() => setReconcileSuccessMsg(null), 4000);
    },
  });

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
    if (warehouseFilter !== "ALL" && s.warehouseId?._id !== warehouseFilter) return false;
    return true;
  });

  const activeCount = sessions.filter((s) => s.status === "IN_PROGRESS").length;
  const pendingCount = sessions.filter((s) => s.status === "PENDING_APPROVAL").length;
  const reconciledCount = sessions.filter((s) => s.status === "RECONCILED").length;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createWarehouseId) return;
    createMutation.mutate({
      warehouseId: createWarehouseId,
      blindCount: createBlindCount,
      notes: createNotes,
    });
  };

  const handleCountChange = (itemId: string, counted: number | null, reasonCode?: string, notes?: string) => {
    setEditedCounts((prev) => ({
      ...prev,
      [itemId]: {
        countedQuantity: counted,
        reasonCode: reasonCode ?? prev[itemId]?.reasonCode ?? "NONE",
        notes: notes ?? prev[itemId]?.notes ?? "",
      },
    }));
  };

  const handleSaveCounts = (submitForApproval: boolean) => {
    if (!selectedSessionId || !selectedSession) return;
    const countsPayload = selectedSession.items.map((item) => {
      const edit = editedCounts[item._id];
      return {
        itemId: item._id,
        countedQuantity: edit !== undefined ? edit.countedQuantity : item.countedQuantity,
        reasonCode: edit?.reasonCode || item.reasonCode,
        notes: edit?.notes !== undefined ? edit.notes : item.notes,
      };
    });

    submitCountsMutation.mutate({
      id: selectedSessionId,
      counts: countsPayload,
      submitForApproval,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-300 border border-amber-400/20">
                SAP/Zoho Enterprise Audit
              </span>
              <span className="text-xs text-slate-400">Physical Stocktake Engine</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Cycle Counting & Physical Reconciliation
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              Conduct periodic and blind inventory audits, detect shrinkage variance, and post signed, immutable ledger adjustments to keep book balances aligned with shelf reality.
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 shadow-md shadow-amber-400/10 hover:bg-amber-300 transition"
            >
              <span>+ Start Stocktake Audit</span>
            </button>
          )}
        </div>

        {/* Metrics Row */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">Total Audits</div>
            <div className="text-xl font-bold text-white mt-1">{sessions.length}</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="text-xs text-amber-300">In Progress</div>
            <div className="text-xl font-bold text-amber-400 mt-1">{activeCount}</div>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="text-xs text-sky-300">Pending Sign-off</div>
            <div className="text-xl font-bold text-sky-400 mt-1">{pendingCount}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-xs text-emerald-300">Reconciled & Balanced</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{reconciledCount}</div>
          </div>
        </div>
      </div>

      {/* Main Content: Split Master-Detail or Filtered List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sessions List Column */}
        <div className={`${selectedSessionId ? "lg:col-span-4" : "lg:col-span-12"} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/40 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Statuses</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="RECONCILED">Reconciled</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Warehouse:</span>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Facilities</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
              Loading cycle count audits…
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-12 text-center text-slate-400">
              <div className="text-lg font-semibold text-white">No Cycle Count Audits Found</div>
              <p className="mt-1 text-xs text-slate-500">
                Start a new audit session to verify shelf stock against the ledger.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSessions.map((session) => {
                const isSelected = session._id === selectedSessionId;
                return (
                  <div
                    key={session._id}
                    onClick={() => {
                      setSelectedSessionId(session._id);
                      setEditedCounts({});
                    }}
                    className={`cursor-pointer rounded-xl border p-4 transition ${
                      isSelected
                        ? "border-amber-400/50 bg-amber-400/5 shadow-md shadow-amber-400/5"
                        : "border-white/5 bg-slate-900/40 hover:border-white/15 hover:bg-slate-900/80"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-sm font-bold text-white">
                        {session.countNumber}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          session.status === "RECONCILED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : session.status === "PENDING_APPROVAL"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {session.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>📍 {session.warehouseId?.name || "Warehouse"}</span>
                      <span>{session.items?.length || 0} Products</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-white/5">
                      <span>{session.blindCount ? "🔒 Blind Mode" : "👁 Visible Expected"}</span>
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Audit Details & Counting Worksheet Column */}
        {selectedSessionId && (
          <div className="lg:col-span-8 space-y-4">
            {isLoadingSession || !selectedSession ? (
              <div className="rounded-xl border border-white/5 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
                Loading audit worksheet…
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl space-y-6">
                {/* Worksheet Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-white/10">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold font-mono text-white">
                        {selectedSession.countNumber}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                          selectedSession.status === "RECONCILED"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {selectedSession.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Facility: <span className="font-semibold text-white">{selectedSession.warehouseId?.name}</span> • Mode:{" "}
                      <span className="font-semibold text-white">
                        {selectedSession.blindCount ? "Blind Count (Expected Hidden)" : "Standard Audit"}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Close View
                    </button>

                    {selectedSession.status !== "RECONCILED" && (
                      <button
                        onClick={() => handleSaveCounts(false)}
                        disabled={submitCountsMutation.isPending}
                        className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition"
                      >
                        Save Draft
                      </button>
                    )}

                    {selectedSession.status !== "RECONCILED" && (
                      <button
                        onClick={() => handleSaveCounts(true)}
                        disabled={submitCountsMutation.isPending}
                        className="rounded-xl border border-sky-500/30 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/30 transition"
                      >
                        Submit for Sign-off
                      </button>
                    )}

                    {isAdmin && selectedSession.status !== "RECONCILED" && (
                      <button
                        onClick={() => reconcileMutation.mutate(selectedSession._id)}
                        disabled={reconcileMutation.isPending}
                        className="rounded-xl border border-emerald-400/40 bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md hover:bg-emerald-400 transition"
                      >
                        {reconcileMutation.isPending ? "Reconciling…" : "Approve & Reconcile"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Notifications */}
                {saveSuccessMsg && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    ✓ {saveSuccessMsg}
                  </div>
                )}
                {reconcileSuccessMsg && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    ✓ {reconcileSuccessMsg}
                  </div>
                )}

                {/* Worksheet Table */}
                <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Product / SKU</th>
                        <th className="p-3 text-center">Expected (Ledger)</th>
                        <th className="p-3 text-center">Counted (Physical)</th>
                        <th className="p-3 text-center">Variance</th>
                        <th className="p-3">Reason Code</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {selectedSession.items.map((item) => {
                        const edit = editedCounts[item._id];
                        const countedVal =
                          edit !== undefined ? edit.countedQuantity : item.countedQuantity;
                        const reasonVal = edit?.reasonCode || item.reasonCode;
                        const notesVal = edit?.notes !== undefined ? edit.notes : item.notes || "";

                        const hasExpected = item.expectedQuantity !== undefined;
                        const currentVariance =
                          hasExpected && countedVal !== null && countedVal !== undefined
                            ? countedVal - item.expectedQuantity!
                            : null;

                        const isLocked = selectedSession.status === "RECONCILED";

                        return (
                          <tr key={item._id} className="hover:bg-white/5 transition">
                            <td className="p-3">
                              <div className="font-semibold text-white">{item.productName}</div>
                              <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                            </td>

                            <td className="p-3 text-center font-mono font-semibold">
                              {hasExpected ? (
                                item.expectedQuantity
                              ) : (
                                <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-amber-300 border border-white/10">
                                  🔒 Blind Locked
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center">
                              {isLocked ? (
                                <span className="font-mono font-bold text-white">
                                  {countedVal ?? "—"}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Enter count"
                                  value={countedVal === null || countedVal === undefined ? "" : countedVal}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? null : Number(e.target.value);
                                    handleCountChange(item._id, val);
                                  }}
                                  className="w-24 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-center font-mono text-xs text-white focus:outline-none focus:border-amber-400"
                                />
                              )}
                            </td>

                            <td className="p-3 text-center font-mono font-bold">
                              {currentVariance === null ? (
                                <span className="text-slate-500">—</span>
                              ) : currentVariance === 0 ? (
                                <span className="text-emerald-400">0 (Match)</span>
                              ) : currentVariance > 0 ? (
                                <span className="text-sky-400">+{currentVariance} (Surplus)</span>
                              ) : (
                                <span className="text-rose-400">{currentVariance} (Loss)</span>
                              )}
                            </td>

                            <td className="p-3">
                              {isLocked ? (
                                <span className="text-[11px] text-slate-400">{reasonVal}</span>
                              ) : (
                                <select
                                  value={reasonVal}
                                  onChange={(e) => handleCountChange(item._id, countedVal, e.target.value)}
                                  className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
                                >
                                  {REASON_CODES.map((r) => (
                                    <option key={r.value} value={r.value}>
                                      {r.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>

                            <td className="p-3">
                              {isLocked ? (
                                <span className="text-[11px] text-slate-400">{notesVal || "—"}</span>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Aisle/bin note"
                                  value={notesVal}
                                  onChange={(e) =>
                                    handleCountChange(item._id, countedVal, reasonVal, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Start Cycle Count Modal */}
      {isCreateModalOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setIsCreateModalOpen(false)}
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-lg font-bold text-white">Start New Cycle Count Audit</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Target Warehouse Facility *
                  </label>
                  <select
                    required
                    value={createWarehouseId}
                    onChange={(e) => setCreateWarehouseId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Select a warehouse facility…</option>
                    {warehouses.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name} {w.code ? `(${w.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="blindCountToggle"
                    checked={createBlindCount}
                    onChange={(e) => setCreateBlindCount(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-500 focus:ring-0"
                  />
                  <div>
                    <label htmlFor="blindCountToggle" className="text-xs font-bold text-white cursor-pointer">
                      Enable Blind Count (Recommended by SAP / Zoho)
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Hides system expected inventory from counting staff to eliminate counting bias. Variance is computed automatically upon submission.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">Audit Scope</label>
                  <div className="mt-1 rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-slate-400">
                    ✓ All active product inventory lines within the selected facility
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">Session Notes</label>
                  <textarea
                    rows={2}
                    value={createNotes}
                    onChange={(e) => setCreateNotes(e.target.value)}
                    placeholder="e.g. End of Month Q3 physical audit, Aisle 1-4"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="rounded-xl border border-amber-400/40 bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition"
                  >
                    {createMutation.isPending ? "Creating…" : "Initialize Audit"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
