"use client";

import { useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";

export interface POItemLine {
  productId: {
    _id: string;
    name: string;
    shortName?: string;
    sku?: string;
    trackingMode?: "NONE" | "SERIAL" | "BATCH";
    serialPolicy?: {
      enableSerial?: boolean;
      requireSerialOnIN?: boolean;
    };
  } | string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface PurchaseOrderData {
  _id: string;
  poNumber: string;
  supplier: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  items: POItemLine[];
  status: string;
  totalValue?: number;
  expectedDeliveryDate?: string;
}

interface POReceiveModalProps {
  po: PurchaseOrderData;
  onClose: () => void;
  onSuccess?: () => void;
}

type WarehouseItem = {
  _id: string;
  name: string;
  code?: string;
  isPrimary?: boolean;
};

export function POReceiveModal({ po, onClose, onSuccess }: POReceiveModalProps) {
  const queryClient = useQueryClient();

  const { data: warehousesData } = useQuery<WarehouseItem[] | { warehouses: WarehouseItem[] }>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  const warehouses = useMemo(() => {
    if (Array.isArray(warehousesData)) return warehousesData;
    return (warehousesData as any)?.warehouses || [];
  }, [warehousesData]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() => {
    return warehouses[0]?._id || "";
  });

  const [dockNotes, setDockNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Line receiving state
  const [lineReceivingState, setLineReceivingState] = useState<Record<string, {
    receivedQuantity: number;
    serialNumbers: string;
    lotNumber: string;
    expiryDate: string;
    supplierBatchNumber: string;
    condition: string;
  }>>(() => {
    const initial: Record<string, any> = {};
    for (const item of po.items) {
      const pid = typeof item.productId === "object" ? item.productId._id : item.productId;
      initial[pid] = {
        receivedQuantity: item.quantity,
        serialNumbers: "",
        lotNumber: "",
        expiryDate: "",
        supplierBatchNumber: "",
        condition: "new",
      };
    }
    return initial;
  });

  function updateLine(productId: string, patch: Partial<typeof lineReceivingState[string]>) {
    setLineReceivingState((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        ...patch,
      },
    }));
  }

  async function handleConfirmReceive() {
    setLoading(true);
    setError(null);

    try {
      const receivedItemsPayload = po.items.map((line) => {
        const prod = typeof line.productId === "object" ? line.productId : { _id: line.productId, name: "Product" };
        const state = lineReceivingState[prod._id] || {
          receivedQuantity: line.quantity,
          serialNumbers: "",
          lotNumber: "",
          expiryDate: "",
          supplierBatchNumber: "",
          condition: "new",
        };

        const parsedSerials = state.serialNumbers
          .split(/[\n,]/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);

        return {
          productId: prod._id,
          receivedQuantity: Number(state.receivedQuantity),
          serialNumbers: parsedSerials,
          lotNumber: state.lotNumber.trim().toUpperCase() || undefined,
          expiryDate: state.expiryDate ? new Date(state.expiryDate).toISOString() : undefined,
          supplierBatchNumber: state.supplierBatchNumber.trim() || undefined,
          condition: state.condition || "new",
        };
      });

      await apiFetch(`/purchase-orders/${po._id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          warehouseId: selectedWarehouseId || undefined,
          dockNotes: dockNotes.trim() || undefined,
          receivedItems: receivedItemsPayload,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-lots"] });
      queryClient.invalidateQueries({ queryKey: ["stock-ledger"] });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive Purchase Order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                Dock GRN 3-Way Match
              </span>
              <span className="font-mono text-sm font-bold text-white">
                PO #{po.poNumber}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Supplier: <strong className="text-slate-200">{po.supplier.name}</strong> · Status: {po.status.toUpperCase()}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              ⚠️ {error}
            </div>
          )}

          {/* Receiving Hub & Logistics Info */}
          <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Receiving Warehouse Hub <span className="text-rose-400">*</span>
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-400/40"
              >
                {warehouses.map((w: WarehouseItem) => (
                  <option key={w._id} value={w._id}>
                    {w.name} {w.code ? `(${w.code})` : ""} {w.isPrimary ? "★ Primary" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Dock Receiving / Inspector Notes
              </label>
              <input
                type="text"
                value={dockNotes}
                onChange={(e) => setDockNotes(e.target.value)}
                placeholder="e.g. Received via Transporter, seals intact, 3 pallets"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-400/40"
              />
            </div>
          </div>

          {/* Line Items Receiving & 3-Way Match */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Purchase Order Line Items ({po.items.length})</span>
              <span className="text-xs font-normal text-slate-400">
                Verify physically delivered quantities against PO line items
              </span>
            </h3>

            <div className="space-y-4">
              {po.items.map((line) => {
                const prod = typeof line.productId === "object" ? line.productId : { _id: line.productId, name: "Product", sku: "" };
                const state = lineReceivingState[prod._id] || {
                  receivedQuantity: line.quantity,
                  serialNumbers: "",
                  lotNumber: "",
                  expiryDate: "",
                  supplierBatchNumber: "",
                  condition: "new",
                };

                const isBatchTracked = (prod as any).trackingMode === "BATCH";
                const isSerialTracked = Boolean((prod as any).serialPolicy?.enableSerial && (prod as any).serialPolicy?.requireSerialOnIN);

                return (
                  <div
                    key={prod._id}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                      <div>
                        <span className="font-semibold text-white text-sm">
                          {prod.name}
                        </span>
                        {prod.sku && (
                          <span className="ml-2 font-mono text-xs text-slate-400">
                            [{prod.sku}]
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">
                          Ordered: <strong className="text-white">{line.quantity}</strong>
                        </span>
                        <span className="text-slate-400">
                          Unit Price: <strong className="text-white font-mono">₹{line.unitPrice}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Receiving Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={line.quantity}
                          value={state.receivedQuantity}
                          onChange={(e) => updateLine(prod._id, { receivedQuantity: parseInt(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-amber-400/40"
                        />
                        {state.receivedQuantity < line.quantity && (
                          <span className="text-[10px] text-amber-300 font-medium">
                            ⚠️ Partial receipt ({line.quantity - state.receivedQuantity} unfulfilled)
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Item Condition
                        </label>
                        <select
                          value={state.condition}
                          onChange={(e) => updateLine(prod._id, { condition: e.target.value })}
                          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400/40"
                        >
                          <option value="new">Brand New / Factory Sealed</option>
                          <option value="good">Good / Inspected</option>
                          <option value="damaged">Damaged Box / Flagged</option>
                        </select>
                      </div>

                      {/* Batch Tracked fields */}
                      {isBatchTracked && (
                        <div>
                          <label className="block text-[11px] font-medium text-emerald-300 mb-1">
                            Batch / Lot # & Expiry *
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              placeholder="BATCH-ID"
                              value={state.lotNumber}
                              onChange={(e) => updateLine(prod._id, { lotNumber: e.target.value.toUpperCase() })}
                              className="w-1/2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2 py-1.5 font-mono text-xs text-white uppercase outline-none focus:border-emerald-400/50"
                            />
                            <input
                              type="date"
                              value={state.expiryDate}
                              onChange={(e) => updateLine(prod._id, { expiryDate: e.target.value })}
                              className="w-1/2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-400/50"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Serial Numbers Field if required */}
                    {isSerialTracked && (
                      <div className="pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-medium text-amber-300">
                            Serial Numbers ({state.receivedQuantity} required)
                          </label>
                          <span className="text-[10px] text-slate-400">
                            Comma or newline separated
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          value={state.serialNumbers}
                          onChange={(e) => updateLine(prod._id, { serialNumbers: e.target.value })}
                          placeholder="SN-1001, SN-1002, SN-1003"
                          className="w-full rounded-lg border border-amber-400/20 bg-slate-900 p-2 font-mono text-xs text-white uppercase outline-none focus:border-amber-400/40"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleConfirmReceive}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-emerald-400 px-6 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 disabled:opacity-50 transition shadow-lg shadow-emerald-500/10 flex items-center gap-2"
          >
            {loading ? (
              <span>Writing Ledger & Ingesting Stock...</span>
            ) : (
              <span>Confirm Dock GRN & Sign Ledger</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
