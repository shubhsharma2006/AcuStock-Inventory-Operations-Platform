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
  contactPerson?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
};

export default function ShipmentsPage() {
  const queryClient = useQueryClient();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"shipments" | "transporters">("shipments");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Modal states
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [newStatus, setNewStatus] = useState("IN_TRANSIT");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");

  // Transporter Modal
  const [transporterModalOpen, setTransporterModalOpen] = useState(false);
  const [transporterName, setTransporterName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Queries
  const { data: shipmentsData, isLoading: loadingShipments } = useQuery<{ shipments: Shipment[] }>({
    queryKey: ["shipments", statusFilter, search],
    queryFn: () =>
      apiFetch<{ shipments: Shipment[] }>(
        `/shipments?${statusFilter !== "ALL" ? `status=${statusFilter}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
  });

  const { data: transportersData, isLoading: loadingTransporters } = useQuery<{ transporters: Transporter[] }>({
    queryKey: ["logistics"],
    queryFn: () => apiFetch<{ transporters: Transporter[] }>("/logistics"),
  });

  const shipments = shipmentsData?.shipments || [];
  const transporters = transportersData?.transporters || [];

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
      apiFetch("/logistics", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logistics"] });
      setTransporterModalOpen(false);
      setTransporterName("");
      setContactPerson("");
      setPhone("");
      setEmail("");
    },
  });

  function openUpdateModal(s: Shipment) {
    setSelectedShipment(s);
    setNewStatus(s.status);
    setReceivedBy(s.receivedBy || "");
    setNotes("");
    setStatusModalOpen(true);
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      PENDING: "bg-slate-400/10 text-slate-300",
      DISPATCHED: "bg-sky-400/10 text-sky-300",
      IN_TRANSIT: "bg-amber-400/10 text-amber-300",
      OUT_FOR_DELIVERY: "bg-purple-400/10 text-purple-300",
      DELIVERED: "bg-emerald-400/10 text-emerald-300",
      RETURNED: "bg-rose-400/10 text-rose-300",
      CANCELLED: "bg-rose-400/10 text-rose-300",
    };
    return map[status] || "bg-white/10 text-slate-300";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shipping & Logistics</h1>
          <p className="text-sm text-slate-400">
            Track delivery status, manage carriers, and handle shipment dispatches.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex rounded-2xl border border-white/10 bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("shipments")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "shipments" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              🚚 Shipments ({shipments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transporters")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "transporters" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              🏢 Carriers ({transporters.length})
            </button>
          </div>

          {activeTab === "transporters" && (
            <button
              type="button"
              onClick={() => setTransporterModalOpen(true)}
              className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
            >
              + Add Carrier
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SHIPMENTS LIST */}
      {activeTab === "shipments" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, customer, or AWB tracking #..."
              className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>

          {loadingShipments ? (
            <div className="p-8 text-center text-slate-400">Loading shipments...</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Reference / Customer</th>
                    <th className="px-6 py-4">AWB / Carrier</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Received By</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {shipments.map((s) => (
                    <tr key={s._id} className="transition hover:bg-white/5">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{s.reference || "No Ref"}</div>
                        <div className="text-xs text-slate-400">{s.customerName || s.companyName || "N/A"}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        <div>{s.awb || "No AWB"}</div>
                        <div className="text-[11px] text-slate-500">{s.transporterName || "Direct Dispatch"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(s.status)}`}>
                          {s.status.replace("_", " ")}
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
                            className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 transition hover:bg-indigo-500/20 hover:text-white"
                          >
                            {downloadingId === s._id ? "Generating..." : "📄 Challan"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openUpdateModal(s)}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                          >
                            Update Status
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shipments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No shipments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRANSPORTERS LIST */}
      {activeTab === "transporters" && (
        <div className="space-y-4">
          {loadingTransporters ? (
            <div className="p-8 text-center text-slate-400">Loading carriers...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {transporters.map((t) => (
                <div key={t._id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">{t.name}</h3>
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                      Active
                    </span>
                  </div>
                  <div className="mt-4 space-y-1 text-xs text-slate-400">
                    <div>Contact: <span className="text-slate-200">{t.contactPerson || "N/A"}</span></div>
                    <div>Phone: <span className="font-mono text-slate-200">{t.phone || "N/A"}</span></div>
                    <div>Email: <span className="text-slate-200">{t.email || "N/A"}</span></div>
                  </div>
                </div>
              ))}
              {transporters.length === 0 && (
                <div className="col-span-full p-8 text-center text-slate-500">
                  No carriers registered. Click &quot;+ Add Carrier&quot; to add one.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Status Modal */}
      {statusModalOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Update Delivery Status</h2>
            <p className="mt-1 text-xs text-slate-400">Shipment: {selectedShipment.reference}</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                >
                  <option value="PENDING">Pending</option>
                  <option value="DISPATCHED">Dispatched</option>
                  <option value="IN_TRANSIT">In Transit</option>
                  <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="RETURNED">Returned</option>
                  <option value="CANCELLED">Cancelled</option>
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
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
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
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
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
                  className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Add New Carrier / Transporter</h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Carrier Name *</label>
                <input
                  type="text"
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  placeholder="FedEx / BlueDart / Internal Logistics"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Contact Person</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Dispatch Manager Name"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 800-123-4567"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="logistics@carrier.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransporterModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={createTransporterMutation.isPending || !transporterName.trim()}
                  onClick={() =>
                    createTransporterMutation.mutate({
                      name: transporterName.trim(),
                      contactPerson: contactPerson.trim() || undefined,
                      phone: phone.trim() || undefined,
                      email: email.trim() || undefined,
                    })
                  }
                  className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
                >
                  {createTransporterMutation.isPending ? "Creating..." : "Save Carrier"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
