"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Download,
  Printer,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Send,
  CreditCard,
  TrendingUp,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PrintableInvoiceView, InvoiceData } from "@/components/invoices/printable-invoice-view";
import { RecordPaymentModal } from "@/components/invoices/record-payment-modal";
import { CreateInvoiceModal } from "@/components/invoices/create-invoice-modal";

interface InvoiceListItem {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
  grandTotal?: number;
  amountPaid?: number;
  amountDue?: number;
  financialSummary?: {
    grandTotal: number;
    amountPaid: number;
    amountDue: number;
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    isInterState?: boolean;
  };
  billingAddress: {
    name: string;
    gstin?: string;
    city?: string;
    state: string;
  };
  eWayBill?: {
    ewayBillNumber?: string;
  };
}

interface AgingMetrics {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  totalOutstanding: number;
}

export default function InvoicesDashboardPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [aging, setAging] = useState<AgingMetrics>({
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    totalOutstanding: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [activePaymentInvoice, setActivePaymentInvoice] = useState<InvoiceListItem | null>(null);
  const [activePrintInvoice, setActivePrintInvoice] = useState<InvoiceData | null>(null);

  const [metrics, setMetrics] = useState({
    totalInvoiced: 0,
    totalCollected: 0,
    totalReceivables: 0,
    overdueAmount: 0,
  });

  const fetchInvoices = async () => {
    try {
      setIsLoading(true);
      const [invRes, agingRes] = await Promise.all([
        apiFetch<any>("/invoices?limit=100"),
        apiFetch<any>("/invoices/reports/ar-aging"),
      ]);

      if (invRes?.invoices) {
        setInvoices(invRes.invoices);
      }
      if (invRes?.metrics) {
        setMetrics(invRes.metrics);
      }
      if (agingRes?.agingSummary) {
        setAging(agingRes.agingSummary);
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load invoices or AR aging:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.billingAddress.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.billingAddress.gstin && inv.billingAddress.gstin.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "ALL" || inv.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchQuery, statusFilter]);

  // Overall KPI totals
  const totalInvoiced = useMemo(() => {
    return invoices.reduce((acc, curr) => acc + (curr.grandTotal || 0), 0);
  }, [invoices]);

  const totalCollected = useMemo(() => {
    return invoices.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
  }, [invoices]);

  // Download NIC E-Way Bill JSON
  const handleDownloadEWayBill = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const res = await apiFetch<any>(`/invoices/${invoiceId}/eway-bill`);
      const payload = res?.ewayBillPayload || res;
      if (payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `EWayBill_${invoiceNumber}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert(err.message || "Could not generate E-Way bill JSON.");
    }
  };

  // Open A4 Printable View
  const handleOpenPrintView = async (invoiceId: string) => {
    try {
      const res = await apiFetch<any>(`/invoices/${invoiceId}`);
      if (res?.invoice) {
        setActivePrintInvoice(res.invoice);
      }
    } catch (err: any) {
      alert("Failed to load full invoice details for printing.");
    }
  };

  // WhatsApp reminder simulation
  const handleSendReminder = async (invoiceId: string) => {
    try {
      const res = await apiFetch<any>(`/invoices/${invoiceId}/send-reminder`, { method: "POST" });
      alert(res.message || "Payment reminder sent successfully.");
    } catch (err: any) {
      alert(err.message || "Failed to dispatch reminder.");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-primary" />
            Tax Invoicing & Accounts Receivable (AR)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            GST-compliant commercial invoicing, collections tracking, NIC E-Way Bill export, and AR aging
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchInvoices}
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
            Create Tax Invoice
          </button>
        </div>
      </div>

      {/* Top Metric Cards: Invoiced vs Collected vs Outstanding */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Invoiced
            </span>
            <div className="text-2xl font-bold font-mono text-foreground mt-1">
              ₹{totalInvoiced.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-muted-foreground">Cumulative billed across all tenures</span>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Collections
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{totalCollected.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-emerald-600/80">Reconciled customer receipts</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Outstanding Accounts Receivable
            </span>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
              ₹{aging.totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-rose-600/80">Uncollected customer balances</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* AR Aging Buckets Banner */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            Accounts Receivable Aging Analysis
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
            placeholder="Search invoice #, customer, GSTIN..."
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
            <option value="ISSUED">Issued / Unpaid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Fully Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      {/* Invoices Data Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="p-3.5">Invoice #</th>
                <th className="p-3.5">Date / Due</th>
                <th className="p-3.5">Customer & GSTIN</th>
                <th className="p-3.5 text-right">Total Amount</th>
                <th className="p-3.5 text-right">Paid</th>
                <th className="p-3.5 text-right">Balance Due</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                        <span>Loading tax invoices...</span>
                      </div>
                    ) : (
                      "No invoices found matching criteria. Click '+ Create Tax Invoice' to issue your first commercial invoice."
                    )}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const grandTotal = inv.financialSummary?.grandTotal ?? inv.grandTotal ?? 0;
                  const amountPaid = inv.financialSummary?.amountPaid ?? inv.amountPaid ?? 0;
                  const amountDue = inv.financialSummary?.amountDue ?? inv.amountDue ?? 0;
                  const isOverdue =
                    inv.status !== "PAID" &&
                    new Date(inv.dueDate).getTime() < Date.now();

                  return (
                    <tr key={inv._id} className="hover:bg-muted/30 transition">
                      <td className="p-3.5 font-mono font-semibold text-foreground">
                        <button
                          onClick={() => handleOpenPrintView(inv._id)}
                          className="hover:text-primary hover:underline flex items-center gap-1.5"
                        >
                          {inv.invoiceNumber}
                        </button>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-foreground">
                          {new Date(inv.invoiceDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div
                          className={`text-[10px] ${
                            isOverdue ? "text-rose-600 font-semibold" : "text-muted-foreground"
                          }`}
                        >
                          Due:{" "}
                          {new Date(inv.dueDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-foreground">{inv.billingAddress.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {inv.billingAddress.gstin || "URP (Unregistered)"} • {inv.billingAddress.city || inv.billingAddress.state}
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-mono font-medium text-foreground">
                        ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        ₹{amountPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold">
                        <span className={amountDue > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}>
                          ₹{amountDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : inv.status === "PARTIALLY_PAID"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : inv.status === "OVERDUE" || isOverdue
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {isOverdue && inv.status !== "PAID" ? "OVERDUE" : inv.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Record payment if due */}
                          {amountDue > 0 && (
                            <button
                              onClick={() => setActivePaymentInvoice(inv)}
                              title="Record Customer Collection"
                              className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-600 transition"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}

                          {/* Print / View A4 */}
                          <button
                            onClick={() => handleOpenPrintView(inv._id)}
                            title="View / Print Tax Invoice"
                            className="p-1.5 rounded-md hover:bg-muted text-foreground transition"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Download NIC E-Way Bill JSON */}
                          <button
                            onClick={() => handleDownloadEWayBill(inv._id, inv.invoiceNumber)}
                            title="Download NIC E-Way Bill JSON"
                            className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-600 transition"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Send WhatsApp Reminder */}
                          {(inv.amountDue || 0) > 0 && (
                            <button
                              onClick={() => handleSendReminder(inv._id)}
                              title="Send WhatsApp Payment Reminder"
                              className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-600 transition"
                            >
                              <Send className="w-4 h-4" />
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

      {/* MODAL 1: Create Invoice */}
      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onInvoiceCreated={fetchInvoices}
      />

      {/* MODAL 2: Record Payment */}
      {activePaymentInvoice && (
        <RecordPaymentModal
          isOpen={!!activePaymentInvoice}
          invoiceId={activePaymentInvoice._id}
          invoiceNumber={activePaymentInvoice.invoiceNumber}
          customerName={activePaymentInvoice.billingAddress.name}
          amountDue={activePaymentInvoice.financialSummary?.amountDue ?? activePaymentInvoice.amountDue ?? 0}
          onClose={() => setActivePaymentInvoice(null)}
          onPaymentSuccess={fetchInvoices}
        />
      )}

      {/* MODAL 3: Printable A4 Invoice View */}
      {activePrintInvoice && (
        <PrintableInvoiceView
          invoice={activePrintInvoice}
          onClose={() => setActivePrintInvoice(null)}
        />
      )}
    </div>
  );
}
