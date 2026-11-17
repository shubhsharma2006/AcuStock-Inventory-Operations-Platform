"use client";

import React, { useRef } from "react";
import { Printer, Download, X, Building2, CheckCircle2, ShieldCheck } from "lucide-react";

export interface InvoiceItem {
  productId?: string;
  name: string;
  sku?: string;
  hsnCode?: string;
  uom?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  total: number;
}

export interface InvoiceData {
  _id: string;
  invoiceNumber: string;
  salesOrderId?: any;
  companyId?: any;
  invoiceDate: string;
  dueDate: string;
  placeOfSupply: string;
  placeOfSupplyCode?: string;
  reverseCharge?: boolean;
  paymentTerms?: string;
  billingAddress: {
    name: string;
    gstin?: string;
    pan?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state: string;
    stateCode?: string;
    pincode?: string;
  };
  shippingAddress: {
    name: string;
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
  items: InvoiceItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
  ewayBill?: {
    ewayBillNumber?: string;
    generatedAt?: string;
    validUpto?: string;
    vehicleNumber?: string;
    transporterName?: string;
    transporterId?: string;
  };
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branchName?: string;
    upiId?: string;
  };
  termsAndConditions?: string;
}

interface PrintableInvoiceViewProps {
  invoice: InvoiceData;
  onClose: () => void;
}

