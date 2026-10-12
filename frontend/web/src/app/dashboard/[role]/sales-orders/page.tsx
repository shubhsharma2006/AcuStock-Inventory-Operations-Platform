"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadAuthenticatedPdf } from "@/lib/api";
import CreatePackageModal, { SalesOrderForPackage } from "@/components/create-package-modal";
import GenerateLabelModal, { PackageForLabel } from "@/components/generate-label-modal";

interface PackageItem {
  _id: string;
  packageNumber: string;
  salesOrderId: string;
  status: string;
  carrier?: string;
  trackingNumber?: string;
  weight?: number;
  shippingLabelId?: string;
  createdAt: string;
}

interface OrderLineItem {
  _id: string;
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
  isBackordered?: boolean;
  unitPrice: number;
}

interface SalesOrder {
  _id: string;
  soNumber: string;
  buyer: { name: string; email?: string; company?: string; address?: string };
  status: string;
  fulfillmentStatus?: string;
  totalValue: number;
  items?: OrderLineItem[];
  packages?: PackageItem[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#9bb0cb",
  confirmed: "#5498ff",
  partially_fulfilled: "#f59e0b",
  fulfilled: "#10b981",
  picking: "#a78bfa",
  dispatched: "#34d399",
  delivered: "#34d399",
  cancelled: "#fb7185",
};

const FULFILLMENT_COLORS: Record<string, string> = {
  UNFULFILLED: "#9bb0cb",
  PARTIALLY_FULFILLED: "#f59e0b",
  FULFILLED: "#34d399"
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#9bb0cb";
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      color,
    }}>
      {status.replace(/_/g, " ").toUpperCase()}
    </span>
  );
}

function FulfillmentBadge({ status }: { status?: string }) {
  if (!status) return null;
  const color = FULFILLMENT_COLORS[status] || "#9bb0cb";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
      background: `${color}15`,
      border: `1px solid ${color}35`,
      color,
      marginLeft: 6
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#9bb0cb", display: "block", marginBottom: 5 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13,
  background: "rgba(11,20,36,0.7)", border: "1px solid rgba(148,163,184,0.18)", color: "#ecf3ff", outline: "none",
};

function CreateSoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [items, setItems] = useState([{ productId: "", quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: object) => apiFetch("/api/sales-orders", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create SO"),
  });

  function updateItem(idx: number, field: string, value: string | number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#0b1424", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#ecf3ff", marginBottom: 20 }}>New Sales Order</h2>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={labelStyle}>Buyer / Customer Name *</span>
          <input style={inputStyle} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Customer name" />
        </label>
        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={labelStyle}>Buyer Email</span>
          <input style={inputStyle} type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="customer@email.com" />
        </label>

        <p style={{ fontSize: 13, fontWeight: 600, color: "#ecf3ff", marginBottom: 10 }}>Line Items</p>
        {items.map((item, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input style={inputStyle} placeholder="Product ID or SKU" value={item.productId} onChange={(e) => updateItem(i, "productId", e.target.value)} />
            <input style={inputStyle} type="number" placeholder="Qty" min="1" value={item.quantity} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)} />
            <input style={inputStyle} type="number" placeholder="Unit Price" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)} />
            <button onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} style={{ background: "rgba(251,113,133,0.1)", border: "1px solid rgba(251,113,133,0.3)", borderRadius: 6, color: "#fb7185", cursor: "pointer", padding: "0 10px", minHeight: "unset", minWidth: "unset", height: 38 }}>✕</button>
          </div>
        ))}
        <button onClick={() => setItems((prev) => [...prev, { productId: "", quantity: 1, unitPrice: 0 }])} style={{ fontSize: 12, color: "#5498ff", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16, minHeight: "unset" }}>
          + Add line item
        </button>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={labelStyle}>Notes</span>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p style={{ color: "#fb7185", fontSize: 12, marginBottom: 12 }}>⚠ {error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, background: "transparent", border: "1px solid rgba(148,163,184,0.2)", color: "#9bb0cb", cursor: "pointer", minHeight: "unset", minWidth: "unset" }}>Cancel</button>
          <button
            id="create-so-submit"
            onClick={() => mutation.mutate({ buyer: { name: buyerName, email: buyerEmail }, items, notes })}
            disabled={!buyerName.trim() || mutation.isPending}
            style={{ padding: "10px 20px", borderRadius: 8, background: "rgba(52,211,153,0.85)", border: "none", color: "#07111f", fontWeight: 700, cursor: "pointer", minHeight: "unset", minWidth: "unset" }}
          >
            {mutation.isPending ? "Creating…" : "Create SO"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, color, loading, onClick, id }: { label: string; color: string; loading: boolean; onClick: () => void; id: string }) {
  return (
    <button id={id} onClick={onClick} disabled={loading} style={{
      padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: `${color}15`, border: `1px solid ${color}40`, color, cursor: loading ? "not-allowed" : "pointer",
      opacity: loading ? 0.6 : 1, minHeight: "unset", minWidth: "unset",
    }}>
      {loading ? "…" : label}
    </button>
  );
}

