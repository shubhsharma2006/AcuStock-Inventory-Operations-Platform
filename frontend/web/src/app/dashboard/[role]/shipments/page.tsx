"use client";

import { useState } from "react";
import { apiFetch, downloadAuthenticatedPdf } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Shipment = {
  _id: string;
  reference: string;
  customerName?: string;
  companyName?: string;
  status: "PENDING" | "DISPATCHED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RETURNED" | "CANCELLED";
  type?: "STOCK_IN" | "STOCK_OUT";
  awb?: string;
  transporterName?: string;
  receivedBy?: string;
  createdAt?: string;
};

type Transporter = {
  _id: string;
  name: string;
  code?: string;
  trackingUrlPattern?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  isActive?: boolean;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  PENDING:          { label: "Pending",          bg: "bg-slate-500/20 text-slate-300" },
  DISPATCHED:       { label: "Dispatched",        bg: "bg-sky-500/20 text-sky-300" },
  IN_TRANSIT:       { label: "In Transit 🚚",     bg: "bg-amber-500/20 text-amber-300" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery",  bg: "bg-purple-500/20 text-purple-300" },
  DELIVERED:        { label: "Delivered ✅",       bg: "bg-emerald-500/20 text-emerald-300" },
  RETURNED:         { label: "Returned",          bg: "bg-rose-500/20 text-rose-300" },
  CANCELLED:        { label: "Cancelled",         bg: "bg-rose-500/20 text-rose-300" },
};

export default function ShipmentsPage() {
  const queryClient = useQueryClient();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"shipments" | "transporters">("shipments");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [newStatus, setNewStatus] = useState("IN_TRANSIT");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");

  // Transporter modal
  const [transporterModalOpen, setTransporterModalOpen] = useState(false);
  const [trName, setTrName] = useState("");
  const [trCode, setTrCode] = useState("");
  const [trTrackingUrl, setTrTrackingUrl] = useState("");
  const [trContactPerson, setTrContactPerson] = useState("");
  const [trPhone, setTrPhone] = useState("");
  const [trEmail, setTrEmail] = useState("");
  const [trGstin, setTrGstin] = useState("");
  const [trError, setTrError] = useState<string | null>(null);

  // Queries
  const { data: shipmentsData, isLoading: loadingShipments } = useQuery<{ shipments: Shipment[] }>({
    queryKey: ["shipments", statusFilter, search],
    queryFn: () =>
      apiFetch<{ shipments: Shipment[] }>(
        `/shipments?${statusFilter !== "ALL" ? `status=${statusFilter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
  });

  const { data: transporters = [], isLoading: loadingTransporters } = useQuery<Transporter[]>({
    queryKey: ["transporters"],
    queryFn: () => apiFetch("/transporters"),
  });

  const shipments = shipmentsData?.shipments || [];

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, receivedBy, notes }: { id: string; status: string; receivedBy?: string; notes?: string }) =>
      apiFetch(`/shipments/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, receivedBy, notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      setStatusModalOpen(false);
    },
  });

  const createTransporterMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/transporters", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transporters"] });
      resetTransporterForm();
      setTransporterModalOpen(false);
    },
    onError: (err: unknown) =>
      setTrError(err instanceof Error ? err.message : "Failed to create carrier"),
  });

  const deactivateTransporterMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/transporters/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transporters"] }),
  });

  function resetTransporterForm() {
    setTrName(""); setTrCode(""); setTrTrackingUrl("");
    setTrContactPerson(""); setTrPhone(""); setTrEmail(""); setTrGstin(""); setTrError(null);
  }

  function openUpdateModal(s: Shipment) {
    setSelectedShipment(s);
    setNewStatus(s.status);
    setReceivedBy(s.receivedBy || "");
    setNotes("");
    setStatusModalOpen(true);
  }

  function buildTrackingUrl(pattern: string | undefined, awb: string | undefined): string | null {
    if (!pattern || !awb) return null;
    return pattern.replace("{awb}", awb).replace("{AWB}", awb);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Logistics Control</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">Shipping & Dispatch</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track delivery status, manage carrier partners, and handle shipment dispatches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-2xl border border-white/10 bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("shipments")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "shipments" ? "bg-amber-400 text-slate-950 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              🚚 Shipments ({shipments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transporters")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "transporters" ? "bg-amber-400 text-slate-950 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              🏢 Carriers ({transporters.length})
            </button>
          </div>

          {activeTab === "transporters" && (
            <button
              id="add-carrier-btn"
              type="button"
              onClick={() => { resetTransporterForm(); setTransporterModalOpen(true); }}
              className="rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
            >
              + Add Carrier
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SHIPMENTS */}
      {activeTab === "shipments" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, customer, or AWB..."
              className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
            >
              <option value="ALL">All Statuses</option>
              {Object.keys(STATUS_CONFIG).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          {loadingShipments ? (
            <div className="p-8 text-center text-slate-400">Loading shipments...</div>
          ) : (
            <div className="overflow-x-auto rounded-[1.75rem] border border-white/10 bg-slate-900/40 backdrop-blur-xl">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Reference / Customer</th>
                    <th className="px-6 py-4">AWB / Carrier</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Received By</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {shipments.map((s) => {
                    // Find matching transporter for tracking link
                    const matchedCarrier = transporters.find(
                      (t) => t.name === s.transporterName || t.code === s.transporterName
                    );
                    const trackingUrl = buildTrackingUrl(matchedCarrier?.trackingUrlPattern, s.awb);

                    return (
                      <tr key={s._id} className="transition hover:bg-white/[0.02]">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">{s.reference || "No Ref"}</div>
                          <div className="text-xs text-slate-400">{s.customerName || s.companyName || "N/A"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-mono text-xs text-amber-300">{s.awb || "No AWB"}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{s.transporterName || "Direct Dispatch"}</div>
                          {trackingUrl && s.awb && (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition"
                            >
                              🔗 Track Package
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CONFIG[s.status]?.bg || "bg-white/10 text-slate-300"}`}>
                            {STATUS_CONFIG[s.status]?.label || s.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 font-medium">
                          {s.receivedBy || "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={downloadingId === s._id}
                              onClick={async () => {
                                setDownloadingId(s._id);
                                try {
                                  await downloadAuthenticatedPdf(`/shipments/${s._id}/pdf`, `Challan-${s.reference || "SHP"}.pdf`);
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : "Failed to download challan");
                                } finally {
                                  setDownloadingId(null);
                                }
                              }}
                              className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 transition hover:bg-indigo-500/20"
                            >
                              {downloadingId === s._id ? "Generating..." : "📄 Challan"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openUpdateModal(s)}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                            >
                              Update Status
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shipments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                        No shipments found. They are auto-created when Sales Orders are dispatched.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRANSPORTERS / CARRIERS */}
      {activeTab === "transporters" && (
        <div className="space-y-4">
          {loadingTransporters ? (
            <div className="p-8 text-center text-slate-400">Loading carriers...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {transporters.map((t) => (
                <div key={t._id} className="group relative rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-amber-400/30">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold text-white">{t.name}</h3>
                      {t.code && (
                        <span className="mt-1 inline-block font-mono text-xs font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                          {t.code}
                        </span>
                      )}
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.isActive !== false ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {t.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-400">
                    {t.contactPerson && (
                      <div className="flex items-center gap-1.5">
                        <span>👤</span>
                        <span>{t.contactPerson}</span>
                      </div>
                    )}
                    {t.phone && (
                      <div className="flex items-center gap-1.5">
                        <span>📞</span>
                        <span className="font-mono">{t.phone}</span>
                      </div>
                    )}
                    {t.email && (
                      <div className="flex items-center gap-1.5">
                        <span>✉️</span>
                        <span>{t.email}</span>
                      </div>
                    )}
                    {t.gstin && (
                      <div className="flex items-center gap-1.5">
                        <span>🏷️</span>
                        <span className="font-mono">GSTIN: {t.gstin}</span>
                      </div>
                    )}
                    {t.trackingUrlPattern && (
                      <div className="flex items-start gap-1.5 mt-2">
                        <span>🔗</span>
                        <span className="text-sky-400 truncate">{t.trackingUrlPattern}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Deactivate carrier "${t.name}"?`)) {
                          deactivateTransporterMutation.mutate(t._id);
                        }
                      }}
                      className="text-xs text-rose-400 opacity-0 group-hover:opacity-100 transition hover:text-rose-300"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}

              {transporters.length === 0 && (
                <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-400">
                  <div className="text-3xl mb-2">🚛</div>
                  <p className="font-semibold text-white">No carriers registered yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Add logistics partners like Delhivery, BlueDart, or FedEx to enable one-click tracking.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Update Status Modal */}
      {statusModalOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Update Delivery Status</h2>
                <p className="text-xs text-slate-400 mt-0.5">Shipment: {selectedShipment.reference}</p>
              </div>
              <button type="button" onClick={() => setStatusModalOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                >
                  {Object.keys(STATUS_CONFIG).map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>

              {newStatus === "DELIVERED" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Received By (Name)</label>
                  <input
                    type="text"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    placeholder="Name of recipient"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Delivery remarks..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
                <button type="button" onClick={() => setStatusModalOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateStatusMutation.isPending}
                  onClick={() =>
                    updateStatusMutation.mutate({
                      id: selectedShipment._id,
                      status: newStatus,
                      receivedBy: receivedBy.trim() || undefined,
                      notes: notes.trim() || undefined,
                    })
                  }
                  className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {updateStatusMutation.isPending ? "Saving..." : "Save Status"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Transporter Modal */}
      {transporterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Add Carrier / Transporter</h2>
                <p className="text-xs text-slate-400 mt-0.5">Register a logistics partner for shipment tracking</p>
              </div>
              <button type="button" onClick={() => setTransporterModalOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </div>

            {trError && (
              <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{trError}</div>
            )}

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Carrier Name *</label>
                  <input
                    type="text"
                    value={trName}
                    onChange={(e) => setTrName(e.target.value)}
                    placeholder="e.g. Delhivery"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Carrier Code *</label>
                  <input
                    type="text"
                    value={trCode}
                    onChange={(e) => setTrCode(e.target.value.toUpperCase())}
                    placeholder="e.g. DELHIVERY"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-amber-300 outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Tracking URL Pattern</label>
                <input
                  type="text"
                  value={trTrackingUrl}
                  onChange={(e) => setTrTrackingUrl(e.target.value)}
                  placeholder="https://carrier.com/track?awb={awb}"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                />
                <p className="mt-1 text-xs text-slate-500">Use <code className="text-amber-300">{"{awb}"}</code> as placeholder for the AWB number</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Contact Person</label>
                  <input
                    type="text"
                    value={trContactPerson}
                    onChange={(e) => setTrContactPerson(e.target.value)}
                    placeholder="Dispatch Manager"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Phone</label>
                  <input
                    type="text"
                    value={trPhone}
                    onChange={(e) => setTrPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Email</label>
                  <input
                    type="email"
                    value={trEmail}
                    onChange={(e) => setTrEmail(e.target.value)}
                    placeholder="logistics@carrier.com"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">GSTIN (Optional)</label>
                  <input
                    type="text"
                    value={trGstin}
                    onChange={(e) => setTrGstin(e.target.value.toUpperCase())}
                    placeholder="27AAACR5055K1ZV"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setTransporterModalOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={createTransporterMutation.isPending || !trName.trim() || !trCode.trim()}
                  onClick={() =>
                    createTransporterMutation.mutate({
                      name: trName.trim(),
                      code: trCode.trim(),
                      trackingUrlPattern: trTrackingUrl.trim() || undefined,
                      contactPerson: trContactPerson.trim() || undefined,
                      phone: trPhone.trim() || undefined,
                      email: trEmail.trim() || undefined,
                      gstin: trGstin.trim() || undefined,
                    })
                  }
                  className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {createTransporterMutation.isPending ? "Saving..." : "Save Carrier"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
