"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface WarehouseRef {
  _id: string;
  name: string;
  code: string;
}

interface TransferItem {
  _id?: string;
  product: {
    _id: string;
    name: string;
    sku?: string;
    uom?: string;
  };
  quantity: number;
  serialNumbers?: string[];
  receivedQuantity?: number;
}

interface StockTransfer {
  _id: string;
  transferNumber: string;
  fromWarehouse: WarehouseRef;
  toWarehouse: WarehouseRef;
  status: "DRAFT" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  items: TransferItem[];
  requestedBy: { name: string; email: string };
  notes?: string;
  createdAt: string;
}

interface ProductOption {
  _id: string;
  name: string;
  sku?: string;
  uom?: string;
  currentStock?: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft Request", color: "text-slate-300", bg: "bg-slate-700/30 border-slate-600/40" },
  APPROVED: { label: "Approved", color: "text-sky-300", bg: "bg-sky-500/20 border-sky-500/30" },
  IN_TRANSIT: { label: "In Transit 🚚", color: "text-amber-300", bg: "bg-amber-500/20 border-amber-500/30" },
  RECEIVED: { label: "Received ✅", color: "text-emerald-300", bg: "bg-emerald-500/20 border-emerald-500/30" },
  CANCELLED: { label: "Cancelled", color: "text-rose-300", bg: "bg-rose-500/20 border-rose-500/30" },
};

