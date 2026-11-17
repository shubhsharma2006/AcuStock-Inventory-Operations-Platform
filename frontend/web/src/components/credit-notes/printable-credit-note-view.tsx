"use client";

import React, { useRef } from "react";
import { Printer, X, FileText, CheckCircle2, RotateCcw } from "lucide-react";

export interface CreditNoteData {
  _id: string;
  creditNoteNumber: string;
  originalInvoiceNumber: string;
  originalInvoiceDate?: string;
  creditNoteDate: string;
  reason?: string;
  billingAddress: {
    name: string;
    gstin?: string;
    addressLine1?: string;
    city?: string;
    state: string;
    stateCode?: string;
    pincode?: string;
  };
  sellerDetails?: {
    name?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    city?: string;
    state?: string;
    stateCode?: string;
    pincode?: string;
    email?: string;
    phone?: string;
  };
  items: Array<{
    name: string;
    sku?: string;
    hsnCode?: string;
    quantity: number;
    unitPrice: number;
    taxableAmount: number;
    gstRate: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    total: number;
  }>;
  financialSummary: {
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    roundOff: number;
    grandTotal: number;
    isInterState?: boolean;
  };
  status: "ISSUED" | "ALLOCATED" | "REFUNDED" | "VOID";
}

interface PrintableCreditNoteViewProps {
  creditNote: CreditNoteData;
  onClose: () => void;
}

