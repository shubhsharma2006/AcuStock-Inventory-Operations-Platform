"use client";

import React, { useState } from "react";
import {
  Layers,
  X,
  Sparkles,
  AlertCircle,
  Truck,
  RefreshCw,
  Package,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface GenerateWaveModalProps {
  onClose: () => void;
  onSuccess: (wave: any) => void;
}

export function GenerateWaveModal({ onClose, onSuccess }: GenerateWaveModalProps) {
  const [maxOrders, setMaxOrders] = useState<number>(12);
  const [waveType, setWaveType] = useState<string>("BATCH");
  const [criteria, setCriteria] = useState<string>("ALL");
  const [carrier, setCarrier] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await apiFetch<any>("/picking-waves/generate", {
        method: "POST",
        body: JSON.stringify({
          maxOrders,
          waveType,
          criteria,
          carrier: carrier === "ALL" ? "" : carrier,
          notes,
        }),
      });

      setIsSubmitting(false);
      if (res?.wave) {
        onSuccess(res.wave);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to generate picking wave.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Auto-Generate Picking Wave</h3>
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

          {/* Max Orders */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-medium text-foreground">Orders per Batch</label>
              <span className="font-mono text-primary font-bold">{maxOrders} orders</span>
            </div>
            <input
              type="range"
              min={2}
              max={24}
              value={maxOrders}
              onChange={(e) => setMaxOrders(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
            <span className="text-[11px] text-muted-foreground block">
              Batches up to 24 orders can be sorted simultaneously on standard Put-Walls.
            </span>
          </div>

          {/* Wave Strategy */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Wave Type</label>
              <select
                value={waveType}
                onChange={(e) => setWaveType(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="BATCH">Batch Picking (Totes $\rightarrow$ Put-Wall)</option>
                <option value="CLUSTER">Cluster Picking (Direct Cart Bins)</option>
                <option value="ZONE">Zone Pick (Partitioned Aisle)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Order Profile</label>
              <select
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="ALL">All Eligible Orders</option>
                <option value="SINGLE_ITEM_ONLY">Single-Line Fast Track</option>
                <option value="MULTI_ITEM_ONLY">Multi-Line Put-Wall Only</option>
              </select>
            </div>
          </div>

          {/* Carrier Dispatch Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-muted-foreground" />
              Carrier SLA Cutoff Filter (Optional)
            </label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">-- Any Carrier --</option>
              <option value="Delhivery">Delhivery (Express SLA)</option>
              <option value="Shiprocket">Shiprocket (Multi-Courier)</option>
              <option value="Porter">Porter (Local Intra-City)</option>
              <option value="Blue Dart">Blue Dart (Priority Air)</option>
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Wave Notes / Instructions</label>
            <input
              type="text"
              placeholder="e.g. Afternoon priority dispatch wave for Delhivery pickup."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Cluster & Generate Wave
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

