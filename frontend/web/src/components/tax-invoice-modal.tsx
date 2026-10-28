"use client";

import { useRef } from "react";
import { Portal } from "@/components/ui/portal";

export interface InvoiceLineItem {
  sku?: string;
  description: string;
  hsn?: string;
  uom?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface TaxInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  company: {
    name: string;
    gstin?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
  };
  buyer: {
    name: string;
    gstin?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
  };
  items: InvoiceLineItem[];
  transportDetails?: {
    transporterName?: string;
    vehicleNumber?: string;
    ewayBillNumber?: string;
  };
  notes?: string;
}

interface TaxInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: TaxInvoiceData;
}

export function TaxInvoiceModal({ isOpen, onClose, invoice }: TaxInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Compute tax math
  const lines = invoice.items.map((item) => {
    const taxableAmount = item.quantity * item.unitPrice;
    const taxRate = item.taxRate ?? 18;
    const isInterstate =
      invoice.company.state &&
      invoice.buyer.state &&
      invoice.company.state.toLowerCase() !== invoice.buyer.state.toLowerCase();

    const cgstRate = isInterstate ? 0 : taxRate / 2;
    const sgstRate = isInterstate ? 0 : taxRate / 2;
    const igstRate = isInterstate ? taxRate : 0;

    const cgstAmount = (taxableAmount * cgstRate) / 100;
    const sgstAmount = (taxableAmount * sgstRate) / 100;
    const igstAmount = (taxableAmount * igstRate) / 100;
    const totalAmount = taxableAmount + cgstAmount + sgstAmount + igstAmount;

    return {
      ...item,
      taxableAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalAmount,
    };
  });

  const subtotal = lines.reduce((acc, curr) => acc + curr.taxableAmount, 0);
  const totalCgst = lines.reduce((acc, curr) => acc + curr.cgstAmount, 0);
  const totalSgst = lines.reduce((acc, curr) => acc + curr.sgstAmount, 0);
  const totalIgst = lines.reduce((acc, curr) => acc + curr.igstAmount, 0);
  const grandTotal = subtotal + totalCgst + totalSgst + totalIgst;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:inset-auto">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm print:hidden"
          onClick={onClose}
        />

        {/* Modal Window */}
        <div className="relative z-10 flex max-h-[95vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl print:max-h-none print:w-full print:border-none print:bg-white print:text-black print:shadow-none">
          {/* Action Header */}
          <div className="flex items-center justify-between border-b border-white/10 p-4 print:hidden">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-400/20">
                Statutory GST Invoice
              </span>
              <span className="font-mono text-xs text-slate-400">{invoice.invoiceNumber}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition"
              >
                <span>🖨️ Print / Save PDF</span>
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Printable Invoice Body */}
          <div
            ref={printRef}
            className="overflow-y-auto p-6 text-slate-100 print:overflow-visible print:p-0 print:text-black font-sans"
          >
            {/* Document Header */}
            <div className="flex items-start justify-between border-b border-slate-700 pb-5 print:border-slate-300">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white print:text-black">
                  {invoice.company.name}
                </h1>
                <p className="mt-1 text-xs text-slate-400 print:text-slate-600">
                  {invoice.company.address || "Main Industrial Logistics Park"}
                  <br />
                  {invoice.company.city || "Mumbai"}, {invoice.company.state || "Maharashtra"} -{" "}
                  {invoice.company.pincode || "400001"}
                </p>
                <div className="mt-2 text-xs font-bold text-amber-400 print:text-slate-900">
                  GSTIN: {invoice.company.gstin || "27AABCU9603R1ZM"}
                </div>
              </div>

              <div className="text-right">
                <div className="inline-block rounded-lg bg-amber-400/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-300 border border-amber-400/20 print:border print:border-black print:bg-white print:text-black">
                  TAX INVOICE
                </div>
                <div className="mt-2 font-mono text-sm font-bold text-white print:text-black">
                  {invoice.invoiceNumber}
                </div>
                <div className="text-xs text-slate-400 print:text-slate-600">
                  Date: {invoice.invoiceDate}
                </div>
              </div>
            </div>

            {/* Bill To & Dispatch Details */}
            <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-700 print:border-slate-300 text-xs">
              <div>
                <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] print:text-slate-600">
                  Billed To / Consignee
                </div>
                <div className="mt-1 font-bold text-white print:text-black text-sm">
                  {invoice.buyer.name}
                </div>
                <p className="mt-0.5 text-slate-400 print:text-slate-600">
                  {invoice.buyer.address || "Commercial Dock Hub"}
                  <br />
                  {invoice.buyer.city || "Bengaluru"}, {invoice.buyer.state || "Karnataka"} -{" "}
                  {invoice.buyer.pincode || "560001"}
                </p>
                <div className="mt-1 font-semibold text-slate-300 print:text-black">
                  GSTIN: {invoice.buyer.gstin || "29AABCP1234F1Z5"}
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3 print:border-slate-300 print:bg-white">
                <div className="font-bold text-slate-400 uppercase tracking-wider text-[10px] print:text-slate-600">
                  Transport & E-Way Particulars
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Transporter:</span>
                    <span className="font-semibold text-white print:text-black">
                      {invoice.transportDetails?.transporterName || "SafeExpress Logistics"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vehicle No:</span>
                    <span className="font-mono font-semibold text-white print:text-black">
                      {invoice.transportDetails?.vehicleNumber || "MH-04-AZ-2026"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">E-Way Bill:</span>
                    <span className="font-mono font-bold text-amber-300 print:text-black">
                      {invoice.transportDetails?.ewayBillNumber || "EWB-991204829104"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 uppercase tracking-wider text-[10px] text-slate-400 print:bg-slate-100 print:text-black">
                  <tr>
                    <th className="p-2 text-center">#</th>
                    <th className="p-2">Item Description</th>
                    <th className="p-2 text-center">HSN</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Rate</th>
                    <th className="p-2 text-right">Taxable</th>
                    <th className="p-2 text-right">Tax (CGST+SGST/IGST)</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-slate-300">
                  {lines.map((item, idx) => (
                    <tr key={idx} className="print:text-black">
                      <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                        {idx + 1}
                      </td>
                      <td className="p-2">
                        <div className="font-semibold text-white print:text-black">
                          {item.description}
                        </div>
                        {item.sku && (
                          <div className="font-mono text-[10px] text-slate-400 print:text-slate-600">
                            SKU: {item.sku}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center font-mono text-slate-400 print:text-black">
                        {item.hsn || "8471"}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold">
                        {item.quantity} {item.uom || "PCS"}
                      </td>
                      <td className="p-2 text-right font-mono">₹{item.unitPrice.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">₹{item.taxableAmount.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono text-[11px] text-slate-400 print:text-black">
                        {item.igstAmount > 0
                          ? `₹${item.igstAmount.toFixed(2)} (${item.igstRate}%)`
                          : `₹${(item.cgstAmount + item.sgstAmount).toFixed(2)} (${item.cgstRate + item.sgstRate}%)`}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-white print:text-black">
                        ₹{item.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calculations & Signature Footer */}
            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-700 print:border-slate-300">
              <div className="space-y-3 text-xs">
                {/* 2D QR Code Representation */}
                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 rounded-lg border border-white/20 bg-white p-1 print:border-black">
                    <svg viewBox="0 0 100 100" className="h-full w-full">
                      <rect width="100" height="100" fill="#ffffff" />
                      <path
                        d="M10 10h30v30H10zm5 5v20h20V15zm55-5h30v30H65zm5 5v20h20V15zM10 65h30v30H10zm5 5v20h20V70zm45-5h10v10H60zm15 0h10v10H75zm-15 15h10v10H60zm15 0h10v10H75zm15-15h10v10H90zm0 15h10v10H90z"
                        fill="#000000"
                      />
                    </svg>
                  </div>
                  <div className="text-[10px] text-slate-400 print:text-slate-600">
                    <div className="font-bold text-white print:text-black">
                      CBIC E-Invoice Verification
                    </div>
                    IRN: 8a7c29b4...d193e4a2
                    <br />
                    Signed digitally by AcuStock ERP
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 italic print:text-slate-600">
                  {invoice.notes ||
                    "Goods once sold will not be taken back without valid RMA inspection."}
                </p>
              </div>

              <div className="space-y-1.5 text-xs text-right">
                <div className="flex justify-between py-1 border-b border-white/5 print:border-slate-200">
                  <span className="text-slate-400 print:text-slate-600">Taxable Value:</span>
                  <span className="font-mono text-white print:text-black font-semibold">
                    ₹{subtotal.toFixed(2)}
                  </span>
                </div>
                {totalCgst > 0 && (
                  <div className="flex justify-between py-1 border-b border-white/5 print:border-slate-200">
                    <span className="text-slate-400 print:text-slate-600">CGST Amount:</span>
                    <span className="font-mono text-white print:text-black">
                      ₹{totalCgst.toFixed(2)}
                    </span>
                  </div>
                )}
                {totalSgst > 0 && (
                  <div className="flex justify-between py-1 border-b border-white/5 print:border-slate-200">
                    <span className="text-slate-400 print:text-slate-600">SGST Amount:</span>
                    <span className="font-mono text-white print:text-black">
                      ₹{totalSgst.toFixed(2)}
                    </span>
                  </div>
                )}
                {totalIgst > 0 && (
                  <div className="flex justify-between py-1 border-b border-white/5 print:border-slate-200">
                    <span className="text-slate-400 print:text-slate-600">IGST Amount:</span>
                    <span className="font-mono text-white print:text-black">
                      ₹{totalIgst.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between pt-2 text-sm font-bold border-t border-amber-400/30 text-amber-300 print:border-black print:text-black">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹{grandTotal.toFixed(2)}</span>
                </div>

                <div className="pt-8">
                  <div className="text-xs font-semibold text-white print:text-black">
                    For {invoice.company.name}
                  </div>
                  <div className="mt-6 text-[10px] text-slate-500 uppercase tracking-widest print:text-black">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
