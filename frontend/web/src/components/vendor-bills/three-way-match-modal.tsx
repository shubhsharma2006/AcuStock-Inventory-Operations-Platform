"use client";

import React, { useState } from "react";
import { X, CheckCircle2, AlertTriangle, Scale, ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ThreeWayMatchModalProps {
  bill: any;
  isOpen: boolean;
  onClose: () => void;
  onMatchUpdated: () => void;
}

export function ThreeWayMatchModal({
  bill,
  isOpen,
  onClose,
  onMatchUpdated,
}: ThreeWayMatchModalProps) {
  const [overrideNotes, setOverrideNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !bill) return null;

  const po = bill.purchaseOrderId || {};
  const matching = bill.matchingEngine || {};
  const isApproved = matching.approvedForPayment;

  const handleOverride = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await apiFetch(`/vendor-bills/${bill._id}/override`, {
        method: "POST",
        body: JSON.stringify({
          approvalNotes: overrideNotes || "Manager reviewed and authorized variance payout",
        }),
      });
      setIsSubmitting(false);
      onMatchUpdated();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to override variance approval");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="w-full max-w-3xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                isApproved
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">
                3-Way Match Verification Analysis
              </h2>
              <p className="text-xs text-muted-foreground">
                Reconciliation: PO <span className="font-mono font-bold text-foreground">{po.poNumber || "N/A"}</span> vs Vendor Bill <span className="font-mono font-bold text-foreground">{bill.billNumber}</span>
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

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Match Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              matching.status === "PERFECT_MATCH"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                : matching.status === "OVERRIDDEN"
                ? "bg-blue-500/10 border-blue-500/20 text-blue-800 dark:text-blue-300"
                : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {matching.status === "PERFECT_MATCH" || matching.status === "OVERRIDDEN" ? (
                <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              )}
              <div>
                <span className="font-bold text-sm block">
                  3-Way Match Status: {matching.status}
                </span>
                <span className="text-xs opacity-90">
                  {matching.status === "PERFECT_MATCH"
                    ? "Quantities received and billed unit rates align 100% with the approved purchase order."
                    : matching.status === "OVERRIDDEN"
                    ? `Manager override approved by ${matching.approvedBy?.name || "Manager"} (${matching.approvalNotes || "Authorized"})`
                    : "Variance detected between approved PO terms and billed charges. Payment blocked until review."}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold tracking-wider block opacity-80">
                Payment Gate
              </span>
              <span
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full ${
                  isApproved
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-600 text-white"
                }`}
              >
                {isApproved ? "AUTHORIZED" : "LOCKED"}
              </span>
            </div>
          </div>

          {/* Line-Item Comparison Table */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
              Line-Item Reconciliation
            </span>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border font-semibold text-muted-foreground">
                    <th className="p-3">Product Description</th>
                    <th className="p-3 text-center">PO Approved Qty</th>
                    <th className="p-3 text-center">Billed Qty</th>
                    <th className="p-3 text-right">PO Rate (₹)</th>
                    <th className="p-3 text-right">Billed Rate (₹)</th>
                    <th className="p-3 text-center">Variance Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(bill.items || []).map((bItem: any, idx: number) => {
                    const poItem = (po.items || []).find(
                      (p: any) =>
                        p.productId === bItem.productId || p.name === bItem.name
                    );
                    const poQty = poItem?.quantity || "--";
                    const poRate = poItem?.unitPrice || 0;
                    const isQtyDiff = typeof poQty === "number" && bItem.quantityBilled > poQty;
                    const isRateDiff = bItem.unitPriceBilled > poRate;

                    return (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="p-3">
                          <span className="font-semibold text-foreground">{bItem.name}</span>
                          <span className="block text-[10px] text-muted-foreground font-mono">
                            SKU: {bItem.sku || "--"}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono text-muted-foreground">{poQty}</td>
                        <td className={`p-3 text-center font-mono font-semibold ${isQtyDiff ? "text-amber-600 font-bold" : "text-foreground"}`}>
                          {bItem.quantityBilled}
                        </td>
                        <td className="p-3 text-right font-mono text-muted-foreground">
                          {poRate ? `₹${poRate.toLocaleString("en-IN")}` : "--"}
                        </td>
                        <td className={`p-3 text-right font-mono font-semibold ${isRateDiff ? "text-amber-600 font-bold" : "text-foreground"}`}>
                          ₹{bItem.unitPriceBilled.toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-center">
                          {isQtyDiff && isRateDiff ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600">
                              Qty + Rate ▲
                            </span>
                          ) : isQtyDiff ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600">
                              Over-Qty (+{bItem.quantityBilled - Number(poQty)})
                            </span>
                          ) : isRateDiff ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600">
                              Rate ▲ (+₹{bItem.unitPriceBilled - poRate})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                              Match ✓
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manager Override Form (if variance is flagged) */}
          {!isApproved && (
            <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-3">
              <span className="text-xs font-bold text-foreground block">
                Manager Authorization & Variance Override
              </span>
              <p className="text-xs text-muted-foreground">
                Authorize payment disbursement by recording an audit justification (e.g. approved index price adjustment, freight allowance).
              </p>
              <textarea
                rows={2}
                placeholder="Reason for overriding variance and approving payout..."
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleOverride}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Authorize Payout & Unlock Payment</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