export default function SalesOrdersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Partial fulfillment and label modals state
  const [packOrder, setPackOrder] = useState<SalesOrderForPackage | null>(null);
  const [labelPackage, setLabelPackage] = useState<PackageForLabel | null>(null);
  const [expandedSoId, setExpandedSoId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ orders: SalesOrder[]; total: number }>({
    queryKey: ["sales-orders", statusFilter],
    queryFn: () => apiFetch(`/api/sales-orders?limit=50${statusFilter ? `&status=${statusFilter}` : ""}`),
  });

  async function handleAction(id: string, action: "confirm" | "dispatch" | "cancel") {
    setActionLoading(id + action);
    try {
      await apiFetch(`/api/sales-orders/${id}/${action}`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDispatchPackage(packageId: string) {
    setActionLoading(packageId + "pkg_dispatch");
    try {
      await apiFetch(`/api/packages/${packageId}/dispatch`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to dispatch package");
    } finally {
      setActionLoading(null);
    }
  }

  const panelStyle: React.CSSProperties = {
    background: "rgba(11,20,36,0.82)", border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14, backdropFilter: "blur(18px)",
  };

  return (
    <main style={{ padding: "1.5rem" }} className="animate-fade-in">
      {showCreate && (
        <CreateSoModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["sales-orders"] })}
        />
      )}

      {packOrder && (
        <CreatePackageModal
          salesOrder={packOrder}
          onClose={() => setPackOrder(null)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["sales-orders"] })}
        />
      )}

      {labelPackage && (
        <GenerateLabelModal
          pkg={labelPackage}
          onClose={() => setLabelPackage(null)}
          onGenerated={() => queryClient.invalidateQueries({ queryKey: ["sales-orders"] })}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 2 }}>Sales Orders & Fulfillment</h1>
          <p style={{ color: "#9bb0cb", fontSize: 13 }}>
            Manage customer orders, partial package fulfillment, backorders, and shipping labels.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: "auto", fontSize: 12 }}>
            <option value="">All statuses</option>
            {["draft", "confirmed", "partially_fulfilled", "fulfilled", "picking", "dispatched", "delivered", "cancelled"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").toUpperCase()}</option>
            ))}
          </select>
          <button
            id="create-so-btn"
            onClick={() => setShowCreate(true)}
            style={{ padding: "10px 20px", borderRadius: 8, background: "rgba(52,211,153,0.85)", border: "none", color: "#07111f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            + New SO
          </button>
        </div>
      </div>

      <div style={panelStyle} className="table-responsive">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#9bb0cb", fontWeight: 600, width: 36 }}></th>
              {["SO Number", "Buyer", "Status & Fulfillment", "Total Value", "Packages", "Created", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#9bb0cb", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={8} style={{ padding: "12px 16px" }}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td></tr>
              ))
            ) : !data?.orders?.length ? (
              <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#9bb0cb", fontSize: 13 }}>No sales orders yet. Click &quot;+ New SO&quot; to create one.</td></tr>
            ) : data.orders.map((so) => {
              const isExpanded = expandedSoId === so._id;
              const packagesCount = so.packages?.length || 0;

              return (
                <React.Fragment key={so._id}>
                  <tr
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid rgba(148,163,184,0.07)",
                      background: isExpanded ? "rgba(84,152,255,0.05)" : "transparent",
                      transition: "background 0.15s"
                    }}
                  >
                    <td style={{ padding: "12px 8px 12px 16px", textAlign: "center" }}>
                      <button
                        onClick={() => setExpandedSoId(isExpanded ? null : so._id)}
                        style={{
                          background: "none", border: "none", color: "#9bb0cb", cursor: "pointer",
                          fontSize: 12, padding: "2px 6px"
                        }}
                        title={isExpanded ? "Collapse details" : "Expand order details & packages"}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#34d399", fontWeight: 600 }}>
                      {so.soNumber}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>
                      {so.buyer.name}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <StatusBadge status={so.status} />
                        <FulfillmentBadge status={so.fulfillmentStatus} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>
                      ₹{so.totalValue.toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: packagesCount > 0 ? "#5498ff" : "#9bb0cb" }}>
                      {packagesCount} pkg{packagesCount === 1 ? "" : "s"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#9bb0cb" }}>
                      {new Date(so.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {so.status === "draft" && (
                          <ActionBtn label="Confirm" id={`confirm-so-${so._id}`} color="#5498ff" loading={actionLoading === so._id + "confirm"} onClick={() => handleAction(so._id, "confirm")} />
                        )}
                        {["confirmed", "partially_fulfilled", "picking"].includes(so.status) && (
                          <ActionBtn
                            label="📦 Pack"
                            id={`pack-so-${so._id}`}
                            color="#38bdf8"
                            loading={false}
                            onClick={() => {
                              setPackOrder({
                                _id: so._id,
                                soNumber: so.soNumber,
                                buyer: so.buyer,
                                items: so.items || []
                              });
                            }}
                          />
                        )}
                        {["confirmed", "picking"].includes(so.status) && (
                          <ActionBtn label="Dispatch All" id={`dispatch-so-${so._id}`} color="#34d399" loading={actionLoading === so._id + "dispatch"} onClick={() => handleAction(so._id, "dispatch")} />
                        )}
                        <ActionBtn
                          label="📄 Invoice"
                          id={`invoice-so-${so._id}`}
                          color="#a78bfa"
                          loading={actionLoading === so._id + "pdf"}
                          onClick={async () => {
                            setActionLoading(so._id + "pdf");
                            try {
                              await downloadAuthenticatedPdf(`/sales-orders/${so._id}/pdf`, `Invoice-${so.soNumber}.pdf`);
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "Failed to download invoice");
                            } finally {
                              setActionLoading(null);
                            }
                          }}
                        />
                        {!["dispatched", "delivered", "cancelled"].includes(so.status) && (
                          <ActionBtn label="Cancel" id={`cancel-so-${so._id}`} color="#fb7185" loading={actionLoading === so._id + "cancel"} onClick={() => handleAction(so._id, "cancel")} />
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Accordion Details: Lines & Packages */}
                  {isExpanded && (
                    <tr style={{ background: "rgba(11,20,36,0.95)", borderBottom: "1px solid rgba(148,163,184,0.14)" }}>
                      <td colSpan={8} style={{ padding: "16px 24px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
                          {/* Left: Line items breakdown */}
                          <div style={{ background: "rgba(15,23,42,0.6)", borderRadius: 10, padding: 14, border: "1px solid rgba(148,163,184,0.12)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#ecf3ff" }}>Order Line Items</span>
                              {["confirmed", "partially_fulfilled"].includes(so.status) && (
                                <button
                                  onClick={() => setPackOrder({ _id: so._id, soNumber: so.soNumber, buyer: so.buyer, items: so.items || [] })}
                                  style={{
                                    padding: "4px 10px", borderRadius: 6, background: "rgba(56,189,248,0.15)",
                                    border: "1px solid rgba(56,189,248,0.35)", color: "#38bdf8", fontSize: 11,
                                    fontWeight: 600, cursor: "pointer"
                                  }}
                                >
                                  + Create Package
                                </button>
                              )}
                            </div>
                            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ color: "#9bb0cb", borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                                  <th style={{ textAlign: "left", paddingBottom: 6 }}>Item / SKU</th>
                                  <th style={{ textAlign: "center", paddingBottom: 6 }}>Ordered</th>
                                  <th style={{ textAlign: "center", paddingBottom: 6 }}>Reserved</th>
                                  <th style={{ textAlign: "center", paddingBottom: 6 }}>Fulfilled</th>
                                  <th style={{ textAlign: "center", paddingBottom: 6 }}>Backordered</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(so.items || []).map((line, lIdx) => {
                                  const name = typeof line.productId === 'object' && line.productId ? line.productId.name : 'Item';
                                  const sku = typeof line.productId === 'object' && line.productId ? line.productId.sku : '';
                                  const mode = typeof line.productId === 'object' && line.productId ? line.productId.trackingMode : undefined;

                                  return (
                                    <tr key={lIdx} style={{ borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                      <td style={{ padding: "6px 0", color: "#ecf3ff" }}>
                                        {name}
                                        {sku && <span style={{ color: "#9bb0cb", fontSize: 11, marginLeft: 6 }}>({sku})</span>}
                                        {mode && mode !== 'NONE' && (
                                          <span style={{
                                            marginLeft: 6, padding: "1px 5px", borderRadius: 3, fontSize: 9,
                                            background: mode === 'BATCH' ? "rgba(167,139,250,0.2)" : "rgba(84,152,255,0.2)",
                                            color: mode === 'BATCH' ? "#a78bfa" : "#5498ff"
                                          }}>
                                            {mode}
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ textAlign: "center", color: "#ecf3ff" }}>{line.quantity}</td>
                                      <td style={{ textAlign: "center", color: "#5498ff" }}>{line.reservedQty || 0}</td>
                                      <td style={{ textAlign: "center", color: "#34d399", fontWeight: 600 }}>{line.fulfilledQty || 0}</td>
                                      <td style={{ textAlign: "center", color: (line.backorderedQty || 0) > 0 ? "#fb7185" : "#9bb0cb" }}>
                                        {line.backorderedQty || 0}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Right: Packages created for this order */}
                          <div style={{ background: "rgba(15,23,42,0.6)", borderRadius: 10, padding: 14, border: "1px solid rgba(148,163,184,0.12)" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#ecf3ff", display: "block", marginBottom: 10 }}>
                              Fulfillment Packages ({packagesCount})
                            </span>
                            {packagesCount === 0 ? (
                              <p style={{ color: "#9bb0cb", fontSize: 12, margin: "14px 0" }}>
                                No packages created yet. Click &quot;+ Create Package&quot; to pack items.
                              </p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {so.packages?.map((pkg) => (
                                  <div
                                    key={pkg._id}
                                    style={{
                                      background: "rgba(11,20,36,0.8)", border: "1px solid rgba(148,163,184,0.15)",
                                      borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center"
                                    }}
                                  >
                                    <div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#5498ff" }}>{pkg.packageNumber}</span>
                                        <span style={{
                                          fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                                          background: pkg.status === 'SHIPPED' ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.15)",
                                          color: pkg.status === 'SHIPPED' ? "#34d399" : "#f59e0b"
                                        }}>
                                          {pkg.status}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: 11, color: "#9bb0cb" }}>
                                        {pkg.carrier || 'Courier'}: {pkg.trackingNumber || 'Pending'}
                                      </span>
                                    </div>

                                    <div style={{ display: "flex", gap: 6 }}>
                                      {pkg.status === 'PACKED' && (
                                        <button
                                          onClick={() => handleDispatchPackage(pkg._id)}
                                          disabled={actionLoading === pkg._id + "pkg_dispatch"}
                                          style={{
                                            padding: "4px 8px", borderRadius: 6, background: "rgba(52,211,153,0.15)",
                                            border: "1px solid rgba(52,211,153,0.35)", color: "#34d399", fontSize: 11,
                                            fontWeight: 600, cursor: "pointer"
                                          }}
                                        >
                                          {actionLoading === pkg._id + "pkg_dispatch" ? "…" : "Dispatch"}
                                        </button>
                                      )}
                                      <button
                                        onClick={() => setLabelPackage(pkg)}
                                        style={{
                                          padding: "4px 8px", borderRadius: 6, background: "rgba(84,152,255,0.15)",
                                          border: "1px solid rgba(84,152,255,0.35)", color: "#5498ff", fontSize: 11,
                                          fontWeight: 600, cursor: "pointer"
                                        }}
                                      >
                                        🏷 Label / Slip
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
