"use client";

import React, { useState } from "react";
import {
  FileSpreadsheet,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Scale,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface AccountOption {
  _id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
}

interface JournalLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

interface ManualJournalModalProps {
  accounts: AccountOption[];
  onClose: () => void;
  onSuccess: (entry: any) => void;
}

export function ManualJournalModal({ accounts, onClose, onSuccess }: ManualJournalModalProps) {
  const [entryDate, setEntryDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [memo, setMemo] = useState<string>("");

  const [lines, setLines] = useState<JournalLineItem[]>([
    { accountId: accounts[0]?._id || "", accountCode: accounts[0]?.accountCode || "", accountName: accounts[0]?.accountName || "", debit: 0, credit: 0, description: "" },
    { accountId: accounts[1]?._id || "", accountCode: accounts[1]?.accountCode || "", accountName: accounts[1]?.accountName || "", debit: 0, credit: 0, description: "" },
  ]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAccountChange = (idx: number, accId: string) => {
    const acc = accounts.find((a) => a._id === accId);
    if (!acc) return;
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].accountId = acc._id;
      copy[idx].accountCode = acc.accountCode;
      copy[idx].accountName = acc.accountName;
      return copy;
    });
  };

  const handleDebitChange = (idx: number, val: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].debit = Math.max(0, val);
      if (val > 0) copy[idx].credit = 0; // mutually exclusive per line
      return copy;
    });
  };

  const handleCreditChange = (idx: number, val: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].credit = Math.max(0, val);
      if (val > 0) copy[idx].debit = 0; // mutually exclusive per line
      return copy;
    });
  };

  const handleDescChange = (idx: number, desc: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].description = desc;
      return copy;
    });
  };

  const addLine = () => {
    const firstAcc = accounts[0];
    setLines((prev) => [
      ...prev,
      {
        accountId: firstAcc?._id || "",
        accountCode: firstAcc?.accountCode || "",
        accountName: firstAcc?.accountName || "",
        debit: 0,
        credit: 0,
        description: "",
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalDebits = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredits = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const variance = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;
  const isBalanced = variance < 0.01 && totalDebits > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      setErrorMsg(`Out of balance: Debits (₹${totalDebits}) do not equal Credits (₹${totalCredits})`);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await apiFetch<any>("/gl/journal-entries", {
        method: "POST",
        body: JSON.stringify({
          entryDate,
          referenceNumber,
          memo,
          lines,
        }),
      });

      setIsSubmitting(false);
      if (res?.entry) {
        onSuccess(res.entry);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to post journal entry.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Post Manual Double-Entry Journal</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {errorMsg && (
              <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Date & Ref */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Posting Date *</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Reference / Docket #</label>
                <input
                  type="text"
                  placeholder="e.g. ADJ-BANK-001"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Memo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Journal Memo / Purpose</label>
              <input
                type="text"
                placeholder="e.g. Month-end bank charge reconciliation or depreciation adjustment"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* Multi-Line Journal Grid */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Debits & Credits Breakdown
                </label>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Line
                </button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3 text-left w-1/3">Account</th>
                      <th className="py-2 px-3 text-left">Description</th>
                      <th className="py-2 px-3 text-right w-24">Debit (₹)</th>
                      <th className="py-2 px-3 text-right w-24">Credit (₹)</th>
                      <th className="py-2 px-2 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleAccountChange(idx, e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded border border-input bg-background font-mono"
                          >
                            {accounts.map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.accountCode} — {a.accountName} ({a.accountType})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            placeholder="Line memo..."
                            value={line.description}
                            onChange={(e) => handleDescChange(idx, e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded border border-input bg-background"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={line.debit || ""}
                            onChange={(e) => handleDebitChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-xs text-right font-mono rounded border border-input bg-background"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={line.credit || ""}
                            onChange={(e) => handleCreditChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-xs text-right font-mono rounded border border-input bg-background"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="py-2 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            disabled={lines.length <= 2}
                            className="p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Row */}
                  <tfoot className="bg-muted/40 font-mono font-bold border-t border-border">
                    <tr>
                      <td colSpan={2} className="py-2.5 px-3 text-right text-xs">
                        Totals:
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-primary">
                        ₹{totalDebits.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-primary">
                        ₹{totalCredits.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Invariant Health Indicator */}
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                isBalanced
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium"
              }`}
            >
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {isBalanced
                    ? "Ledger Invariant Verified: Total Debits equal Total Credits."
                    : `Out of Balance: Difference of ₹${variance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                </span>
              </div>
              <span className="font-mono font-bold">
                {isBalanced ? "BALANCED" : "UNBALANCED"}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-card flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted text-foreground transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isBalanced}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Post Journal Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

