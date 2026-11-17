"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface QuotationModalProps {
  dealId: string;
  isOpen: boolean;
  onClose: () => void;
  onQuoteGenerated?: () => void;
  onConvertToSO?: () => void;
}

export function QuotationModal({
  dealId,
  isOpen,
  onClose,
  onQuoteGenerated,
  onConvertToSO
}: QuotationModalProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<any>(null);

  // Configuration options
  const [validityDays, setValidityDays] = useState(7);
  const [paymentTerms, setPaymentTerms] = useState("NET_30");
  const [softReserve, setSoftReserve] = useState(true);

  useEffect(() => {
    if (!isOpen || !dealId) return;
    loadQuotePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, dealId]);

  async function loadQuotePreview() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<any>(`/crm/deals/${dealId}/quote-preview`);
      if (res?.success && res.quotation) {
        setQuoteData(res.quotation);
        if (res.quotation.paymentTerms) setPaymentTerms(res.quotation.paymentTerms);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load quotation details");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateFormalQuote() {
    try {
      setGenerating(true);
      setError(null);
      const res = await apiFetch<any>(`/crm/deals/${dealId}/generate-quote`, {
        method: "POST",
        body: JSON.stringify({
          validityDays,
          paymentTerms,
          softReserveDays: softReserve ? validityDays : 0
        })
      });

      if (res?.success) {
        await loadQuotePreview();
        if (onQuoteGenerated) onQuoteGenerated();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to generate formal quote");
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleShareWhatsApp() {
    if (!quoteData) return;
    const phone = quoteData.buyer?.phone?.replace(/[^0-9]/g, "") || "";
    const itemsList = quoteData.items
      ?.map((it: any) => `• ${it.name} (${it.quantity} ${it.uom}) — ₹${it.lineTotal?.toLocaleString()}`)
      .join("%0A");

    const message = `*Formal Quotation: ${quoteData.quoteNumber}*%0A` +
      `*Seller:* ${quoteData.seller?.name}%0A` +
      `*Client:* ${quoteData.buyer?.name}%0A` +
      `*Date:* ${new Date(quoteData.date).toLocaleDateString()}%0A` +
      `*Valid Until:* ${new Date(quoteData.expiresAt).toLocaleDateString()}%0A%0A` +
      `*Items:*%0A${itemsList}%0A%0A` +
      `*Taxable Amount:* ₹${quoteData.taxBreakdown?.taxableAmount?.toLocaleString()}%0A` +
      `*GST (${quoteData.taxBreakdown?.isInterState ? "IGST" : "CGST+SGST"}):* ₹${quoteData.taxBreakdown?.totalTax?.toLocaleString()}%0A` +
      `*Grand Total:* ₹${quoteData.taxBreakdown?.grandTotal?.toLocaleString()}%0A` +
      `*Payment Terms:* ${quoteData.paymentTerms}%0A%0A` +
      `Please reply with your approval to proceed with WMS order fulfillment.`;

    const url = phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
    window.open(url, "_blank");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl p-6 text-white my-8">
        
        {/* Header Actions */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <div>
              <h2 className="text-lg font-bold">Formal Commercial Quotation</h2>
              <div className="text-xs text-slate-400">
                AcuStock Quote-to-Cash Engine · GST-Compliant Proforma Document
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 transition"
              title="Print or Save as PDF"
            >
              <span>🖨️</span> Print / PDF
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-400 transition"
              title="Share Quote on WhatsApp"
            >
              <span>💬</span> WhatsApp
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Loading commercial quotation data...
          </div>
        ) : !quoteData ? (
          <div className="p-8 text-center text-slate-400">No quotation found.</div>
        ) : (
          <div className="mt-6 space-y-6">
            
            {/* Quick Generator Toolbar (if quote is still draft) */}
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/60 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Validity Period</label>
                  <select
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                  >
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (Standard)</option>
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                  >
                    <option value="ADVANCE">100% Advance</option>
                    <option value="NET_15">Net 15 Days</option>
                    <option value="NET_30">Net 30 Days (Standard)</option>
                    <option value="NET_60">Net 60 Days</option>
                    <option value="COD">Cash on Delivery (COD)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="softReserveCheckbox"
                    checked={softReserve}
                    onChange={(e) => setSoftReserve(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="softReserveCheckbox" className="text-xs text-slate-300 cursor-pointer">
                    Place 7-day Soft Stock Hold 🔒
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateFormalQuote}
                disabled={generating}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {generating ? "Generating..." : quoteData.quoteNumber?.startsWith("QT-") ? "Regenerate / Refresh Quote" : "Generate Formal Quote (QT-XXXX)"}
              </button>
            </div>

            {/* Printable Quotation Sheet */}
            <div id="printable-quotation" className="p-6 rounded-2xl border border-white/10 bg-white text-slate-900 shadow-sm space-y-6">
              
              {/* Top Seller & Buyer Bar */}
              <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-slate-200">
                <div>
                  <div className="text-xl font-bold text-slate-900">{quoteData.seller?.name}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    GSTIN: <span className="font-mono font-bold text-slate-800">{quoteData.seller?.taxId}</span>
                  </div>
                  <div className="text-xs text-slate-600">{quoteData.seller?.address?.street}, {quoteData.seller?.address?.city}, {quoteData.seller?.address?.state} - {quoteData.seller?.address?.zipCode}</div>
                  <div className="text-xs text-slate-600">{quoteData.seller?.email} · {quoteData.seller?.phone}</div>
                </div>

                <div className="sm:text-right">
                  <span className="inline-block px-2.5 py-1 rounded bg-amber-100 text-amber-800 font-mono font-bold text-xs">
                    {quoteData.quoteNumber}
                  </span>
                  <div className="text-xs text-slate-600 mt-2">
                    Date: <span className="font-medium text-slate-800">{new Date(quoteData.date).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Valid Until: <span className="font-bold text-rose-600">{new Date(quoteData.expiresAt).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Terms: <span className="font-semibold text-slate-800">{quoteData.paymentTerms}</span>
                  </div>
                </div>
              </div>

              {/* Bill To Customer Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Bill To (Buyer)</div>
                  <div className="font-bold text-sm text-slate-900">{quoteData.buyer?.name}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    GSTIN: <span className="font-mono font-semibold">{quoteData.buyer?.taxId}</span>
                  </div>
                  <div className="text-xs text-slate-600">{quoteData.buyer?.address?.street}, {quoteData.buyer?.address?.city}, {quoteData.buyer?.address?.state}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Attention & Contact</div>
                  <div className="font-semibold text-sm text-slate-900">{quoteData.buyer?.contactPerson || "Procurement Officer"}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{quoteData.buyer?.email || "—"}</div>
                  <div className="text-xs text-slate-600">{quoteData.buyer?.phone || "—"}</div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-100 text-[11px] font-bold uppercase text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Item & SKU</th>
                      <th className="px-3 py-2.5">HSN</th>
                      <th className="px-3 py-2.5 text-right">Qty</th>
                      <th className="px-3 py-2.5 text-right">Unit Rate</th>
                      <th className="px-3 py-2.5 text-right">GST %</th>
                      <th className="px-3 py-2.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {quoteData.items?.map((it: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">{it.name}</div>
                          <div className="font-mono text-[10px] text-slate-500">{it.sku}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{it.hsn || "8471"}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{it.quantity} {it.uom}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">₹{it.unitPrice?.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">{it.taxRatePercent}%</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">₹{it.lineTotal?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation & GST Summary */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
                <div className="text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Declaration & Terms:</div>
                  <div>• Goods once sold are backed by standard 12-month manufacturer warranty.</div>
                  <div>• Quoted prices are valid strictly until the expiration date mentioned above.</div>
                  {quoteData.softHold?.active && (
                    <div className="text-sky-700 font-semibold">
                      🔒 Inventory soft hold active for this quotation until {new Date(quoteData.softHold.expiresAt).toLocaleDateString()}.
                    </div>
                  )}
                </div>

                <div className="w-full sm:w-72 space-y-2 text-xs border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Value:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ₹{quoteData.taxBreakdown?.taxableAmount?.toLocaleString()}
                    </span>
                  </div>

                  {quoteData.taxBreakdown?.isInterState ? (
                    <div className="flex justify-between text-slate-600">
                      <span>IGST (Inter-State):</span>
                      <span className="font-mono font-semibold text-slate-800">
                        ₹{quoteData.taxBreakdown?.igst?.toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>CGST (Intra-State):</span>
                        <span className="font-mono font-semibold text-slate-800">
                          ₹{quoteData.taxBreakdown?.cgst?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>SGST (Intra-State):</span>
                        <span className="font-mono font-semibold text-slate-800">
                          ₹{quoteData.taxBreakdown?.sgst?.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-sm text-slate-900">
                    <span>Grand Total:</span>
                    <span className="font-mono text-emerald-700">
                      ₹{quoteData.taxBreakdown?.grandTotal?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-400">
                Ready to fulfill? Converting to Sales Order queues the pick list in WMS.
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs text-slate-300 transition"
                >
                  Close
                </button>
                {onConvertToSO && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onConvertToSO();
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition"
                  >
                    1-Click Convert to Sales Order →
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
