"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  RotateCcw,
  Truck,
  Package,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Filter,
  RefreshCw,
  FileText,
  Clock,
  Printer,
  ExternalLink,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { CreateRmaModal } from "@/components/rma/create-rma-modal";
import { InspectRmaModal } from "@/components/rma/inspect-rma-modal";
import { PrintableCreditNoteView, CreditNoteData } from "@/components/credit-notes/printable-credit-note-view";

interface RmaListItem {
  _id: string;
  rmaNumber: string;
  status: "REQUESTED" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "INSPECTED" | "COMPLETED" | "REJECTED";
  returnType: "CUSTOMER_RETURN" | "COURIER_RTO" | "DEFECT_REPLACEMENT";
  reason: string;
  companyId?: {
    _id: string;
    name: string;
    gstin?: string;
    phone?: string;
  };
  invoiceId?: {
    _id: string;
    invoiceNumber: string;
    invoiceDate?: string;
  };
  creditNoteId?: any;
  items: Array<{
    name: string;
    sku?: string;
    quantityRequested: number;
    quantityReceived: number;
    unitPrice: number;
    disposition?: string;
  }>;
  returnLogistics?: {
    courierName?: string;
    trackingNumber?: string;
    receivedDate?: string;
  };
  createdAt: string;
}

interface RmaMetrics {
  totalPending: number;
  awaitingInspection: number;
  totalCompleted: number;
  totalCreditIssued: number;
}

