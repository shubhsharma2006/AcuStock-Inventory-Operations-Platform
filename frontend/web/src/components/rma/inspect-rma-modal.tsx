"use client";

import React, { useState } from "react";
import { X, CheckCircle2, AlertCircle, RotateCcw, ShieldCheck, Trash2, ArrowUpRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface InspectRmaModalProps {
  rma: any;
  isOpen: boolean;
  onClose: () => void;
  onInspectionCompleted: () => void;
}

export function InspectRmaModal({
  rma,
  isOpen,
  onClose,
  onInspectionCompleted,
}: InspectRmaModalProps) {
  const [dispositions, setDispositions] = useState<
    Array<{
      itemId: string;
      itemIndex: number;
      quantityReceived: number;
      disposition: "RESTOCK" | "SCRAP" | "RETURN_TO_VENDOR";
      dispositionNotes: string;
    }>
  >(() => {
    return (rma?.items || []).map((it: any, idx: number) => ({
      itemId: it._id,
      itemIndex: idx,
      quantityReceived: it.quantityRequested || 1,
      disposition: "RESTOCK",
      dispositionNotes: "",
    }));
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !rma) return null;

  const updateItemDisp = (
    index: number,
    field: "quantityReceived" | "disposition" | "dispositionNotes",
    value: any
  ) => {
    setDispositions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Live estimated credit note amount
  const estimatedCredit = dispositions.reduce((acc, curr, idx) => {
    const item = rma.items[idx];
    const qty = curr.quantityReceived || 0;
    const rate = item?.unitPrice || 0;
    const taxRate = item?.taxRatePercent || 18;
    const taxable = qty * rate;
    const tax = taxable * (taxRate / 100);
    return acc + taxable + tax;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const hasReceived = dispositions.some((d) => d.quantityReceived > 0);
    if (!hasReceived) {
      setErrorMsg("Please record at least 1 unit received to complete inspection.");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiFetch(`/rma/${rma._id}/inspect`, {
        method: "POST",
        body: JSON.stringify({
          itemDispositions: dispositions,
        }),
      });
      setIsSubmitting(false);
      onInspectionCompleted();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to submit dock inspection triage.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="w-full max-w-3xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Dock Receiving & Quality Inspection</h2>
              <p className="text-xs text-muted-foreground">
                RMA <span className="font-mono font-bold text-foreground">{rma.rmaNumber}</span> • Customer: {rma.companyId?.name || "Customer"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Original Invoice:</span>
              <div className="font-mono font-semibold text-foreground">{rma.invoiceId?.invoiceNumber || "--"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Return Reason:</span>
              <div className="font-semibold text-foreground">{rma.reason}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Return Logistics:</span>
              <div className="font-mono font-semibold text-foreground">
                {rma.returnLogistics?.courierName || "Direct / Self"} {rma.returnLogistics?.trackingNumber ? `(${rma.returnLogistics.trackingNumber})` : ""}
              </div>
            </div>
          </div>

          {/* Disposition Line Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Dock Triage & Disposition
              </span>
              <span className="text-[11px] text-muted-foreground">
                Restocked items auto-increment warehouse inventory
              </span>
            </div>

            <div className="space-y-3">
              {(rma.items || []).map((it: any, idx: number) => {
                const disp = dispositions[idx] || {
                  quantityReceived: it.quantityRequested,
                  disposition: "RESTOCK",
                  dispositionNotes: "",
                };

                return (
                  <div key={it._id || idx} className="p-3.5 border border-border rounded-lg bg-card space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-xs text-foreground">{it.name}</span>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          SKU: {it.sku || "--"} • Requested: {it.quantityRequested} units @ ₹{it.unitPrice.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-semibold text-foreground">
                        Line Value: ₹{(it.quantityRequested * it.unitPrice).toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-border/60">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground mb-1">
                          Actual Qty Received
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={it.quantityRequested}
                          value={disp.quantityReceived}
                          onChange={(e) =>
                            updateItemDisp(
                              idx,
                              "quantityReceived",
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded font-mono"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-foreground mb-1">
                          Inspection Disposition
                        </label>
                        <select
                          value={disp.disposition}
                          onChange={(e) =>
                            updateItemDisp(idx, "disposition", e.target.value as any)
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded"
                        >
                          <option value="RESTOCK">Restock into Inventory (Grade A)</option>
                          <option value="SCRAP">Scrap / Write-off Loss (Damaged)</option>
                          <option value="RETURN_TO_VENDOR">Return to Vendor (Supplier Defect)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-foreground mb-1">
                          Inspection Notes
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Unopened box, verified OK"
                          value={disp.dispositionNotes}
                          onChange={(e) =>
                            updateItemDisp(idx, "dispositionNotes", e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-background border border-input rounded"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Credit Note Summary Preview */}
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex justify-between items-center text-xs">
            <div>
              <span className="font-bold text-rose-800 dark:text-rose-400">
                Statutory GST Credit Note (CRN-YYYY-XXXX)
              </span>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80">
                Will automatically issue and deduct from customer outstanding AR balance
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-rose-800/80 dark:text-rose-400/80 font-bold">Estimated Credit Total</span>
              <div className="font-mono font-bold text-base text-rose-800 dark:text-rose-400">
                ₹{Math.round(estimatedCredit).toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Processing Disposition & Credit Note...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Inspection & Issue Credit Note</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