export function PrintableCreditNoteView({ creditNote, onClose }: PrintableCreditNoteViewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const seller = creditNote.sellerDetails || {
    name: "ACUSTOCK ENTERPRISE SYSTEMS PVT LTD",
    gstin: "27AAACA9876J1Z8",
    pan: "AAACA9876J",
    address: "Plot 42, Tech Park, MIDC Andheri East",
    city: "Mumbai",
    state: "Maharashtra",
    stateCode: "27",
    pincode: "400093",
    email: "billing@acustock.io",
    phone: "+91 22 4567 8900",
  };

  const isInterState = creditNote.financialSummary.isInterState || (creditNote.financialSummary.igst || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex justify-center items-start p-4 md:p-8 print:p-0 print:bg-white print:static">
      {/* Top action toolbar - hidden when printing */}
      <div className="fixed top-4 right-6 flex items-center gap-3 z-50 print:hidden bg-background/90 border border-border shadow-xl rounded-full px-4 py-2">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-muted hover:bg-muted/80 text-foreground transition"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* A4 Sheet Container */}
      <div
        ref={printRef}
        className="w-full max-w-[850px] bg-white text-zinc-900 rounded-lg shadow-2xl p-8 my-8 print:my-0 print:p-6 print:shadow-none print:w-full print:rounded-none border border-zinc-200 text-xs font-sans leading-relaxed"
      >
        {/* Title & Copy Mark */}
        <div className="border-b-2 border-zinc-800 pb-3 flex justify-between items-end">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-rose-600 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              STATUTORY CREDIT NOTE (SECTION 34 CGST ACT)
            </span>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 mt-0.5">CREDIT NOTE</h1>
            <p className="text-[11px] text-zinc-600 font-medium">Reversal of Taxable Value and Output Tax Liability</p>
          </div>
          <div className="text-right">
            <div className="inline-block px-2.5 py-1 rounded bg-rose-50 border border-rose-200 font-mono text-xs font-bold text-rose-800">
              {creditNote.status}
            </div>
            <p className="text-[11px] font-mono font-semibold mt-1 text-zinc-700">
              No: <span className="font-bold text-zinc-900">{creditNote.creditNoteNumber}</span>
            </p>
          </div>
        </div>

        {/* Header Grid: Seller vs Meta */}
        <div className="grid grid-cols-2 gap-6 py-4 border-b border-zinc-200">
          <div>
            <h2 className="font-bold text-sm text-zinc-900">{seller.name}</h2>
            <p className="text-zinc-600">{seller.address}, {seller.city}, {seller.state} - {seller.pincode}</p>
            <p className="font-mono mt-1 text-zinc-800">
              <span className="font-bold">GSTIN:</span> {seller.gstin} | <span className="font-bold">PAN:</span> {seller.pan}
            </p>
            <p className="text-zinc-600">
              <span className="font-semibold">State:</span> {seller.state} (Code: {seller.stateCode})
            </p>
          </div>

          <div className="bg-zinc-50/70 p-3 rounded border border-zinc-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Credit Note Date:</span>
              <span className="font-semibold">{new Date(creditNote.creditNoteDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Original Invoice No:</span>
              <span className="font-mono font-bold text-zinc-900">{creditNote.originalInvoiceNumber}</span>
            </div>
            {creditNote.originalInvoiceDate && (
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Original Invoice Date:</span>
                <span className="font-semibold">{new Date(creditNote.originalInvoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">GST Reason Code:</span>
              <span className="font-semibold">{creditNote.reason || "01-Sales Return"}</span>
            </div>
          </div>
        </div>

        {/* Customer Details */}
        <div className="py-4 border-b border-zinc-200">
          <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 mb-1">
            Credit Issued To (Customer)
          </div>
          <h3 className="font-bold text-zinc-900 text-xs">{creditNote.billingAddress.name}</h3>
          <p className="text-zinc-600">
            {creditNote.billingAddress.addressLine1}
            {creditNote.billingAddress.city ? `, ${creditNote.billingAddress.city}` : ""}, {creditNote.billingAddress.state} - {creditNote.billingAddress.pincode}
          </p>
          <p className="font-mono mt-1 text-zinc-800">
            <span className="font-bold">GSTIN:</span> {creditNote.billingAddress.gstin || "URP (Unregistered)"} • State Code: {creditNote.billingAddress.stateCode || "--"}
          </p>
        </div>

        {/* Itemized Table */}
        <div className="py-3">
          <table className="w-full border-collapse border border-zinc-300 text-[11px]">
            <thead>
              <tr className="bg-zinc-100 text-zinc-800 text-left font-semibold">
                <th className="p-2 border border-zinc-300 w-8 text-center">#</th>
                <th className="p-2 border border-zinc-300">Description of Goods Returned</th>
                <th className="p-2 border border-zinc-300 text-center w-16">HSN</th>
                <th className="p-2 border border-zinc-300 text-center w-12">Qty</th>
                <th className="p-2 border border-zinc-300 text-right w-16">Rate (₹)</th>
                <th className="p-2 border border-zinc-300 text-right w-20">Taxable Val</th>
                {isInterState ? (
                  <th className="p-2 border border-zinc-300 text-right w-16">IGST</th>
                ) : (
                  <>
                    <th className="p-2 border border-zinc-300 text-right w-16">CGST</th>
                    <th className="p-2 border border-zinc-300 text-right w-16">SGST</th>
                  </>
                )}
                <th className="p-2 border border-zinc-300 text-right w-20">Credit Total</th>
              </tr>
            </thead>
            <tbody>
              {creditNote.items.map((item, idx) => (
                <tr key={idx} className="border-b border-zinc-200">
                  <td className="p-2 border border-zinc-300 text-center text-zinc-500">{idx + 1}</td>
                  <td className="p-2 border border-zinc-300">
                    <span className="font-semibold text-zinc-900">{item.name}</span>
                    {item.sku && <span className="block text-[10px] text-zinc-500 font-mono">SKU: {item.sku}</span>}
                  </td>
                  <td className="p-2 border border-zinc-300 text-center font-mono text-zinc-700">{item.hsnCode || "--"}</td>
                  <td className="p-2 border border-zinc-300 text-center font-medium">{item.quantity}</td>
                  <td className="p-2 border border-zinc-300 text-right font-mono">{item.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 border border-zinc-300 text-right font-mono font-medium">{item.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  {isInterState ? (
                    <td className="p-2 border border-zinc-300 text-right font-mono text-zinc-700">
                      <div>{(item.igstAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                      <span className="text-[9px] text-zinc-500">({item.gstRate}%)</span>
                    </td>
                  ) : (
                    <>
                      <td className="p-2 border border-zinc-300 text-right font-mono text-zinc-700">
                        <div>{(item.cgstAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                        <span className="text-[9px] text-zinc-500">({item.gstRate / 2}%)</span>
                      </td>
                      <td className="p-2 border border-zinc-300 text-right font-mono text-zinc-700">
                        <div>{(item.sgstAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                        <span className="text-[9px] text-zinc-500">({item.gstRate / 2}%)</span>
                      </td>
                    </>
                  )}
                  <td className="p-2 border border-zinc-300 text-right font-mono font-bold text-zinc-900">{item.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculations Breakdown */}
        <div className="grid grid-cols-2 gap-6 pt-2 pb-4 border-b border-zinc-200">
          <div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total Credit in Words:</span>
            <p className="font-medium italic text-zinc-700 mt-1">
              Indian Rupees {Math.round(creditNote.financialSummary.grandTotal).toLocaleString("en-IN")} Only
            </p>
            <p className="text-[11px] text-zinc-500 mt-3">
              Note: This credit note has been credited against customer account and reduces accounts receivable accordingly.
            </p>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between py-1 border-b border-zinc-100">
              <span className="text-zinc-600">Reversed Taxable Value:</span>
              <span className="font-mono font-semibold">₹{creditNote.financialSummary.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {isInterState ? (
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-600">Reversed IGST:</span>
                <span className="font-mono font-semibold">₹{creditNote.financialSummary.igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">Reversed CGST:</span>
                  <span className="font-mono font-semibold">₹{creditNote.financialSummary.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">Reversed SGST:</span>
                  <span className="font-mono font-semibold">₹{creditNote.financialSummary.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-1 border-b border-zinc-100">
              <span className="text-zinc-600">Total Tax Reversed:</span>
              <span className="font-mono font-semibold">₹{creditNote.financialSummary.totalTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {creditNote.financialSummary.roundOff !== 0 && (
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-600">Round Off:</span>
                <span className="font-mono font-semibold">₹{creditNote.financialSummary.roundOff.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t-2 border-zinc-800 text-sm font-bold text-zinc-900">
              <span>Grand Credit Total:</span>
              <span className="font-mono text-base font-black text-rose-700">₹{creditNote.financialSummary.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-6 pt-6 text-[10px] text-zinc-600">
          <div>
            <p className="font-semibold text-zinc-800">DECLARATION</p>
            <p className="leading-relaxed mt-0.5">
              This document is issued in compliance with the provisions of Section 34 of the CGST Act, 2017. All corresponding input and output tax adjustments have been reported in the statutory GSTR-1 and GSTR-3B filings.
            </p>
          </div>
          <div className="text-right flex flex-col justify-between items-end">
            <p className="font-bold text-zinc-800">For {seller.name}</p>
            <div className="mt-8 border-t border-zinc-400 pt-1 w-48 text-center">
              <p className="font-semibold text-zinc-800">Authorized Signatory</p>
              <p className="text-[9px] text-zinc-400">Digitally verified adjustment voucher</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