export default function RmaDashboardPage() {
  const [rmas, setRmas] = useState<RmaListItem[]>([]);
  const [metrics, setMetrics] = useState<RmaMetrics>({
    totalPending: 0,
    awaitingInspection: 0,
    totalCompleted: 0,
    totalCreditIssued: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [activeInspectRma, setActiveInspectRma] = useState<RmaListItem | null>(null);
  const [activePrintCreditNote, setActivePrintCreditNote] = useState<CreditNoteData | null>(null);

  const fetchRmaData = async () => {
    try {
      setIsLoading(true);
      const [rmaRes, metricsRes] = await Promise.all([
        apiFetch<any>("/rma?limit=100"),
        apiFetch<any>("/rma/metrics"),
      ]);

      if (rmaRes?.rmas) {
        setRmas(rmaRes.rmas);
      }
      if (metricsRes?.metrics) {
        setMetrics(metricsRes.metrics);
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load RMA data:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRmaData();
  }, []);

  // Filtered RMAs
  const filteredRmas = useMemo(() => {
    return rmas.filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        r.rmaNumber.toLowerCase().includes(q) ||
        r.companyId?.name.toLowerCase().includes(q) ||
        r.invoiceId?.invoiceNumber.toLowerCase().includes(q) ||
        (r.returnLogistics?.trackingNumber && r.returnLogistics.trackingNumber.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "ALL" || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rmas, searchQuery, statusFilter]);

  // Status transitions
  const handleUpdateStatus = async (rmaId: string, newStatus: string) => {
    try {
      await apiFetch(`/rma/${rmaId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      fetchRmaData();
    } catch (err: any) {
      alert(err.message || "Failed to update RMA status");
    }
  };

  // Open Printable Credit Note
  const handleOpenCreditNote = async (creditNoteId: string) => {
    try {
      const res = await apiFetch<any>(`/credit-notes/${creditNoteId}`);
      if (res?.creditNote) {
        setActivePrintCreditNote(res.creditNote);
      }
    } catch (err: any) {
      alert("Failed to load Credit Note details for printing.");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            Returns, Reverse Logistics & Credit Notes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customer returns triage, Courier RTO, dock quality inspection, and statutory GST credit notes
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchRmaData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Authorize Return (RMA)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pending Returns
            </span>
            <div className="text-2xl font-bold font-mono text-foreground mt-1">
              {metrics.totalPending}
            </div>
            <span className="text-[11px] text-muted-foreground">Authorized or in-transit</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dock Inspection Queue
            </span>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
              {metrics.awaitingInspection}
            </div>
            <span className="text-[11px] text-blue-600/80">Packages received at gate</span>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Inspected & Completed
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {metrics.totalCompleted}
            </div>
            <span className="text-[11px] text-emerald-600/80">Restocked or scrapped</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              GST Credit Issued
            </span>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
              ₹{metrics.totalCreditIssued.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-rose-600/80">Reconciled against AR</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <RotateCcw className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search RMA #, Invoice #, Tracking #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="REQUESTED">Requested</option>
            <option value="APPROVED">Approved / Pending Shipment</option>
            <option value="IN_TRANSIT">In-Transit</option>
            <option value="RECEIVED">Received at Dock</option>
            <option value="COMPLETED">Completed (Credited)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="p-3.5">RMA #</th>
                <th className="p-3.5">Original Invoice</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Return Reason & Type</th>
                <th className="p-3.5">Logistics & Tracking</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRmas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                        <span>Loading return authorizations...</span>
                      </div>
                    ) : (
                      "No return authorizations found. Click '+ Authorize Return (RMA)' to initiate."
                    )}
                  </td>
                </tr>
              ) : (
                filteredRmas.map((r) => {
                  const totalUnits = r.items.reduce((acc, curr) => acc + (curr.quantityRequested || 0), 0);
                  const isReadyForInspection = r.status === "RECEIVED" || r.status === "APPROVED";

                  return (
                    <tr key={r._id} className="hover:bg-muted/30 transition">
                      <td className="p-3.5 font-mono font-bold text-foreground">
                        {r.rmaNumber}
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {new Date(r.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className="font-semibold text-foreground">
                          {r.invoiceId?.invoiceNumber || "--"}
                        </span>
                        <div className="text-[10px] text-muted-foreground">
                          {totalUnits} items requested
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-foreground">{r.companyId?.name || "Customer"}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {r.companyId?.gstin || "URP"}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-foreground">
                          {r.reason.replace(/_/g, " ")}
                        </span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {r.returnType.replace(/_/g, " ")}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-[11px]">
                        {r.returnLogistics?.courierName ? (
                          <>
                            <div className="font-medium text-foreground">{r.returnLogistics.courierName}</div>
                            <div className="text-[10px] text-muted-foreground">{r.returnLogistics.trackingNumber || "--"}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Direct Handover</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : r.status === "RECEIVED"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : r.status === "IN_TRANSIT"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              : r.status === "APPROVED"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Step 1: Mark In-Transit */}
                          {r.status === "APPROVED" && (
                            <button
                              onClick={() => handleUpdateStatus(r._id, "IN_TRANSIT")}
                              title="Mark In-Transit via Courier"
                              className="px-2 py-1 rounded border border-border hover:bg-muted text-[11px] font-medium flex items-center gap-1"
                            >
                              <Truck className="w-3.5 h-3.5 text-purple-600" />
                              <span>Shipped</span>
                            </button>
                          )}

                          {/* Step 2: Mark Received at Dock */}
                          {r.status === "IN_TRANSIT" && (
                            <button
                              onClick={() => handleUpdateStatus(r._id, "RECEIVED")}
                              title="Confirm Arrival at Warehouse Dock"
                              className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-medium flex items-center gap-1 shadow-sm"
                            >
                              <Package className="w-3.5 h-3.5" />
                              <span>Receive at Dock</span>
                            </button>
                          )}

                          {/* Step 3: Inspect & Triage Disposition */}
                          {isReadyForInspection && r.status !== "COMPLETED" && (
                            <button
                              onClick={() => setActiveInspectRma(r)}
                              title="Dock Inspection & Disposition Triage"
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-medium flex items-center gap-1 shadow-sm"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Inspect & Restock</span>
                            </button>
                          )}

                          {/* Step 4: View Generated Credit Note */}
                          {r.creditNoteId && (
                            <button
                              onClick={() =>
                                handleOpenCreditNote(
                                  r.creditNoteId._id || r.creditNoteId
                                )
                              }
                              title="View / Print Statutory GST Credit Note"
                              className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-600 transition"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Create RMA */}
      <CreateRmaModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onRmaCreated={fetchRmaData}
      />

      {/* MODAL 2: Dock Inspection & Disposition */}
      {activeInspectRma && (
        <InspectRmaModal
          rma={activeInspectRma}
          isOpen={!!activeInspectRma}
          onClose={() => setActiveInspectRma(null)}
          onInspectionCompleted={fetchRmaData}
        />
      )}

      {/* MODAL 3: Printable Credit Note */}
      {activePrintCreditNote && (
        <PrintableCreditNoteView
          creditNote={activePrintCreditNote}
          onClose={() => setActivePrintCreditNote(null)}
        />
      )}
    </div>
  );
}

