"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  DollarSign,
  Printer,
  CreditCard,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PrintableInvoiceView, InvoiceData } from "@/components/invoices/printable-invoice-view";

export default function CustomerInvoicesPortalPage() {
  const [statement, setStatement] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activePrintInvoice, setActivePrintInvoice] = useState<InvoiceData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [stateRes, invRes] = await Promise.all([
        apiFetch<any>("/portal/customer/statement"),
        apiFetch<any>("/portal/customer/invoices"),
      ]);

      if (stateRes?.statement) setStatement(stateRes.statement);
      if (invRes?.invoices) setInvoices(invRes.invoices);
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load customer statement & invoices:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenPrint = async (invoiceId: string) => {
    try {
      const res = await apiFetch<any>(`/invoices/${invoiceId}`);
      if (res?.invoice) {
        setActivePrintInvoice(res.invoice);
      }
    } catch (err: any) {
      alert("Failed to load printable invoice.");
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.status?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-primary" />
            Financial Statement & Tax Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View credit ledger balance, download formal GST tax invoices, and track payment receipts
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition text-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Statement
        </button>
      </div>

      {/* Credit Ledger Summary Cards */}
      {statement && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Credit Limit
            </span>
            <div className="text-2xl font-bold font-mono text-foreground mt-1">
              ₹{statement.creditLimit.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-muted-foreground">Pre-approved credit line</span>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Outstanding Balance Due
            </span>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
              ₹{statement.outstandingBalance.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-rose-600/80">Pending invoice settlements</span>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Available Credit
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{statement.availableCredit.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-emerald-600/80">Available for new orders</span>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
              Credit Terms
            </span>
            <div className="text-2xl font-bold font-mono text-foreground mt-1">
              {statement.creditDays} Days
            </div>
            <span className="text-[11px] text-muted-foreground">Standard settlement cycle</span>
          </div>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search invoice number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Invoices Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="p-3.5">Invoice #</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Due Date</th>
                <th className="p-3.5 text-right">Invoice Total</th>
                <th className="p-3.5 text-right">Paid Amount</th>
                <th className="p-3.5 text-right">Balance Due</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {isLoading ? "Loading customer invoices..." : "No invoices found on your account."}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const grandTotal = inv.financialSummary?.grandTotal || inv.grandTotal || 0;
                  const amountPaid = inv.financialSummary?.amountPaid || inv.amountPaid || 0;
                  const amountDue = inv.financialSummary?.amountDue || inv.amountDue || 0;

                  return (
                    <tr key={inv._id} className="hover:bg-muted/30 transition">
                      <td className="p-3.5 font-mono font-bold text-foreground">
                        {inv.invoiceNumber}
                      </td>
                      <td className="p-3.5">
                        {new Date(inv.invoiceDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="p-3.5">
                        {new Date(inv.dueDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
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
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : inv.status === "PARTIALLY_PAID"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleOpenPrint(inv._id)}
                          className="px-2.5 py-1 rounded bg-background hover:bg-muted border border-border text-xs font-medium flex items-center gap-1.5 ml-auto text-foreground shadow-sm"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print / PDF</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Printable A4 Invoice View */}
      {activePrintInvoice && (
        <PrintableInvoiceView
          invoice={activePrintInvoice}
          onClose={() => setActivePrintInvoice(null)}
        />
      )}
    </div>
  );
}