export function PrintableInvoiceView({ invoice, onClose }: PrintableInvoiceViewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const seller = invoice.sellerDetails || {
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

  const isInterState = (invoice.igstTotal || 0) > 0;

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
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
              ORIGINAL FOR RECIPIENT
            </span>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">TAX INVOICE</h1>
            <p className="text-[11px] text-zinc-600 font-medium">Issued under Section 31 of the CGST Act, 2017</p>
          </div>
          <div className="text-right">
            <div className="inline-block px-2.5 py-1 rounded bg-zinc-100 border border-zinc-300 font-mono text-xs font-bold text-zinc-800">
              {invoice.status}
            </div>
            <p className="text-[11px] font-mono font-semibold mt-1 text-zinc-700">
              No: <span className="font-bold text-zinc-900">{invoice.invoiceNumber}</span>
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
            <p className="text-zinc-600">
              <span className="font-semibold">Contact:</span> {seller.email} | {seller.phone}
            </p>
          </div>

          <div className="bg-zinc-50/70 p-3 rounded border border-zinc-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Invoice Date:</span>
              <span className="font-semibold">{new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Payment Due Date:</span>
              <span className="font-semibold text-rose-700">{new Date(invoice.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Payment Terms:</span>
              <span className="font-semibold">{invoice.paymentTerms || "NET_30"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Place of Supply:</span>
              <span className="font-semibold">{invoice.placeOfSupply} ({invoice.placeOfSupplyCode || "State"})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-medium">Reverse Charge Applicable:</span>
              <span className="font-semibold">{invoice.reverseCharge ? "YES" : "NO"}</span>
            </div>
          </div>
        </div>

        {/* Billed To vs Shipped To */}
        <div className="grid grid-cols-2 gap-6 py-4 border-b border-zinc-200">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 mb-1">
              Billed To (Customer / Consignee)
            </div>
            <h3 className="font-bold text-zinc-900 text-xs">{invoice.billingAddress.name}</h3>
            <p className="text-zinc-600">
              {invoice.billingAddress.addressLine1}
              {invoice.billingAddress.city ? `, ${invoice.billingAddress.city}` : ""}, {invoice.billingAddress.state} - {invoice.billingAddress.pincode}
            </p>
            <p className="font-mono mt-1 text-zinc-800">
              <span className="font-bold">GSTIN:</span> {invoice.billingAddress.gstin || "URP (Unregistered)"}
            </p>
            <p className="text-zinc-600">
              <span className="font-semibold">State:</span> {invoice.billingAddress.state} (Code: {invoice.billingAddress.stateCode || "--"})
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 mb-1">
              Shipped To (Delivery Destination)
            </div>
            <h3 className="font-bold text-zinc-900 text-xs">{invoice.shippingAddress.name}</h3>
            <p className="text-zinc-600">
              {invoice.shippingAddress.addressLine1}
              {invoice.shippingAddress.city ? `, ${invoice.shippingAddress.city}` : ""}, {invoice.shippingAddress.state} - {invoice.shippingAddress.pincode}
            </p>
            <p className="text-zinc-600 mt-1">
              <span className="font-semibold">Destination State:</span> {invoice.shippingAddress.state} (Code: {invoice.shippingAddress.stateCode || "--"})
            </p>
          </div>
        </div>

        {/* E-Way Bill Banner (if present) */}
        {invoice.ewayBill?.ewayBillNumber && (
          <div className="my-3 p-2.5 bg-blue-50/60 border border-blue-200 rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-800">NIC E-Way Bill Generated:</span>
                <span className="ml-2 font-mono font-bold text-blue-900">{invoice.ewayBill.ewayBillNumber}</span>
              </div>
            </div>
            <div className="text-right text-[11px] text-blue-800">
              <span>Vehicle: <b>{invoice.ewayBill.vehicleNumber || "N/A"}</b></span>
              <span className="mx-2">•</span>
              <span>Valid Upto: <b>{invoice.ewayBill.validUpto ? new Date(invoice.ewayBill.validUpto).toLocaleDateString("en-IN") : "N/A"}</b></span>
            </div>
          </div>
        )}

        {/* Itemized Table */}
        <div className="py-3">
          <table className="w-full border-collapse border border-zinc-300 text-[11px]">
            <thead>
              <tr className="bg-zinc-100 text-zinc-800 text-left font-semibold">
                <th className="p-2 border border-zinc-300 w-8 text-center">#</th>
                <th className="p-2 border border-zinc-300">Description of Goods / SKU</th>
                <th className="p-2 border border-zinc-300 text-center w-16">HSN</th>
                <th className="p-2 border border-zinc-300 text-center w-12">Qty</th>
                <th className="p-2 border border-zinc-300 text-right w-16">Rate (₹)</th>
                <th className="p-2 border border-zinc-300 text-right w-12">Disc%</th>
                <th className="p-2 border border-zinc-300 text-right w-20">Taxable Val</th>
                {isInterState ? (
                  <th className="p-2 border border-zinc-300 text-right w-16">IGST</th>
                ) : (
                  <>
                    <th className="p-2 border border-zinc-300 text-right w-16">CGST</th>
                    <th className="p-2 border border-zinc-300 text-right w-16">SGST</th>
                  </>
                )}
                <th className="p-2 border border-zinc-300 text-right w-20">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={idx} className="border-b border-zinc-200">
                  <td className="p-2 border border-zinc-300 text-center text-zinc-500">{idx + 1}</td>
                  <td className="p-2 border border-zinc-300">
                    <span className="font-semibold text-zinc-900">{item.name}</span>
                    {item.sku && <span className="block text-[10px] text-zinc-500 font-mono">SKU: {item.sku}</span>}
                  </td>
                  <td className="p-2 border border-zinc-300 text-center font-mono text-zinc-700">{item.hsnCode || "--"}</td>
                  <td className="p-2 border border-zinc-300 text-center font-medium">
                    {item.quantity} {item.uom || "PCS"}
                  </td>
                  <td className="p-2 border border-zinc-300 text-right font-mono">{item.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 border border-zinc-300 text-right font-mono text-zinc-600">{item.discountPercent || 0}%</td>
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
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 mb-1">
              Bank Details For Electronic Remittance
            </div>
            <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200 space-y-1 font-mono text-[11px]">
              <div><span className="font-semibold text-zinc-600">Bank Name:</span> {invoice.bankDetails?.bankName || "HDFC Bank"}</div>
              <div><span className="font-semibold text-zinc-600">A/C Number:</span> {invoice.bankDetails?.accountNumber || "50200088991122"}</div>
              <div><span className="font-semibold text-zinc-600">IFSC Code:</span> {invoice.bankDetails?.ifscCode || "HDFC0001234"}</div>
              <div><span className="font-semibold text-zinc-600">UPI VPA:</span> {invoice.bankDetails?.upiId || "acustock@okhdfcbank"}</div>
            </div>

            <div className="mt-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Amount in Words:</span>
              <p className="font-medium italic text-zinc-700 mt-0.5">
                Indian Rupees {Math.round(invoice.grandTotal).toLocaleString("en-IN")} Only
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between py-1 border-b border-zinc-100">
              <span className="text-zinc-600">Taxable Subtotal:</span>
              <span className="font-mono font-semibold">₹{invoice.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {isInterState ? (
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-600">Integrated GST (IGST):</span>
                <span className="font-mono font-semibold">₹{invoice.igstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">Central GST (CGST):</span>
                  <span className="font-mono font-semibold">₹{invoice.cgstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">State GST (SGST):</span>
                  <span className="font-mono font-semibold">₹{invoice.sgstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-1 border-b border-zinc-100">
              <span className="text-zinc-600">Total Tax:</span>
              <span className="font-mono font-semibold">₹{invoice.totalTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {invoice.roundOff !== 0 && (
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-600">Round Off:</span>
                <span className="font-mono font-semibold">₹{invoice.roundOff.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t-2 border-zinc-800 text-sm font-bold text-zinc-900">
              <span>Grand Total:</span>
              <span className="font-mono text-base font-black">₹{invoice.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Paid / Due breakdown */}
            <div className="p-2 bg-zinc-50 rounded border border-zinc-200 mt-2 space-y-1">
              <div className="flex justify-between text-zinc-600">
                <span>Amount Paid:</span>
                <span className="font-mono font-bold text-emerald-700">₹{(invoice.amountPaid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-zinc-900 font-bold">
                <span>Balance Due:</span>
                <span className="font-mono text-rose-700">₹{(invoice.amountDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: Terms & Signature */}
        <div className="grid grid-cols-2 gap-6 pt-4 text-[10px] text-zinc-600">
          <div>
            <h4 className="font-bold text-zinc-800 mb-1">TERMS & CONDITIONS</h4>
            <p className="whitespace-pre-line leading-relaxed">
              {invoice.termsAndConditions ||
                "1. Payment due within agreed credit term.\n2. Overdue interest @ 18% p.a. will be levied on delayed payments.\n3. Goods once sold will only be replaced per company warranty policy.\n4. Subject to local jurisdiction only."}
            </p>
          </div>

          <div className="text-right flex flex-col justify-between items-end">
            <div>
              <p className="font-bold text-zinc-800">For {seller.name}</p>
            </div>
            <div className="mt-8 border-t border-zinc-400 pt-1 w-48 text-center">
              <p className="font-semibold text-zinc-800">Authorized Signatory</p>
              <p className="text-[9px] text-zinc-400">Digitally generated commercial document</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

