"use client";

import { useState } from "react";
import { apiFetch, downloadAuthenticatedPdf } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShipmentBatchPanel } from "@/components/shipment-batch-panel";
import { useSession } from "@/hooks/use-session";
import { CreateDeliveryModal } from "@/components/create-delivery-modal";
import { ShipmentTrackingPanel } from "@/components/shipment-tracking-panel";
import { TaxInvoiceModal, type TaxInvoiceData } from "@/components/tax-invoice-modal";

type Shipment = {
  _id: string;
  reference: string;
  productName?: string;
  quantity?: number;
  condition?: string;
  originWarehouse?: string;
  expectedDeliveryDate?: string;
  customerName?: string;
  companyName?: string;
  phone?: string;
  city?: string;
  state?: string;
  status: "PENDING" | "DISPATCHED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RETURNED" | "CANCELLED";
  type?: "OUT" | "IN" | "STOCK_IN" | "STOCK_OUT";
  labelUrl?: string;
  carrierBooking?: { stage?: "ORDER" | "AWB" | "LABEL" | "PICKUP" | "COMPLETE"; processing?: boolean; pickupDate?: string };
  awb?: string;
  courier?: string;
  transporterName?: string;
  carrierType?: "SHIPROCKET" | "PORTER" | "DELHIVERY" | "DTDC" | "DMRC" | "BLUEDART" | "IN_HOUSE" | "OTHER";
  porterDetails?: {
    vehicleType?: string;
    driverName?: string;
    driverPhone?: string;
    vehicleNumber?: string;
    pickupOtp?: string;
    deliveryOtp?: string;
    estimatedFare?: number;
  };
  courierDetails?: {
    shippingMode?: string;
    eWayBill?: string;
    transitStation?: string;
    gatePassNo?: string;
  };
  warrantyDetails?: {
    status?: string;
    warrantyCardNo?: string;
    tamperSealNo?: string;
    isFragile?: boolean;
    insuranceValue?: number;
  };
  boxes?: number;
  weight?: string;
  deliveryType?: "Prepaid" | "COD" | "ToPay";
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
  PENDING:          { label: "Pending Booking",   bg: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  DISPATCHED:       { label: "Dispatched",         bg: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  IN_TRANSIT:       { label: "In Transit 🚚",      bg: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery",   bg: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  DELIVERED:        { label: "Delivered ✅",        bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  RETURNED:         { label: "Returned",           bg: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  CANCELLED:        { label: "Cancelled",          bg: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
};

const QUEUES = [
  ["all", "All records"], ["ready", "Ready to ship"], ["pickup", "Awaiting pickup"],
  ["transit", "In transit"], ["attention", "Needs attention"], ["returns", "Returns"]
] as const;

type ShipmentList = { shipments: Shipment[]; pagination: { page: number; pages: number; total: number } };

const CARRIER_TABS = [
  { id: "ALL", label: "All Carriers", icon: "🌐" },
  { id: "PORTER", label: "Porter (Hyperlocal)", icon: "🛵" },
  { id: "DELHIVERY", label: "Delhivery", icon: "📦" },
  { id: "DTDC", label: "DTDC Express", icon: "⚡" },
  { id: "DMRC", label: "DMRC Metro Transit", icon: "🚇" },
  { id: "BLUEDART", label: "Blue Dart", icon: "✈️" },
  { id: "IN_HOUSE", label: "In-House Fleet", icon: "🏢" },
];

export default function ShipmentsPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canBook = Boolean(user && user.role !== "USER" && user.impersonationMode !== "READ_ONLY");
  const accountKey = [user?.tenantId, user?._id || user?.id].join("/");
  const [batchBusy, setBatchBusy] = useState(false);
  const booking = useMutation({
    mutationFn: ({ shipmentId, step }: { shipmentId: string; step: string }) =>
      apiFetch("/logistics/book", { method: "POST", body: JSON.stringify({ provider: "SHIPROCKET", shipmentId, step }) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"shipments" | "transporters" | "batch">("shipments");
  const [carrierFilter, setCarrierFilter] = useState("ALL");
  const [queue, setQueue] = useState<(typeof QUEUES)[number][0]>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  // Create Delivery Modal
  const [createDeliveryModalOpen, setCreateDeliveryModalOpen] = useState(false);

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [newStatus, setNewStatus] = useState("IN_TRANSIT");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");

  // Tracking drawer modal
  const [trackingDrawerOpen, setTrackingDrawerOpen] = useState(false);
  const [trackingShipment, setTrackingShipment] = useState<Shipment | null>(null);

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
  const [invoiceModalData, setInvoiceModalData] = useState<TaxInvoiceData | null>(null);

  // Queries
  const { data: shipmentsData, isLoading: loadingShipments, error: listError, refetch } = useQuery<ShipmentList>({
    queryKey: ["shipments", accountKey, queue, carrierFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (queue !== "all") params.set("queue", queue);
      if (carrierFilter !== "ALL") params.set("carrierType", carrierFilter);
      if (search) params.set("search", search);
      return apiFetch<ShipmentList>(`/shipments?${params.toString()}`);
    },
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
      queryClient.invalidateQueries({ queryKey: ["shipment-stats"] });
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
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 pb-36">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shipment work queue</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Create Delivery Dispatch Button */}
          <button
            type="button"
            onClick={() => setCreateDeliveryModalOpen(true)}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:scale-[1.02] hover:shadow-amber-500/30 active:scale-[0.98]"
          >

            <span>New shipment</span>
          </button>

          {/* Tab Switcher */}
          <div className="flex rounded-2xl border border-white/10 bg-slate-900/60 p-1 backdrop-blur-xl">
            <button
              type="button"
              disabled={batchBusy} aria-pressed={activeTab === "shipments"}
              onClick={() => setActiveTab("shipments")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                activeTab === "shipments" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Shipments
            </button>
            {canBook && <button type="button" aria-pressed={activeTab === "batch"}
              onClick={() => setActiveTab("batch")} className={`rounded-xl px-4 py-2 text-xs font-semibold ${activeTab === "batch" ? "bg-white text-slate-950" : "text-slate-300"}`}>
              Bulk dispatch
            </button>}
            <button
              type="button"
              disabled={batchBusy} aria-pressed={activeTab === "transporters"}
              onClick={() => setActiveTab("transporters")}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                activeTab === "transporters" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Carriers ({transporters.length})
            </button>
          </div>

          {activeTab === "transporters" && (
            <button
              id="add-carrier-btn"
              type="button"
              onClick={() => { resetTransporterForm(); setTransporterModalOpen(true); }}
              className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
            >
              + Add Partner
            </button>
          )}
        </div>
      </div>

      {activeTab === "batch" && canBook && <ShipmentBatchPanel key={accountKey} accountId={accountKey} onBusy={setBatchBusy} />}
      {/* TAB 1: SHIPMENTS & LOGISTICS FEED */}
      {activeTab === "shipments" && (
        <div className="space-y-4">
          <nav aria-label="Shipment queues" className="flex flex-wrap gap-2">
            {QUEUES.map(([id, label]) => <button key={id} type="button" aria-pressed={queue === id}
              onClick={() => { setQueue(id); setPage(1); }}
              className={`rounded-lg border px-3 py-2 text-sm ${queue === id ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-white/15 text-slate-300"}`}>
              {label}
            </button>)}
          </nav>
          {/* Search & Status Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
            <div className="flex flex-1 items-center gap-3 min-w-[240px]">
              <span className="text-slate-500">🔍</span>
              <input
                type="text"
                value={search}
                aria-label="Search shipments"
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search reference, customer, driver, vehicle no, or AWB..."
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(""); setPage(1); }} className="text-xs text-slate-400 hover:text-white">
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <select
                aria-label="Filter carrier" value={carrierFilter}
                onChange={e => { setCarrierFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                {CARRIER_TABS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                <option value="SHIPROCKET">Shiprocket</option>
              </select>
            </div>
          </div>

          {loadingShipments ? (
            <div className="p-12 text-center text-slate-400">Loading shipments…</div>
          ) : listError ? (
            <div role="alert" className="p-4 text-rose-300">Could not load shipments. <button className="underline" onClick={() => refetch()}>Retry</button></div>
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Reference & Cargo</th>
                    <th className="px-6 py-4">Consignee & Destination</th>
                    <th className="px-6 py-4">Carrier & tracking</th>
                    <th className="px-6 py-4">Warranty / Quality</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {shipments.map((s) => {
                    const isPorter = s.carrierType === "PORTER" || s.courier?.toLowerCase().includes("porter");
                    const isDelhivery = s.carrierType === "DELHIVERY" || s.courier?.toLowerCase().includes("delhivery");
                    const isDtdc = s.carrierType === "DTDC" || s.courier?.toLowerCase().includes("dtdc");
                    const isDmrc = s.carrierType === "DMRC" || s.courier?.toLowerCase().includes("dmrc");

                    const matchedCarrier = transporters.find(
                      (t) => t.name === s.transporterName || t.code === s.courier || t.name === s.courier
                    );
                    const trackingUrl = buildTrackingUrl(matchedCarrier?.trackingUrlPattern, s.awb);

                    return (
                      <tr key={s._id} className="transition hover:bg-white/[0.02]">
                        {/* 1. Reference & Cargo */}
                        <td className="px-6 py-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{s.reference || "SHP"}</span>
                            {s.deliveryType && (
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                                {s.deliveryType}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 mt-1">
                            {s.productName || "Product"} {s.quantity ? `· ${s.quantity} units` : ""}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {s.boxes ? `${s.boxes} box(es)` : ""} {s.weight ? `· ${s.weight}` : ""}
                          </div>
                        </td>

                        {/* 2. Consignee & Destination */}
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">{s.companyName || s.customerName || "Consignee"}</div>
                          <div className="text-xs text-slate-400">
                            {s.customerName && s.customerName !== s.companyName ? `Attn: ${s.customerName}` : ""}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {[s.originWarehouse, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(" → ")}
                          </div>
                        </td>

                        {/* 3. Carrier & tracking */}
                        <td className="px-6 py-4">
                          {isPorter ? (
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-950/40 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                                <span>🛵 Porter</span>
                                <span>· {s.porterDetails?.vehicleType || "Tata Ace"}</span>
                              </div>
                              {s.porterDetails?.driverName && (
                                <div className="text-xs text-slate-300">
                                  Driver: <strong className="text-white">{s.porterDetails.driverName}</strong> ({s.porterDetails.driverPhone || "N/A"})
                                </div>
                              )}
                              {s.porterDetails?.vehicleNumber && (
                                <div className="text-[11px] font-mono text-cyan-300">
                                  Plate: {s.porterDetails.vehicleNumber}
                                </div>
                              )}
                              {s.porterDetails?.pickupOtp && (
                                <div className="text-[10px] font-mono text-amber-300">
                                  Pickup OTP: {s.porterDetails.pickupOtp}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-0.5 text-xs font-semibold text-slate-200">
                                <span>{isDelhivery ? "📦 Delhivery" : isDtdc ? "⚡ DTDC" : isDmrc ? "🚇 DMRC Transit" : "🏢 Carrier"}</span>
                                <span>· {s.courier || s.transporterName || "Dispatch"}</span>
                              </div>
                              {s.awb && (
                                <div className="font-mono text-xs text-amber-300">
                                  AWB: {s.awb}
                                </div>
                              )}
                              {s.courierDetails?.eWayBill && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  E-Way: {s.courierDetails.eWayBill}
                                </div>
                              )}
                              {trackingUrl && s.awb && (
                                <a
                                  href={trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition"
                                >
                                  🔗 Live Tracking ↗
                                </a>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Warranty & Quality */}
                        <td className="px-6 py-4 text-xs">
                          {s.warrantyDetails?.status && s.warrantyDetails.status !== "NONE" ? (
                            <div className="space-y-1">
                              <span className="inline-block rounded-md border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                                🛡️ {s.warrantyDetails.status.replace(/_/g, " ")}
                              </span>
                              {s.warrantyDetails.tamperSealNo && (
                                <div className="text-[10px] text-slate-500 font-mono">
                                  Seal: {s.warrantyDetails.tamperSealNo}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">Standard</span>
                          )}
                          {s.warrantyDetails?.isFragile && (
                            <div className="mt-1 inline-block rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.2 text-[9px] font-bold text-rose-300">
                              ⚠️ FRAGILE
                            </div>
                          )}
                        </td>

                        {/* 5. Status Badge */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              STATUS_CONFIG[s.status]?.bg || "bg-white/10 text-slate-300"
                            }`}
                          >
                            {STATUS_CONFIG[s.status]?.label || s.status}
                          </span>
                          {s.expectedDeliveryDate && <div className="mt-1 text-xs text-slate-400">Due {new Date(s.expectedDeliveryDate).toLocaleDateString()}</div>}
                          {s.receivedBy && (
                            <div className="text-[10px] text-slate-400 mt-1 font-medium">
                              Rec: {s.receivedBy}
                            </div>
                          )}
                        </td>

                        {/* 6. Actions */}
                        <td className="px-6 py-4 text-right">
                          {s.carrierType === "SHIPROCKET" && <div className="mb-2 space-y-1 text-xs">
                            {s.carrierBooking?.processing ? <p role="status">Awaiting confirmation. Check Shiprocket before repeating this step.</p>
                              : s.carrierBooking?.stage === "COMPLETE" ? <p>Pickup scheduled {s.carrierBooking.pickupDate}</p>
                              : canBook && s.type === "OUT" && ["PENDING", "DISPATCHED"].includes(s.status) && (!s.awb || s.carrierBooking?.stage) &&
                                <button type="button" disabled={booking.isPending}
                                  className="rounded-lg border border-sky-400/40 px-3 py-2 text-sky-200 disabled:opacity-50"
                                  onClick={() => booking.mutate({ shipmentId: s._id, step: s.carrierBooking?.stage || "ORDER" })}>
                                  {{ ORDER: "Book with Shiprocket", AWB: "Assign carrier AWB", LABEL: "Generate label", PICKUP: "Schedule pickup" }[s.carrierBooking?.stage || "ORDER"]}
                                </button>}
                            {s.labelUrl?.startsWith("https://") && <a className="block underline" target="_blank" rel="noreferrer" href={s.labelUrl}>Open printable label</a>}
                            {booking.variables?.shipmentId === s._id && booking.error && <p role="alert" className="text-rose-300">{booking.error.message}</p>}
                          </div>}
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
                              className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/20"
                            >
                              {downloadingId === s._id ? "…" : "📄 Challan"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInvoiceModalData({
                                  invoiceNumber: `INV-${s.reference || s._id.slice(-6).toUpperCase()}`,
                                  invoiceDate: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
                                  company: {
                                    name: "AcuStock Enterprise Hub",
                                    gstin: "27AABCU9603R1ZM",
                                    address: "Plot 42, Logistics Park Central",
                                    city: "Mumbai",
                                    state: "Maharashtra",
                                    pincode: "400001"
                                  },
                                  buyer: {
                                    name: s.customerName || s.companyName || "Commercial Consignee",
                                    address: s.city ? `${s.city}, ${s.state || ""}` : "Dock Delivery Station",
                                    city: s.city || "Mumbai",
                                    state: s.state || "Maharashtra",
                                    phone: s.phone
                                  },
                                  items: [
                                    {
                                      description: s.productName || "Industrial Inventory Consignment",
                                      quantity: s.quantity || 1,
                                      unitPrice: 1200,
                                      taxRate: 18,
                                      uom: "PCS"
                                    }
                                  ],
                                  transportDetails: {
                                    transporterName: s.transporterName || s.courier || "SafeExpress Logistics",
                                    vehicleNumber: s.porterDetails?.vehicleNumber || "MH-04-AZ-2026",
                                    ewayBillNumber: s.courierDetails?.eWayBill || `EWB-${s.reference || "991204"}`
                                  }
                                });
                              }}
                              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20"
                            >
                              🧾 Invoice
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTrackingShipment(s);
                                setTrackingDrawerOpen(true);
                              }}
                              className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20"
                            >
                              📡 Track
                            </button>
                            <button
                              type="button"
                              onClick={() => openUpdateModal(s)}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                            >
                              Update
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {shipments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                        No shipments match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {shipmentsData && <nav aria-label="Shipment pages" className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm">
                <span>{shipmentsData.pagination.total} matching records</span>
                <div className="flex items-center gap-3">
                  <button disabled={page === 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button>
                  <span>Page {page}</span>
                  <button disabled={page >= shipmentsData.pagination.pages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button>
                </div>
              </nav>}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRANSPORTERS / CARRIERS DIRECTORY */}
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
            </div>
          )}
        </div>
      )}

      {/* CREATE DELIVERY DISPATCH MODAL */}
      <CreateDeliveryModal
        isOpen={createDeliveryModalOpen}
        onClose={() => setCreateDeliveryModalOpen(false)}
        onSuccess={(shipmentId) => {
          queryClient.invalidateQueries({ queryKey: ["shipments"] });
          queryClient.invalidateQueries({ queryKey: ["shipment-stats"] });
          alert(`✅ Delivery dispatch created successfully! Record ID: ${shipmentId}`);
        }}
      />

      {/* UPDATE STATUS MODAL */}
      {statusModalOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">Update Delivery Lifecycle</h2>
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
              >
                <option value="DISPATCHED">Dispatched</option>
                <option value="IN_TRANSIT">In Transit 🚚</option>
                <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                <option value="DELIVERED">Delivered ✅</option>
                <option value="RETURNED">Returned</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {newStatus === "DELIVERED" && (
              <div>
                <label className="block text-xs font-semibold text-slate-300">Received By / Recipient Signature</label>
                <input
                  type="text"
                  placeholder="e.g. Ankit (Security Gate 1)"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300">Transit Notes / POD Link</label>
              <textarea
                rows={2}
                placeholder="Remarks, delay note, or driver comments"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-xs text-white outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  updateStatusMutation.mutate({
                    id: selectedShipment._id,
                    status: newStatus,
                    receivedBy,
                    notes,
                  })
                }
                disabled={updateStatusMutation.isPending}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
              >
                {updateStatusMutation.isPending ? "Updating..." : "Save Status"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE SHIPMENT TRACKING DRAWER */}
      {trackingDrawerOpen && trackingShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <ShipmentTrackingPanel
              shipmentId={trackingShipment._id}
              shipmentRef={trackingShipment.reference}
              carrierType={trackingShipment.carrierType || "OTHER"}
              awb={trackingShipment.awb}
              onClose={() => {
                setTrackingDrawerOpen(false);
                setTrackingShipment(null);
              }}
            />
          </div>
        </div>
      )}

      {/* CREATE TRANSPORTER MODAL */}
      {transporterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">Register Carrier Partner</h2>
              <button
                type="button"
                onClick={() => setTransporterModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {trError && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-950/60 p-3 text-xs text-rose-300">
                ❌ {trError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Carrier Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Porter Logistics"
                  value={trName}
                  onChange={(e) => setTrName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Short Code *</label>
                <input
                  type="text"
                  placeholder="e.g. PORTER"
                  value={trCode}
                  onChange={(e) => setTrCode(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Tracking URL Pattern</label>
              <input
                type="text"
                placeholder="https://porter.in/track/{awb}"
                value={trTrackingUrl}
                onChange={(e) => setTrTrackingUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
              />
              <span className="text-[11px] text-slate-500">Use {"{awb}"} as placeholder for consignment number</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. Desk In-charge"
                  value={trContactPerson}
                  onChange={(e) => setTrContactPerson(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 08044114411"
                  value={trPhone}
                  onChange={(e) => setTrPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setTransporterModalOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  createTransporterMutation.mutate({
                    name: trName,
                    code: trCode,
                    trackingUrlPattern: trTrackingUrl,
                    contactPerson: trContactPerson,
                    phone: trPhone,
                    email: trEmail,
                    gstin: trGstin,
                  })
                }
                disabled={createTransporterMutation.isPending || !trName || !trCode}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
              >
                {createTransporterMutation.isPending ? "Registering..." : "Register Carrier"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* GST Tax Invoice Printable Modal */}
      {invoiceModalData && (
        <TaxInvoiceModal
          isOpen={Boolean(invoiceModalData)}
          onClose={() => setInvoiceModalData(null)}
          invoice={invoiceModalData}
        />
      )}
    </div>
  );
}
