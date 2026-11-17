"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PackageCheck,
  Calendar,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface POItem {
  productId?: {
    _id: string;
    name: string;
    sku: string;
    barcode?: string;
  };
  name?: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
}

interface PurchaseOrder {
  _id: string;
  orderNumber?: string;
  poNumber?: string;
  createdAt: string;
  expectedDeliveryDate?: string;
  status: string;
  totalAmount: number;
  items: POItem[];
  notes?: string;
}

export default function SupplierOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);

  // Acknowledgment modal state
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [supplierNotes, setSupplierNotes] = useState<string>("");
  const [isSubmittingAck, setIsSubmittingAck] = useState<boolean>(false);
  const [ackSuccessMsg, setAckSuccessMsg] = useState<string | null>(null);
  const [ackErrorMsg, setAckErrorMsg] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<any>("/portal/supplier/orders");
      if (res?.purchaseOrders) {
        setOrders(res.purchaseOrders);
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load supplier orders:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openAckModal = (po: PurchaseOrder) => {
    setSelectedPo(po);
    setExpectedDate(
      po.expectedDeliveryDate
        ? new Date(po.expectedDeliveryDate).toISOString().split("T")[0]
        : new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]
    );
    setSupplierNotes("");
    setAckSuccessMsg(null);
    setAckErrorMsg(null);
  };

  const handleConfirmAck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPo) return;

    try {
      setIsSubmittingAck(true);
      setAckErrorMsg(null);

      const res = await apiFetch<any>(`/portal/supplier/orders/${selectedPo._id}/ack`, {
        method: "POST",
        body: JSON.stringify({
          expectedDeliveryDate: expectedDate,
          supplierNotes,
        }),
      });

      setIsSubmittingAck(false);
      setAckSuccessMsg(res.message || "Purchase order acknowledged successfully.");
      setTimeout(() => {
        setSelectedPo(null);
        fetchOrders();
      }, 1200);
    } catch (err: any) {
      setIsSubmittingAck(false);
      setAckErrorMsg(err.message || "Failed to acknowledge purchase order.");
    }
  };

  const filteredOrders = orders.filter((po) => {
    const q = searchQuery.toLowerCase();
    const poNum = (po.poNumber || po.orderNumber || "").toLowerCase();
    const st = (po.status || "").toLowerCase();
    return poNum.includes(q) || st.includes(q);
  });

  const acknowledgedCount = orders.filter((o) => o.status === "approved").length;
  const pendingCount = orders.filter((o) => o.status === "sent").length;
  const totalValue = orders.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <PackageCheck className="w-6 h-6 text-primary" />
            Supplier Collaboration Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View procurement orders, acknowledge fulfillment timelines, and lodge Advanced Shipping Notices (ASN)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/portal/supplier/asn"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            <Truck className="w-4 h-4" />
            Lodge ASN
          </Link>
          <button
            onClick={fetchOrders}
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
          className="px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary flex items-center gap-2"
        >
          <PackageCheck className="w-4 h-4" />
          Purchase Orders
          <span className="ml-1 px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-primary/10 text-primary">
            {orders.length}
          </span>
        </Link>
        <Link
          href="/portal/supplier/asn"
          className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-muted-foreground/30 flex items-center gap-2 transition"
        >
          <Truck className="w-4 h-4" />
          Advanced Shipping Notices (ASN)
        </Link>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Total Open POs
          </span>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            {orders.length}
          </div>
          <span className="text-[11px] text-muted-foreground">Active supply commitments</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Pending Acknowledgment
          </span>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {pendingCount}
          </div>
          <span className="text-[11px] text-amber-600/80">Requires delivery confirmation</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Acknowledged & Ready
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {acknowledgedCount}
          </div>
          <span className="text-[11px] text-emerald-600/80">Delivery timelines agreed</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Total PO Value
          </span>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            ₹{totalValue.toLocaleString("en-IN")}
          </div>
          <span className="text-[11px] text-muted-foreground">Gross procurement portfolio</span>
        </div>
      </div>

      {/* Search / Filter Bar */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by PO Number or status..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Orders List Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase font-medium text-muted-foreground">
              <tr>
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Order Date</th>
                <th className="py-3 px-4">Expected Delivery</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Items</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading purchase orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((po) => {
                  const poNum = po.poNumber || po.orderNumber || "PO-UNASSIGNED";
                  const isExpanded = expandedPoId === po._id;
                  const isApproved = po.status === "approved";

                  return (
                    <React.Fragment key={po._id}>
                      <tr className="hover:bg-muted/30 transition">
                        <td className="py-3 px-4 font-mono font-medium text-foreground">
                          {poNum}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {new Date(po.createdAt).toLocaleDateString("en-IN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4">
                          {po.expectedDeliveryDate ? (
                            <span className="text-xs font-mono font-medium text-foreground flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              {new Date(po.expectedDeliveryDate).toLocaleDateString("en-IN", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 dark:text-amber-400 italic">
                              Not set
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isApproved
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : po.status === "partially_received"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {isApproved ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {po.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs">
                          {po.items?.length || 0} line(s)
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                          ₹{(po.totalAmount || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setExpandedPoId(isExpanded ? null : po._id)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
                              title="Toggle line items breakdown"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              onClick={() => openAckModal(po)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-muted hover:bg-muted/80 text-foreground transition flex items-center gap-1"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 text-primary" />
                              Ack
                            </button>

                            <Link
                              href={`/portal/supplier/asn?poId=${po._id}`}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-primary/10 hover:bg-primary/20 text-primary transition flex items-center gap-1"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              ASN
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Line Items Row */}
                      {isExpanded && (
                        <tr className="bg-muted/10">
                          <td colSpan={7} className="p-4">
                            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Order Line Items & Specifications
                              </h4>
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground border-b border-border">
                                  <tr>
                                    <th className="py-1 text-left">SKU / Item</th>
                                    <th className="py-1 text-right">Ordered Qty</th>
                                    <th className="py-1 text-right">Agreed Rate</th>
                                    <th className="py-1 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {po.items?.map((it, idx) => {
                                    const name = it.productId?.name || it.name || "Product";
                                    const sku = it.productId?.sku || "-";
                                    const rate = it.unitPrice || 0;
                                    const total = it.totalPrice || rate * it.quantity;

                                    return (
                                      <tr key={idx}>
                                        <td className="py-1.5 font-medium text-foreground">
                                          {name}{" "}
                                          <span className="text-muted-foreground font-mono">
                                            ({sku})
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-right font-mono">
                                          {it.quantity}
                                        </td>
                                        <td className="py-1.5 text-right font-mono">
                                          ₹{rate.toLocaleString("en-IN")}
                                        </td>
                                        <td className="py-1.5 text-right font-mono font-medium">
                                          ₹{total.toLocaleString("en-IN")}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              {po.notes && (
                                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                                  <span className="font-semibold">Notes:</span> {po.notes}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Acknowledgment Modal */}
      {selectedPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-primary" />
                Acknowledge PO #{selectedPo.poNumber || selectedPo.orderNumber}
              </h3>
              <button
                onClick={() => setSelectedPo(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAck} className="p-4 space-y-4">
              {ackSuccessMsg && (
                <div className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {ackSuccessMsg}
                </div>
              )}

              {ackErrorMsg && (
                <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {ackErrorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  Confirmed Delivery Date
                </label>
                <input
                  type="date"
                  required
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Supplier Confirmation Notes / Lot Plan
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Lot 2026-X prepared; dispatching via Blue Dart on scheduled date."
                  value={supplierNotes}
                  onChange={(e) => setSupplierNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSelectedPo(null)}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAck}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center gap-1.5"
                >
                  {isSubmittingAck ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Confirm Delivery Date
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

