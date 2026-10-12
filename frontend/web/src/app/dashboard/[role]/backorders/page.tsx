"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface BackorderItem {
  salesOrderId: string;
  soNumber: string;
  buyer: { name: string; email?: string };
  expectedDeliveryDate?: string;
  orderLineId: string;
  product: {
    _id: string;
    name: string;
    sku: string;
    trackingMode?: string;
    purchasePrice?: number;
  };
  orderedQty: number;
  fulfilledQty: number;
  backorderedQty: number;
}

interface Company {
  _id: string;
  name: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
  background: "rgba(11,20,36,0.7)", border: "1px solid rgba(148,163,184,0.18)", color: "#ecf3ff", outline: "none",
};

export default function BackordersPage() {
  const queryClient = useQueryClient();
  const [selectedSoId, setSelectedSoId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch all backorders
  const { data: backorderData, isLoading } = useQuery<{ success: boolean; backorders: BackorderItem[] }>({
    queryKey: ["backorders-all"],
    queryFn: () => apiFetch("/api/sales-orders/backorders/all"),
  });

  // Fetch companies for supplier selection
  const { data: companiesData } = useQuery<{ companies: Company[] } | Company[]>({
    queryKey: ["companies-list"],
    queryFn: () => apiFetch("/api/companies?limit=100"),
  });

  const companies: Company[] = Array.isArray(companiesData)
    ? companiesData
    : (companiesData?.companies || []);

  const poMutation = useMutation({
    mutationFn: (payload: { salesOrderId: string; supplierId: string }) => apiFetch<{ success: boolean; po: { poNumber: string } }>(
      "/api/packages/backorder-to-po",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    ),
    onSuccess: (res) => {
      setSuccessMsg(`Draft Purchase Order ${res.po?.poNumber || ""} successfully created from backorders!`);
      setModalOpen(false);
      setSelectedSoId(null);
      queryClient.invalidateQueries({ queryKey: ["backorders-all"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to create PO from backorders");
    }
  });

  const backorders = backorderData?.backorders || [];
  const totalBackorderedUnits = backorders.reduce((sum, item) => sum + (item.backorderedQty || 0), 0);
  const uniqueOrdersCount = new Set(backorders.map((b) => b.salesOrderId)).size;

  const panelStyle: React.CSSProperties = {
    background: "rgba(11,20,36,0.82)", border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14, backdropFilter: "blur(18px)",
  };

  function openPoModal(soId: string) {
    setSelectedSoId(soId);
    setActionError(null);
    setSuccessMsg(null);
    if (companies.length > 0) {
      setSelectedSupplierId(companies[0]._id);
    }
    setModalOpen(true);
  }

  function handleCreatePo() {
    if (!selectedSoId || !selectedSupplierId) {
      setActionError("Please select a supplier to issue the Purchase Order.");
      return;
    }
    poMutation.mutate({
      salesOrderId: selectedSoId,
      supplierId: selectedSupplierId
    });
  }

  return (
    <main style={{ padding: "1.5rem" }} className="animate-fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 2 }}>Backorder Management</h1>
          <p style={{ color: "#9bb0cb", fontSize: 13 }}>
            Track unfulfilled sales order items across orders and convert backorders to vendor purchase orders.
          </p>
        </div>
      </div>

      {successMsg && (
        <div style={{
          background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)",
          borderRadius: 8, padding: "10px 16px", color: "#34d399", fontSize: 13, marginBottom: 16
        }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Metrics Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div style={{ ...panelStyle, padding: "1rem" }}>
          <p style={{ color: "#9bb0cb", fontSize: 12, margin: 0 }}>Backordered Units</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: "#fb7185", margin: "4px 0 0" }}>{totalBackorderedUnits}</p>
        </div>
        <div style={{ ...panelStyle, padding: "1rem" }}>
          <p style={{ color: "#9bb0cb", fontSize: 12, margin: 0 }}>Affected Sales Orders</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b", margin: "4px 0 0" }}>{uniqueOrdersCount}</p>
        </div>
        <div style={{ ...panelStyle, padding: "1rem" }}>
          <p style={{ color: "#9bb0cb", fontSize: 12, margin: 0 }}>Active Lines Waiting</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: "#5498ff", margin: "4px 0 0" }}>{backorders.length}</p>
        </div>
      </div>

      {/* Backorders Table */}
      <div style={panelStyle} className="table-responsive">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
              {["Sales Order", "Customer", "Item / SKU", "Ordered", "Fulfilled", "Backordered", "Expected Delivery", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#9bb0cb", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={8} style={{ padding: "12px 16px" }}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td></tr>
              ))
            ) : backorders.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "2.5rem", textAlign: "center", color: "#9bb0cb", fontSize: 13 }}>No active backorders found. All order lines are either fulfilled or in draft.</td></tr>
            ) : (
              backorders.map((b, idx) => (
                <tr
                  key={idx}
                  style={{ borderBottom: "1px solid rgba(148,163,184,0.07)", transition: "background 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(148,163,184,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#5498ff", fontWeight: 600 }}>
                    {b.soNumber}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>
                    {b.buyer?.name || "Customer"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>
                    {b.product?.name || "Product"}
                    {b.product?.sku && <span style={{ color: "#9bb0cb", fontSize: 11, marginLeft: 6 }}>({b.product.sku})</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>
                    {b.orderedQty}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#34d399", fontWeight: 600 }}>
                    {b.fulfilledQty}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#fb7185", fontWeight: 700 }}>
                    {b.backorderedQty}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#9bb0cb" }}>
                    {b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate).toLocaleDateString() : "Not specified"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => openPoModal(b.salesOrderId)}
                      style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)",
                        color: "#f59e0b", cursor: "pointer"
                      }}
                    >
                      Create PO
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Convert to PO Modal */}
      {modalOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 120,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16
        }}>
          <div style={{
            background: "#0b1424", border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 500
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#ecf3ff", margin: "0 0 12px" }}>
              Generate Vendor Purchase Order
            </h2>
            <p style={{ color: "#9bb0cb", fontSize: 12, marginBottom: 16 }}>
              This will create a draft Purchase Order for all backordered items on this sales order.
            </p>

            <label style={{ display: "block", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: "#9bb0cb", display: "block", marginBottom: 5 }}>Select Vendor / Supplier *</span>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                style={inputStyle}
              >
                {companies.length === 0 ? (
                  <option value="">No suppliers available</option>
                ) : (
                  companies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))
                )}
              </select>
            </label>

            {actionError && (
              <div style={{
                background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.3)",
                borderRadius: 8, padding: "8px 14px", color: "#fb7185", fontSize: 12, marginBottom: 16
              }}>
                ⚠ {actionError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: "8px 18px", borderRadius: 8, background: "transparent",
                  border: "1px solid rgba(148,163,184,0.2)", color: "#9bb0cb", cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePo}
                disabled={poMutation.isPending || !selectedSupplierId}
                style={{
                  padding: "8px 20px", borderRadius: 8, background: "rgba(52,211,153,0.85)",
                  border: "none", color: "#07111f", fontWeight: 700, cursor: "pointer",
                  opacity: poMutation.isPending ? 0.6 : 1
                }}
              >
                {poMutation.isPending ? "Generating…" : "Generate Draft PO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