export default function StockTransfersPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isLoading, error } = useQuery<{ transfers: StockTransfer[]; total: number }>({
    queryKey: ["stock-transfers", statusFilter],
    queryFn: () => apiFetch(`/stock-transfers${statusFilter ? `?status=${statusFilter}` : ""}`),
  });

  const transfers = data?.transfers || [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/stock-transfers/${id}/approve`, { method: "PUT" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }),
  });

  const shipMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/stock-transfers/${id}/ship`, { method: "PUT" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/stock-transfers/${id}/receive`, { method: "PUT", body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/stock-transfers/${id}/cancel`, { method: "PUT", body: JSON.stringify({ reason: "User cancelled" }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }),
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Inventory Mobility</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">Inter-Warehouse Transfers</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dispatch, track, and confirm stock movements across locations with IN_TRANSIT ledger protection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <button
            id="new-transfer-btn"
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
          >
            <span>+ New Transfer</span>
          </button>
        </div>
      </div>

      {isLoading ? <div className="text-slate-400">Loading stock transfers…</div> : null}
      {error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error instanceof Error ? error.message : "Failed to load transfers"}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="overflow-x-auto rounded-[1.75rem] border border-white/10 bg-slate-900/40 backdrop-blur-xl">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs font-semibold text-slate-400">
              <tr>
                <th className="px-5 py-4">Transfer #</th>
                <th className="px-5 py-4">Movement Route</th>
                <th className="px-5 py-4">Items & Quantities</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transfers.map((trf) => {
                const conf = STATUS_CONFIG[trf.status] || STATUS_CONFIG.DRAFT;
                const totalUnits = trf.items.reduce((sum, it) => sum + (it.quantity || 0), 0);

                return (
                  <tr key={trf._id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <div className="font-mono text-sm font-bold text-amber-300">{trf.transferNumber}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {new Date(trf.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{trf.fromWarehouse?.name}</span>
                        <span className="text-slate-500">→</span>
                        <span className="font-medium text-white">{trf.toWarehouse?.name}</span>
                      </div>
                      <div className="font-mono text-xs text-slate-500 mt-0.5">
                        {trf.fromWarehouse?.code} → {trf.toWarehouse?.code}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-medium text-white">
                        {totalUnits} units ({trf.items.length} product{trf.items.length > 1 ? "s" : ""})
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-xs mt-0.5">
                        {trf.items.map((it) => `${it.product?.name || "Product"} (${it.quantity})`).join(", ")}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${conf.color} ${conf.bg}`}>
                        {conf.label}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {trf.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate(trf._id)}
                            disabled={approveMutation.isPending}
                            className="rounded-xl bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/30 transition"
                          >
                            Approve
                          </button>
                        ) : null}

                        {trf.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => shipMutation.mutate(trf._id)}
                            disabled={shipMutation.isPending}
                            className="rounded-xl bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition"
                          >
                            Ship Dispatch
                          </button>
                        ) : null}

                        {trf.status === "IN_TRANSIT" ? (
                          <button
                            type="button"
                            onClick={() => receiveMutation.mutate(trf._id)}
                            disabled={receiveMutation.isPending}
                            className="rounded-xl bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition"
                          >
                            Confirm Receipt
                          </button>
                        ) : null}

                        {trf.status !== "RECEIVED" && trf.status !== "CANCELLED" ? (
                          <button
                            type="button"
                            onClick={() => cancelMutation.mutate(trf._id)}
                            disabled={cancelMutation.isPending}
                            className="rounded-xl px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/20 transition"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    No stock transfers recorded yet. Create one with &quot;+ New Transfer&quot; above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* New Transfer Modal */}
      {showCreateModal ? (
        <CreateTransferModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["stock-transfers"] })}
        />
      ) : null}
    </div>
  );
}

function CreateTransferModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fromWarehouse, setFromWarehouse] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: "", quantity: 1 }
  ]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: warehouses = [] } = useQuery<WarehouseRef[]>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ["items"],
    queryFn: () => apiFetch("/items"),
  });

  const mutation = useMutation({
    mutationFn: (data: object) => apiFetch("/stock-transfers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create transfer"),
  });

  function addItemRow() {
    setItems([...items, { productId: "", quantity: 1 }]);
  }

  function removeItemRow(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItemRow(index: number, field: "productId" | "quantity", value: string | number) {
    const updated = [...items];
    if (field === "productId") {
      updated[index].productId = String(value);
    } else {
      updated[index].quantity = Math.max(1, Number(value));
    }
    setItems(updated);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fromWarehouse || !toWarehouse) {
      setError("Please select both source and destination warehouses");
      return;
    }
    if (fromWarehouse === toWarehouse) {
      setError("Source and destination warehouses cannot be the same");
      return;
    }
    const validItems = items.filter((it) => it.productId && it.quantity > 0);
    if (validItems.length === 0) {
      setError("Please add at least one product with quantity > 0");
      return;
    }

    mutation.mutate({
      fromWarehouse,
      toWarehouse,
      items: validItems.map((it) => ({
        product: it.productId,
        quantity: it.quantity,
      })),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">Create Stock Transfer</h3>
            <p className="text-xs text-slate-400 mt-0.5">Move inventory between regional warehouses</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">From Warehouse (Source) *</label>
              <select
                required
                value={fromWarehouse}
                onChange={(e) => setFromWarehouse(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              >
                <option value="">Select source warehouse...</option>
                {warehouses.map((wh) => (
                  <option key={wh._id} value={wh._id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">To Warehouse (Destination) *</label>
              <select
                required
                value={toWarehouse}
                onChange={(e) => setToWarehouse(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              >
                <option value="">Select destination warehouse...</option>
                {warehouses
                  .filter((wh) => wh._id !== fromWarehouse)
                  .map((wh) => (
                    <option key={wh._id} value={wh._id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Transfer Items</label>
              <button
                type="button"
                onClick={addItemRow}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
              >
                + Add Another Product
              </button>
            </div>

            {items.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  required
                  value={row.productId}
                  onChange={(e) => updateItemRow(idx, "productId", e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} {p.sku ? `[${p.sku}]` : ""} — Stock: {p.currentStock ?? 0} {p.uom || "PCS"}
                    </option>
                  ))}
                </select>

                <input
                  required
                  type="number"
                  min="1"
                  value={row.quantity}
                  onChange={(e) => updateItemRow(idx, "quantity", e.target.value)}
                  placeholder="Qty"
                  className="w-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />

                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    className="rounded-xl p-2 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 transition"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Transfer Notes / Reason</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rebalancing regional stock for Q3 sales surge"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {mutation.isPending ? "Submitting…" : "Create Transfer Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
