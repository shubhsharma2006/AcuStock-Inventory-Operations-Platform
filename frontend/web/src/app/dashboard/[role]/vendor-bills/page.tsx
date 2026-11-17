"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  DollarSign,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ThreeWayMatchModal } from "@/components/vendor-bills/three-way-match-modal";
import { RecordVendorPaymentModal } from "@/components/vendor-bills/record-vendor-payment-modal";
import { CreateBillModal } from "@/components/vendor-bills/create-bill-modal";

interface VendorBillListItem {
  _id: string;
  billNumber: string;
  vendorInvoiceNumber: string;
  billDate: string;
  dueDate: string;
  status: "UNDER_REVIEW" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "DISPUTED" | "CANCELLED";
  supplierId?: {
    _id: string;
    name: string;
    gstin?: string;
    phone?: string;
  };
  purchaseOrderId?: {
    _id: string;
    poNumber: string;
    status?: string;
    totalValue?: number;
  };
  financialSummary: {
    grandTotal: number;
    amountPaid: number;
    amountDue: number;
  };
  matchingEngine: {
    status: "PERFECT_MATCH" | "QUANTITY_VARIANCE" | "PRICE_VARIANCE" | "OVER_BILLED" | "OVERRIDDEN";
    quantityVarianceUnits: number;
    priceVarianceAmount: number;
    approvedForPayment: boolean;
  };
  createdAt: string;
}

interface ApAgingSummary {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  totalPayables: number;
}

