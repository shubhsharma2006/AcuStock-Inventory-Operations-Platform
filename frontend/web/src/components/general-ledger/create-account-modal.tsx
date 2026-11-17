"use client";

import React, { useState } from "react";
import {
  Landmark,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CreateAccountModalProps {
  onClose: () => void;
  onSuccess: (acc: any) => void;
}

export function CreateAccountModal({ onClose, onSuccess }: CreateAccountModalProps) {
  const [accountCode, setAccountCode] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  const [accountType, setAccountType] = useState<string>("EXPENSE");
  const [subType, setSubType] = useState<string>("OPERATING_EXPENSE");
  const [normalBalance, setNormalBalance] = useState<string>("DEBIT");
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTypeChange = (type: string) => {
    setAccountType(type);
    if (type === "ASSET" || type === "EXPENSE") {
      setNormalBalance("DEBIT");
    } else {
      setNormalBalance("CREDIT");
    }
    if (type === "ASSET") setSubType("CURRENT_ASSET");
    else if (type === "LIABILITY") setSubType("CURRENT_LIABILITY");
    else if (type === "EQUITY") setSubType("EQUITY");
    else if (type === "REVENUE") setSubType("OPERATING_REVENUE");
    else setSubType("OPERATING_EXPENSE");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountCode.trim() || !accountName.trim()) {
      setErrorMsg("Account code and account name are required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await apiFetch<any>("/gl/accounts", {
        method: "POST",
        body: JSON.stringify({
          accountCode: accountCode.trim(),
          accountName: accountName.trim(),
          accountType,
          subType,
          normalBalance,
          description: description.trim(),
        }),
      });

      setIsSubmitting(false);
      if (res?.account) {
        onSuccess(res.account);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to create account.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Create Ledger Account</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Account Code & Name */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Account Code *</label>
              <input
                type="text"
                required
                placeholder="e.g. 5400"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-foreground">Account Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Warehouse Consumables"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Account Type & Normal Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Category Class</label>
              <select
                value={accountType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="ASSET">ASSET (1000s)</option>
                <option value="LIABILITY">LIABILITY (2000s)</option>
                <option value="EQUITY">EQUITY (3000s)</option>
                <option value="REVENUE">REVENUE (4000s)</option>
                <option value="EXPENSE">EXPENSE (5000s)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Normal Balance</label>
              <select
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="DEBIT">DEBIT (Dr)</option>
                <option value="CREDIT">CREDIT (Cr)</option>
              </select>
            </div>
          </div>

          {/* Sub Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Sub-Classification</label>
            <input
              type="text"
              placeholder="e.g. OPERATING_EXPENSE, BANK, CURRENT_ASSET"
              value={subType}
              onChange={(e) => setSubType(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description / Notes</label>
            <textarea
              rows={2}
              placeholder="Optional description of transactions routed to this account..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted text-foreground transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

