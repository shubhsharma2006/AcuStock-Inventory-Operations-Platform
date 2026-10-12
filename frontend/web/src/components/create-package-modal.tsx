"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SalesOrderLineItem {
  _id?: string;
  productId: {
    _id: string;
    name: string;
    sku: string;
    trackingMode?: 'NONE' | 'SERIAL' | 'BATCH';
  } | string;
  quantity: number;
  reservedQty?: number;
  fulfilledQty?: number;
  backorderedQty?: number;
  unitPrice: number;
}

export interface SalesOrderForPackage {
  _id: string;
  soNumber: string;
  buyer?: { name: string };
  items: SalesOrderLineItem[];
}

interface CreatePackageModalProps {
  salesOrder: SalesOrderForPackage;
  onClose: () => void;
  onCreated: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#9bb0cb", display: "block", marginBottom: 5 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
  background: "rgba(11,20,36,0.7)", border: "1px solid rgba(148,163,184,0.18)", color: "#ecf3ff", outline: "none",
};

export default function CreatePackageModal({ salesOrder, onClose, onCreated }: CreatePackageModalProps) {
  const [carrier, setCarrier] = useState("Delhivery");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [weight, setWeight] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Initialize line items with remaining packable quantities
  const [packingItems, setPackingItems] = useState(() => {
    return (salesOrder.items || []).map((line) => {
      const pId = typeof line.productId === 'object' && line.productId ? line.productId._id : String(line.productId || '');
      const pName = typeof line.productId === 'object' && line.productId ? line.productId.name : 'Item';
      const pSku = typeof line.productId === 'object' && line.productId ? line.productId.sku : '';
      const pMode = typeof line.productId === 'object' && line.productId ? (line.productId.trackingMode || 'NONE') : 'NONE';

      const ordered = line.quantity || 0;
      const fulfilled = line.fulfilledQty || 0;
      const remaining = Math.max(0, ordered - fulfilled);

      return {
        orderLineId: line._id,
        productId: pId,
        name: pName,
        sku: pSku,
        trackingMode: pMode,
        orderedQty: ordered,
        fulfilledQty: fulfilled,
        remainingQty: remaining,
        packQty: remaining, // default to packing entire remaining
        serialNumbers: "",
        lotNumber: ""
      };
    });
  });

  const mutation = useMutation({
    mutationFn: (payload: object) => apiFetch("/api/packages", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create package");
    }
  });

  function updatePackQty(index: number, val: number) {
    setPackingItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const bounded = Math.max(0, Math.min(item.remainingQty, val || 0));
      return { ...item, packQty: bounded };
    }));
  }

  function updateField(index: number, field: "serialNumbers" | "lotNumber", val: string) {
    setPackingItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: val } : item));
  }

  function handleSubmit() {
    setError(null);
    const activeLines = packingItems.filter((line) => line.packQty > 0);

    if (activeLines.length === 0) {
      setError("Please specify at least 1 unit to pack across the line items.");
      return;
    }

    // Validate serials if SERIAL tracking mode
    for (const line of activeLines) {
      if (line.trackingMode === 'SERIAL') {
        const serials = line.serialNumbers.split(',').map((s) => s.trim()).filter(Boolean);
        if (serials.length !== line.packQty) {
          setError(`Item "${line.name}" requires exactly ${line.packQty} serial numbers (provided: ${serials.length}).`);
          return;
        }
      }
    }

    const payload = {
      salesOrderId: salesOrder._id,
      carrier,
      trackingNumber: trackingNumber.trim() || undefined,
      weight: weight ? Number(weight) : undefined,
      notes: notes.trim() || undefined,
      lineItems: activeLines.map((line) => ({
        orderLineId: line.orderLineId,
        productId: line.productId,
        quantity: line.packQty,
        lotNumber: line.lotNumber.trim() || undefined,
        serialNumbers: line.trackingMode === 'SERIAL'
          ? line.serialNumbers.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined
      }))
    };

    mutation.mutate(payload);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 110,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }}>
      <div style={{
        background: "#0b1424", border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 760,
        maxHeight: "90vh", overflowY: "auto"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#ecf3ff", margin: 0 }}>
              Create Package / Fulfillment
            </h2>
            <p style={{ color: "#9bb0cb", fontSize: 12, marginTop: 4 }}>
              Order: <span style={{ color: "#5498ff", fontWeight: 600 }}>{salesOrder.soNumber}</span> • Customer: {salesOrder.buyer?.name || 'N/A'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9bb0cb", fontSize: 18, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Carrier & Shipment Header Fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <label>
            <span style={labelStyle}>Carrier / Transporter *</span>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              style={inputStyle}
            >
              <option value="Delhivery">Delhivery</option>
              <option value="BlueDart">BlueDart</option>
              <option value="FedEx">FedEx</option>
              <option value="DHL">DHL</option>
              <option value="Standard">Standard / In-house</option>
            </select>
          </label>

          <label>
            <span style={labelStyle}>Tracking Number</span>
            <input
              style={inputStyle}
              placeholder="e.g. TRK-98124578"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </label>

          <label>
            <span style={labelStyle}>Package Weight (kg)</span>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 1.25"
              value={weight}
              onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : "")}
            />
          </label>
        </div>

        {/* Line Items Packing Table */}
        <p style={{ fontSize: 13, fontWeight: 600, color: "#ecf3ff", marginBottom: 8 }}>
          Pack Order Line Items
        </p>
        <div style={{
          background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 10, padding: 12, marginBottom: 20
        }}>
          {packingItems.map((line, idx) => (
            <div
              key={idx}
              style={{
                borderBottom: idx < packingItems.length - 1 ? "1px solid rgba(148,163,184,0.1)" : "none",
                paddingBottom: 12,
                marginBottom: idx < packingItems.length - 1 ? 12 : 0
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ecf3ff" }}>{line.name}</span>
                  <span style={{ fontSize: 11, color: "#9bb0cb", marginLeft: 8 }}>SKU: {line.sku || 'N/A'}</span>
                  {line.trackingMode !== 'NONE' && (
                    <span style={{
                      marginLeft: 8, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: line.trackingMode === 'BATCH' ? "rgba(167,139,250,0.18)" : "rgba(84,152,255,0.18)",
                      color: line.trackingMode === 'BATCH' ? "#a78bfa" : "#5498ff"
                    }}>
                      {line.trackingMode}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#9bb0cb" }}>
                  Ordered: <b style={{ color: "#ecf3ff" }}>{line.orderedQty}</b> | Fulfilled: <b style={{ color: "#34d399" }}>{line.fulfilledQty}</b> | Unfulfilled: <b style={{ color: "#fb7185" }}>{line.remainingQty}</b>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: line.trackingMode !== 'NONE' ? "140px 1fr" : "140px", gap: 12, alignItems: "center" }}>
                <label>
                  <span style={{ fontSize: 11, color: "#9bb0cb" }}>Pack Qty:</span>
                  <input
                    style={{ ...inputStyle, padding: "6px 10px", marginTop: 2 }}
                    type="number"
                    min="0"
                    max={line.remainingQty}
                    value={line.packQty}
                    onChange={(e) => updatePackQty(idx, parseInt(e.target.value) || 0)}
                  />
                </label>

                {line.packQty > 0 && line.trackingMode === 'SERIAL' && (
                  <label>
                    <span style={{ fontSize: 11, color: "#9bb0cb" }}>Serial Numbers (comma-separated, exactly {line.packQty}):</span>
                    <input
                      style={{ ...inputStyle, padding: "6px 10px", marginTop: 2 }}
                      placeholder="SN001, SN002, ..."
                      value={line.serialNumbers}
                      onChange={(e) => updateField(idx, "serialNumbers", e.target.value)}
                    />
                  </label>
                )}

                {line.packQty > 0 && line.trackingMode === 'BATCH' && (
                  <label>
                    <span style={{ fontSize: 11, color: "#9bb0cb" }}>Lot / Batch Number (leave blank for auto-allocation FEFO):</span>
                    <input
                      style={{ ...inputStyle, padding: "6px 10px", marginTop: 2 }}
                      placeholder="e.g. LOT-2026-001 (optional)"
                      value={line.lotNumber}
                      onChange={(e) => updateField(idx, "lotNumber", e.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={labelStyle}>Packing & Handling Notes</span>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            placeholder="Fragile, handle with care, warehouse bay reference..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && (
          <div style={{
            background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.3)",
            borderRadius: 8, padding: "8px 14px", color: "#fb7185", fontSize: 12, marginBottom: 16
          }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px", borderRadius: 8, background: "transparent",
              border: "1px solid rgba(148,163,184,0.2)", color: "#9bb0cb", cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{
              padding: "9px 20px", borderRadius: 8, background: "rgba(84,152,255,0.85)",
              border: "none", color: "#ffffff", fontWeight: 700, cursor: "pointer",
              opacity: mutation.isPending ? 0.6 : 1
            }}
          >
            {mutation.isPending ? "Creating Package…" : "Confirm & Pack"}
          </button>
        </div>
      </div>
    </div>
  );
}
