"use client";

import React, { useState } from "react";
import { X, DollarSign, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface RecordPaymentModalProps {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amountDue: number;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export function RecordPaymentModal({
  invoiceId,
  invoiceNumber,
  customerName,
  amountDue,
  isOpen,
  onClose,
  onPaymentSuccess,
}: RecordPaymentModalProps) {
  const [amount, setAmount] = useState<number>(amountDue);
  const [paymentMode, setPaymentMode] = useState<string>("UPI");
  const [transactionReference, setTransactionReference] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (amount <= 0) {
      setErrorMsg("Payment amount must be greater than zero.");
      return;
    }
    if (amount > amountDue) {
      setErrorMsg(`Payment amount cannot exceed the balance due (₹${amountDue.toLocaleString("en-IN")}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      await apiFetch(`/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentMode,
          transactionReference,
          paymentDate,
          notes,
        }),
      });
      setIsSubmitting(false);
      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to record payment. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="w-full max-w-lg bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Record Customer Collection</h2>
              <p className="text-xs text-muted-foreground">
                Invoice <span className="font-mono font-medium text-foreground">{invoiceNumber}</span> • {customerName}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount Due banner */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Outstanding Balance Due:</span>
            <span className="font-mono font-bold text-base text-rose-600 dark:text-rose-400">
              ₹{amountDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Payment Amount Received (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₹</span>
              <input
                type="number"
                step="0.01"
                min="1"
                max={amountDue}
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                required
              />
            </div>
            <div className="flex gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setAmount(amountDue)}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Pay Full (₹{amountDue.toLocaleString("en-IN")})
              </button>
              <span className="text-muted-foreground text-[11px]">•</span>
              <button
                type="button"
                onClick={() => setAmount(Math.round(amountDue / 2))}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                50% (₹{Math.round(amountDue / 2).toLocaleString("en-IN")})
              </button>
            </div>
          </div>

          {/* Payment Mode & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Payment Channel *
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="NEFT_RTGS">NEFT / RTGS / IMPS</option>
                <option value="BANK_TRANSFER">Direct Net Banking</option>
                <option value="CHEQUE">Cheque / Demand Draft</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="CASH">Cash Collection</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Collection Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* UTR / Reference */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              UTR / Bank Ref / Cheque Number
            </label>
            <input
              type="text"
              placeholder="e.g. UTR-AXIS-9922001 or CHQ-00129"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
          </div>

          {/* Internal Notes */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Receipt Remarks (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Received via Axis Bank current account"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
                <span>Recording...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Receipt & Update AR</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

