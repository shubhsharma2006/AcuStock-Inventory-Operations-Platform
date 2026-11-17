"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Truck,
  PackageCheck,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Hash,
  Layers,
  ArrowRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ASNItem {
  productId?: string;
  name: string;
  sku: string;
  quantityShipped: number;
  lotNumber: string;
}

interface ASNRecord {
  _id: string;
  asnNumber: string;
  purchaseOrderId?: {
    _id: string;
    orderNumber?: string;
    poNumber?: string;
  };
  carrierName: string;
  vehicleNumber: string;
  trackingNumber: string;
  dispatchDate: string;
  expectedArrivalDate: string;
  status: string;
  items: ASNItem[];
  notes?: string;
}

function SupplierASNContent() {
  const searchParams = useSearchParams();
  const preselectedPoId = searchParams?.get("poId");

  const [asns, setAsns] = useState<ASNRecord[]>([]);
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Create ASN Form State
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [carrierName, setCarrierName] = useState<string>("");
  const [vehicleNumber, setVehicleNumber] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [expectedArrivalDate, setExpectedArrivalDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [itemsToShip, setItemsToShip] = useState<ASNItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [asnRes, orderRes] = await Promise.all([
        apiFetch<any>("/portal/supplier/asns"),
        apiFetch<any>("/portal/supplier/orders"),
      ]);

      if (asnRes?.asns) setAsns(asnRes.asns);
      if (orderRes?.purchaseOrders) {
        setOpenOrders(orderRes.purchaseOrders);

        // Pre-select PO if query param present
        if (preselectedPoId) {
          const matched = orderRes.purchaseOrders.find(
            (o: any) => o._id === preselectedPoId
          );
          if (matched) {
            setSelectedPoId(matched._id);
            populateItemsFromPo(matched);
            setShowCreateModal(true);
          }
        }
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load ASN data:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [preselectedPoId]);

  const populateItemsFromPo = (po: any) => {
    if (!po?.items) return;
    const initialItems: ASNItem[] = po.items.map((it: any) => ({
      productId: it.productId?._id || it.productId || "",
      name: it.productId?.name || it.name || "Product",
      sku: it.productId?.sku || it.sku || "",
      quantityShipped: it.quantity || 1,
      lotNumber: `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    }));
    setItemsToShip(initialItems);
  };

  const handlePoChange = (poId: string) => {
    setSelectedPoId(poId);
    const matched = openOrders.find((o) => o._id === poId);
    if (matched) {
      populateItemsFromPo(matched);
    }
  };

  const updateItemQty = (idx: number, qty: number) => {
    setItemsToShip((prev) => {
      const copy = [...prev];
      copy[idx].quantityShipped = Math.max(1, qty);
      return copy;
    });
  };

  const updateItemLot = (idx: number, lot: string) => {
    setItemsToShip((prev) => {
      const copy = [...prev];
      copy[idx].lotNumber = lot;
      return copy;
    });
  };

  const handleCreateASN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoId) {
      setFormError("Please select a Purchase Order.");
      return;
    }
    if (!expectedArrivalDate) {
      setFormError("Expected arrival date is required.");
      return;
    }
    if (itemsToShip.length === 0) {
      setFormError("At least one shipment item is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const res = await apiFetch<any>("/portal/supplier/asn", {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: selectedPoId,
          carrierName,
          vehicleNumber,
          trackingNumber,
          expectedArrivalDate,
          items: itemsToShip,
          notes,
        }),
      });

      setIsSubmitting(false);
      setFormSuccess(res.message || "ASN lodged successfully!");
      setTimeout(() => {
        setShowCreateModal(false);
        setFormSuccess(null);
        setSelectedPoId("");
        setCarrierName("");
        setVehicleNumber("");
        setTrackingNumber("");
        setExpectedArrivalDate("");
        setNotes("");
        setItemsToShip([]);
        fetchData();
      }, 1200);
    } catch (err: any) {
      setIsSubmitting(false);
      setFormError(err.message || "Failed to submit ASN.");
    }
  };

  const filteredAsns = asns.filter((asn) => {
    const q = searchQuery.toLowerCase();
    const asnNum = (asn.asnNumber || "").toLowerCase();
    const carrier = (asn.carrierName || "").toLowerCase();
    const track = (asn.trackingNumber || "").toLowerCase();
    return asnNum.includes(q) || carrier.includes(q) || track.includes(q);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-primary" />
            Advanced Shipping Notices (ASN)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pre-notify inbound freight, allocate carrier logistics & lot passports for touchless dock receiving
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Lodge New ASN
          </button>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border">
        <Link
          href="/portal/supplier/orders"
          className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-muted-foreground/30 flex items-center gap-2 transition"
        >
          <PackageCheck className="w-4 h-4" />
          Purchase Orders
        </Link>
        <Link
          href="/portal/supplier/asn"
          className="px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary flex items-center gap-2"
        >
          <Truck className="w-4 h-4" />
          Advanced Shipping Notices (ASN)
          <span className="ml-1 px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-primary/10 text-primary">
            {asns.length}
          </span>
        </Link>
      </div>

      {/* Search / Filter Bar */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search ASN#, Carrier, or Docket#..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Lodged ASNs Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase font-medium text-muted-foreground">
              <tr>
                <th className="py-3 px-4">ASN Number</th>
                <th className="py-3 px-4">Associated PO</th>
                <th className="py-3 px-4">Carrier & Vehicle</th>
                <th className="py-3 px-4">Tracking / Docket</th>
                <th className="py-3 px-4">Expected Arrival</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Items Shipped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading shipping notices...
                  </td>
                </tr>
              ) : filteredAsns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                    No Advanced Shipping Notices recorded yet.
                  </td>
                </tr>
              ) : (
                filteredAsns.map((asn) => {
                  const poNum =
                    asn.purchaseOrderId?.poNumber ||
                    asn.purchaseOrderId?.orderNumber ||
                    "PO Ref";

                  return (
                    <tr key={asn._id} className="hover:bg-muted/30 transition">
                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        {asn.asnNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {poNum}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-medium text-foreground block">
                          {asn.carrierName || "Direct Carrier"}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {asn.vehicleNumber || "Vehicle Unassigned"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {asn.trackingNumber || "—"}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-foreground">
                        {new Date(asn.expectedArrivalDate).toLocaleDateString("en-IN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            asn.status === "RECEIVED"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : asn.status === "ARRIVED_AT_GATE"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          <Truck className="w-3 h-3" />
                          {asn.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {asn.items?.reduce((a, b) => a + (b.quantityShipped || 0), 0) || 0} unit(s)
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lodge ASN Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                Lodge Advanced Shipping Notice (ASN)
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateASN} className="p-5 space-y-4">
              {formSuccess && (
                <div className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {formSuccess}
                </div>
              )}

              {formError && (
                <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* PO Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Select Purchase Order *
                </label>
                <select
                  required
                  value={selectedPoId}
                  onChange={(e) => handlePoChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="">-- Choose an open Purchase Order --</option>
                  {openOrders.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.poNumber || o.orderNumber} (₹{o.totalAmount?.toLocaleString("en-IN")}) - {o.status.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Logistics Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Carrier / Logistics Partner</label>
                  <input
                    type="text"
                    placeholder="e.g. Blue Dart, Delhivery, V-Trans"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Vehicle Number</label>
                  <input
                    type="text"
                    placeholder="e.g. MH-12-AB-1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Tracking / Docket Number</label>
                  <input
                    type="text"
                    placeholder="e.g. BLU9823412"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Expected Gate Arrival Date *</label>
                  <input
                    type="date"
                    required
                    value={expectedArrivalDate}
                    onChange={(e) => setExpectedArrivalDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Dispatched Line Items & Lot Numbers
                </label>
                {itemsToShip.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic border border-dashed border-border rounded-lg p-3 text-center">
                    Select a Purchase Order above to automatically load order line items.
                  </p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3 text-left">SKU / Item</th>
                          <th className="py-2 px-3 text-right w-24">Shipped Qty</th>
                          <th className="py-2 px-3 text-left w-40">Assigned Lot#</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {itemsToShip.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-medium text-foreground">
                              {it.name} <span className="text-muted-foreground font-mono">({it.sku})</span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min={1}
                                value={it.quantityShipped}
                                onChange={(e) => updateItemQty(idx, parseInt(e.target.value) || 1)}
                                className="w-20 px-2 py-1 text-xs text-right font-mono rounded border border-input bg-background"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={it.lotNumber}
                                onChange={(e) => updateItemLot(idx, e.target.value)}
                                className="w-full px-2 py-1 text-xs font-mono rounded border border-input bg-background"
                                placeholder="Lot #"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Shipment Remarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Packed in 4 pallets with tamper-evident tape."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || itemsToShip.length === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Truck className="w-3.5 h-3.5" />
                  )}
                  Lodge ASN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplierASNPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-cyan-400">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      }
    >
      <SupplierASNContent />
    </Suspense>
  );
}