export default function VendorBillsDashboardPage() {
  const [bills, setBills] = useState<VendorBillListItem[]>([]);
  const [aging, setAging] = useState<ApAgingSummary>({
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    totalPayables: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [matchFilter, setMatchFilter] = useState<string>("ALL");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [activeMatchBill, setActiveMatchBill] = useState<VendorBillListItem | null>(null);
  const [activePaymentBill, setActivePaymentBill] = useState<VendorBillListItem | null>(null);

  const fetchBillsData = async () => {
    try {
      setIsLoading(true);
      const [billsRes, agingRes] = await Promise.all([
        apiFetch<any>("/vendor-bills?limit=100"),
        apiFetch<any>("/vendor-bills/aging"),
      ]);

      if (billsRes?.bills) {
        setBills(billsRes.bills);
      }
      if (agingRes?.agingSummary) {
        setAging(agingRes.agingSummary);
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load vendor bills & AP aging:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBillsData();
  }, []);

  // Filtered bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        b.billNumber.toLowerCase().includes(q) ||
        b.vendorInvoiceNumber.toLowerCase().includes(q) ||
        b.supplierId?.name.toLowerCase().includes(q) ||
        b.purchaseOrderId?.poNumber.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "ALL" || b.status === statusFilter;

      const matchesMatch =
        matchFilter === "ALL" || b.matchingEngine.status === matchFilter;

      return matchesSearch && matchesStatus && matchesMatch;
    });
  }, [bills, searchQuery, statusFilter, matchFilter]);

  // Overall totals
  const totalBilled = useMemo(() => {
    return bills.reduce((acc, curr) => acc + (curr.financialSummary?.grandTotal || 0), 0);
  }, [bills]);

  const totalPaid = useMemo(() => {
    return bills.reduce((acc, curr) => acc + (curr.financialSummary?.amountPaid || 0), 0);
  }, [bills]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-primary" />
            Accounts Payable (AP) & 3-Way Matching
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vendor bill ingestion, automated PO $\iff$ GRN $\iff$ Bill reconciliation, variance gating, and payment vouchers
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchBillsData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Ingest Vendor Bill
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Billed
            </span>
            <div className="text-2xl font-bold font-mono text-foreground mt-1">
              ₹{totalBilled.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-muted-foreground">Cumulative supplier invoices</span>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Disbursed
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{totalPaid.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-emerald-600/80">Reconciled payment vouchers</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Outstanding Accounts Payable
            </span>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
              ₹{aging.totalPayables.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-rose-600/80">Pending vendor disbursements</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* AP Aging Buckets Schedule */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            Accounts Payable (AP) Aging Schedule
          </span>
          <span className="text-xs font-mono font-medium text-muted-foreground">
            Total Overdue: ₹{(aging.days_1_30 + aging.days_31_60 + aging.days_61_90 + aging.days_90_plus).toLocaleString("en-IN")}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <span className="text-[11px] font-medium text-muted-foreground">Current (Not Due)</span>
            <div className="font-mono font-bold text-sm text-foreground mt-0.5">
              ₹{aging.current.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <span className="text-[11px] font-medium">1–30 Days Overdue</span>
            <div className="font-mono font-bold text-sm mt-0.5">
              ₹{aging.days_1_30.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400">
            <span className="text-[11px] font-medium">31–60 Days Overdue</span>
            <div className="font-mono font-bold text-sm mt-0.5">
              ₹{aging.days_31_60.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400">
            <span className="text-[11px] font-medium">61–90 Days Overdue</span>
            <div className="font-mono font-bold text-sm mt-0.5">
              ₹{aging.days_61_90.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-red-600/15 border border-red-600/30 text-red-700 dark:text-red-400">
            <span className="text-[11px] font-semibold">90+ Days Critical</span>
            <div className="font-mono font-bold text-sm mt-0.5">
              ₹{aging.days_90_plus.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search bill #, supplier invoice #, vendor..."
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
            <option value="ALL">All Payment Statuses</option>
            <option value="APPROVED">Approved / Unpaid</option>
            <option value="UNDER_REVIEW">Under Review (Variance Flagged)</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Fully Settled</option>
            <option value="DISPUTED">Disputed</option>
          </select>

          <select
            value={matchFilter}
            onChange={(e) => setMatchFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">All 3-Way Match Results</option>
            <option value="PERFECT_MATCH">Perfect Match (0 Variance)</option>
            <option value="QUANTITY_VARIANCE">Quantity Variance</option>
            <option value="PRICE_VARIANCE">Price Variance</option>
            <option value="OVER_BILLED">Over-Billed (Qty + Rate)</option>
            <option value="OVERRIDDEN">Manager Overridden</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="p-3.5">Bill #</th>
                <th className="p-3.5">Vendor Invoice #</th>
                <th className="p-3.5">Supplier</th>
                <th className="p-3.5">PO Ref</th>
                <th className="p-3.5 text-right">Total Billed</th>
                <th className="p-3.5 text-right">Balance Due</th>
                <th className="p-3.5 text-center">3-Way Match</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                        <span>Loading vendor bills...</span>
                      </div>
                    ) : (
                      "No vendor bills found. Click '+ Ingest Vendor Bill' to record a supplier invoice."
                    )}
                  </td>
                </tr>
              ) : (
                filteredBills.map((b) => {
                  const match = b.matchingEngine;
                  const isOverdue =
                    b.status !== "PAID" &&
                    new Date(b.dueDate).getTime() < Date.now();

                  return (
                    <tr key={b._id} className="hover:bg-muted/30 transition">
                      <td className="p-3.5 font-mono font-bold text-foreground">
                        <button
                          onClick={() => setActiveMatchBill(b)}
                          className="hover:text-primary hover:underline flex items-center gap-1"
                        >
                          {b.billNumber}
                        </button>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {new Date(b.billDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className="font-semibold text-foreground">
                          {b.vendorInvoiceNumber}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-foreground">{b.supplierId?.name || "Vendor"}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {b.supplierId?.gstin || "URP"}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className="text-foreground font-medium">
                          {b.purchaseOrderId?.poNumber || "--"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-medium text-foreground">
                        ₹{b.financialSummary.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold">
                        <span
                          className={
                            b.financialSummary.amountDue > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground"
                          }
                        >
                          ₹{b.financialSummary.amountDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => setActiveMatchBill(b)}
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            match.status === "PERFECT_MATCH"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : match.status === "OVERRIDDEN"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {match.status}
                        </button>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === "PAID"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : b.status === "APPROVED"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : b.status === "UNDER_REVIEW"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isOverdue && b.status !== "PAID" ? "OVERDUE" : b.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect 3-Way Match */}
                          <button
                            onClick={() => setActiveMatchBill(b)}
                            title="Inspect 3-Way Match & Variances"
                            className="p-1.5 rounded-md hover:bg-muted text-foreground transition"
                          >
                            <Scale className="w-4 h-4" />
                          </button>

                          {/* Record Vendor Payment (if authorized & due) */}
                          {b.financialSummary.amountDue > 0 && match.approvedForPayment && (
                            <button
                              onClick={() => setActivePaymentBill(b)}
                              title="Disburse Remittance Voucher"
                              className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-600 transition"
                            >
                              <CreditCard className="w-4 h-4" />
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

      {/* MODAL 1: Ingest Vendor Bill */}
      <CreateBillModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onBillCreated={fetchBillsData}
      />

      {/* MODAL 2: 3-Way Match Inspection & Override */}
      {activeMatchBill && (
        <ThreeWayMatchModal
          bill={activeMatchBill}
          isOpen={!!activeMatchBill}
          onClose={() => setActiveMatchBill(null)}
          onMatchUpdated={fetchBillsData}
        />
      )}

      {/* MODAL 3: Disburse Vendor Payment */}
      {activePaymentBill && (
        <RecordVendorPaymentModal
          bill={activePaymentBill}
          isOpen={!!activePaymentBill}
          onClose={() => setActivePaymentBill(null)}
          onPaymentSuccess={fetchBillsData}
        />
      )}
    </div>
  );
}

