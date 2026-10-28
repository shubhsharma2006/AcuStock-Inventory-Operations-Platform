"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

interface ReorderAlert {
  productId: string;
  name: string;
  sku: string;
  trackingMode: string;
  currentStock: number;
  lowStockThreshold: number;
  reorderQuantity: number;
  suggestedOrderQty: number;
  unitCost: number;
  estimatedCost: number;
  autoPoEnabled: boolean;
  preferredSupplier?: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
  } | null;
}

interface ReorderResponse {
  alerts: ReorderAlert[];
  summary: {
    totalLowStockCount: number;
    totalEstimatedCost: number;
    suppliersCount: number;
  };
}

export default function ReorderHubPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const roleSlug = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : user?.role.toLowerCase() || "admin";

  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [generationResult, setGenerationResult] = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery<ReorderResponse>({
    queryKey: ["reorder-alerts"],
    queryFn: () => apiFetch("/api/reorder/alerts"),
  });

  const alerts = data?.alerts || [];
  const summary = data?.summary || { totalLowStockCount: 0, totalEstimatedCost: 0, suppliersCount: 0 };

  const filteredAlerts = alerts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.sku.toLowerCase().includes(search.toLowerCase()) ||
      (a.preferredSupplier?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const next: Record<string, boolean> = {};
      filteredAlerts.forEach((a) => {
        next[a.productId] = true;
      });
      setSelectedItems(next);
    } else {
      setSelectedItems({});
    }
  };

  const toggleItem = (productId: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const generateMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      apiFetch("/api/reorder/generate-pos", {
        method: "POST",
        body: JSON.stringify({ selectedItemIds: itemIds }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["reorder-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setSelectedItems({});
      setGenerationResult(res);
      refetch();
    },
  });

  const handleGenerate = () => {
    const selectedIds = Object.keys(selectedItems).filter((id) => selectedItems[id]);
    if (selectedIds.length === 0) return;
    generateMutation.mutate(selectedIds);
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-300 border border-amber-400/20">
                Automated Procurement
              </span>
              <span className="text-xs text-slate-400">Low-Stock Command Hub</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Replenishment & Smart Reorder Hub
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              Monitor inventory approaching or breaching safety stock thresholds. Batch-generate supplier purchase orders in one click to prevent out-of-stock downtime.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={selectedCount === 0 || generateMutation.isPending}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition shadow-lg ${
                selectedCount > 0
                  ? "border border-amber-400/40 bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-amber-400/10"
                  : "border border-white/5 bg-white/5 text-slate-500 cursor-not-allowed"
              }`}
            >
              {generateMutation.isPending
                ? "Generating POs…"
                : `⚡ Generate ${selectedCount} POs`}
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
            <div className="text-xs text-rose-300">Items at Reorder Point</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {summary.totalLowStockCount}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">Suppliers to Engage</div>
            <div className="text-2xl font-bold text-white mt-1">
              {summary.suppliersCount}
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="text-xs text-amber-300">Est. Replenishment Outlay</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              ₹{summary.totalEstimatedCost.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-xs text-emerald-300">Selected for PO</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {selectedCount}
            </div>
          </div>
        </div>
      </div>

      {/* Generation Result Banner */}
      {generationResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-emerald-300">
                ✓ {generationResult.message}
              </div>
              <p className="mt-1 text-xs text-emerald-400/80">
                Purchase orders have been saved as drafts grouped by vendor.
              </p>
            </div>
            <Link
              href={`/dashboard/${roleSlug}/purchase-orders`}
              className="rounded-xl border border-emerald-400/30 bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              Review POs →
            </Link>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/40 p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name, SKU, or supplier…"
          className="w-full sm:w-80 rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />

        <div className="text-xs text-slate-400">
          Showing <span className="font-semibold text-white">{filteredAlerts.length}</span> items
          needing attention
        </div>
      </div>

      {/* Alerts Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-xl">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400">Scanning stock ledger…</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <div className="text-lg font-semibold text-white">All Stock Levels Healthy 🎉</div>
            <p className="mt-1 text-xs text-slate-500">
              No products are currently breaching their reorder safety thresholds.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredAlerts.length > 0 &&
                        filteredAlerts.every((a) => selectedItems[a.productId])
                      }
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-500 focus:ring-0"
                    />
                  </th>
                  <th className="p-3">Product / SKU</th>
                  <th className="p-3 text-center">Current Stock</th>
                  <th className="p-3 text-center">Safety Threshold</th>
                  <th className="p-3 text-center">Suggested PO Qty</th>
                  <th className="p-3">Preferred Supplier</th>
                  <th className="p-3 text-right">Est. Outlay</th>
                  <th className="p-3 text-center">Auto-PO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredAlerts.map((alert) => {
                  const isChecked = Boolean(selectedItems[alert.productId]);

                  return (
                    <tr
                      key={alert.productId}
                      className={`hover:bg-white/5 transition ${
                        isChecked ? "bg-amber-400/5" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(alert.productId)}
                          className="h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-500 focus:ring-0"
                        />
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-white">{alert.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{alert.sku}</div>
                      </td>

                      <td className="p-3 text-center">
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-mono text-xs font-bold text-rose-300 border border-rose-500/30">
                          {alert.currentStock} units
                        </span>
                      </td>

                      <td className="p-3 text-center font-mono text-slate-400">
                        {alert.lowStockThreshold}
                      </td>

                      <td className="p-3 text-center font-mono font-bold text-amber-300">
                        +{alert.suggestedOrderQty}
                      </td>

                      <td className="p-3">
                        {alert.preferredSupplier ? (
                          <div>
                            <div className="font-semibold text-white">
                              {alert.preferredSupplier.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {alert.preferredSupplier.email || "—"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-400/80">
                            ⚠ No Supplier Configured
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right font-mono font-semibold text-white">
                        ₹{alert.estimatedCost.toLocaleString()}
                      </td>

                      <td className="p-3 text-center">
                        {alert.autoPoEnabled ? (
                          <span className="inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            ⚡ Active
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Manual</span>
                        )}
                      </td>
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
