"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadAuthenticatedPdf } from "@/lib/api";

interface SalesOrder {
  _id: string;
  soNumber: string;
  buyer: { name: string; email?: string };
  status: string;
  totalValue: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#9bb0cb",
  confirmed: "#5498ff",
  picking: "#a78bfa",
  dispatched: "#34d399",
  delivered: "#34d399",
  cancelled: "#fb7185",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: `${STATUS_COLORS[status] || "#9bb0cb"}18`,
      border: `1px solid ${STATUS_COLORS[status] || "#9bb0cb"}40`,
      color: STATUS_COLORS[status] || "#9bb0cb",
    }}>
      {status.toUpperCase()}
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 2 }}>Sales Orders</h1>
          <p style={{ color: "#9bb0cb", fontSize: 13 }}>Manage customer orders. Dispatching an SO auto-deducts stock.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: "auto", fontSize: 12 }}>
            <option value="">All statuses</option>
            {["draft", "confirmed", "picking", "dispatched", "delivered", "cancelled"].map((s) => (
              <option key={s} value={s}>{s.toUpperCase()}</option>
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
              {["SO Number", "Buyer", "Status", "Total Value", "Created", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#9bb0cb", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={6} style={{ padding: "12px 16px" }}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td></tr>
              ))
            ) : !data?.orders?.length ? (
              <tr><td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#9bb0cb", fontSize: 13 }}>No sales orders yet. Click &quot;+ New SO&quot; to create one.</td></tr>
            ) : data.orders.map((so) => (
              <tr key={so._id} style={{ borderBottom: "1px solid rgba(148,163,184,0.07)", transition: "background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(148,163,184,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#34d399", fontWeight: 600 }}>{so.soNumber}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>{so.buyer.name}</td>
                <td style={{ padding: "12px 16px" }}><StatusBadge status={so.status} /></td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#ecf3ff" }}>₹{so.totalValue.toLocaleString()}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "#9bb0cb" }}>{new Date(so.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {so.status === "draft" && (
                      <ActionBtn label="Confirm" id={`confirm-so-${so._id}`} color="#5498ff" loading={actionLoading === so._id + "confirm"} onClick={() => handleAction(so._id, "confirm")} />
                    )}
                    {["confirmed", "picking"].includes(so.status) && (
                      <ActionBtn label="Dispatch" id={`dispatch-so-${so._id}`} color="#34d399" loading={actionLoading === so._id + "dispatch"} onClick={() => handleAction(so._id, "dispatch")} />
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
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
