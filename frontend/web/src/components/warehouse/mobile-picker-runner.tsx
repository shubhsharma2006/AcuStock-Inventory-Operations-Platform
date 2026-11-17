"use client";

import React, { useState, useEffect } from "react";
import {
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  RefreshCw,
  ArrowRight,
  Check,
  MapPin,
  Barcode,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface PickItem {
  _id: string;
  sku: string;
  name: string;
  barcode?: string;
  binCode: string;
  requiredQty: number;
  pickedQty: number;
  sequenceOrder: number;
  status: string;
  toteBarcode?: string;
}

interface MobilePickerRunnerProps {
  waveId: string;
  waveNumber: string;
  onClose: () => void;
  onWaveComplete: () => void;
}

export function MobilePickerRunner({
  waveId,
  waveNumber,
  onClose,
  onWaveComplete,
}: MobilePickerRunnerProps) {
  const [pickItems, setPickItems] = useState<PickItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Scanner inputs
  const [scannedBin, setScannedBin] = useState<string>("");
  const [scannedSku, setScannedSku] = useState<string>("");
  const [toteBarcode, setToteBarcode] = useState<string>("TOTE-01");
  const [isSubmittingPick, setIsSubmittingPick] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Short pick exception modal
  const [showShortPick, setShowShortPick] = useState<boolean>(false);
  const [shortPickReason, setShortPickReason] = useState<string>("Insufficient shelf stock");
  const [shortPickQty, setShortPickQty] = useState<number>(0);

  const fetchWaveItems = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<any>(`/picking-waves/${waveId}`);
      if (res?.wave?.pickItems) {
        setPickItems(res.wave.pickItems);
        // Find first pending item
        const firstPending = res.wave.pickItems.findIndex(
          (p: PickItem) => p.status === "PENDING" || p.status === "IN_PROGRESS"
        );
        if (firstPending >= 0) {
          setCurrentIndex(firstPending);
        }
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load wave pick items:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWaveItems();
  }, [waveId]);

  const currentItem = pickItems[currentIndex];
  const totalStops = pickItems.length;
  const completedStops = pickItems.filter(
    (p) => p.status === "PICKED" || p.status === "SHORT_PICKED"
  ).length;

  const handleConfirmPick = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentItem) return;

    try {
      setIsSubmittingPick(true);
      setFeedbackMsg(null);

      const res = await apiFetch<any>(`/picking-waves/${waveId}/pick-item`, {
        method: "POST",
        body: JSON.stringify({
          pickItemId: currentItem._id,
          scannedBin: scannedBin.trim(),
          scannedSku: scannedSku.trim() || currentItem.sku,
          pickedQty: currentItem.requiredQty,
          toteBarcode: toteBarcode.trim() || "TOTE-01",
        }),
      });

      setIsSubmittingPick(false);
      setScannedBin("");
      setScannedSku("");

      if (res.success) {
        setFeedbackMsg({
          text: `Success: ${currentItem.requiredQty}x ${currentItem.sku} placed in ${toteBarcode}`,
          isError: false,
        });

        // Update local item
        setPickItems((prev) => {
          const copy = [...prev];
          copy[currentIndex] = { ...copy[currentIndex], status: "PICKED", pickedQty: currentItem.requiredQty };
          return copy;
        });

        // Move to next stop or complete
        if (currentIndex < totalStops - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          onWaveComplete();
        }
      }
    } catch (err: any) {
      setIsSubmittingPick(false);
      setFeedbackMsg({
        text: err.message || "Pick verification failed.",
        isError: true,
      });
    }
  };

  const handleShortPickSubmit = async () => {
    if (!currentItem) return;
    try {
      setIsSubmittingPick(true);
      const res = await apiFetch<any>(`/picking-waves/${waveId}/pick-item`, {
        method: "POST",
        body: JSON.stringify({
          pickItemId: currentItem._id,
          pickedQty: shortPickQty,
          isShortPick: true,
          shortPickReason,
          toteBarcode: toteBarcode.trim() || "TOTE-01",
        }),
      });

      setIsSubmittingPick(false);
      setShowShortPick(false);

      if (res.success) {
        setPickItems((prev) => {
          const copy = [...prev];
          copy[currentIndex] = {
            ...copy[currentIndex],
            status: "SHORT_PICKED",
            pickedQty: shortPickQty,
          };
          return copy;
        });

        if (currentIndex < totalStops - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          onWaveComplete();
        }
      }
    } catch (err: any) {
      setIsSubmittingPick(false);
      alert(err.message || "Failed to record short pick exception");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-bold text-foreground text-sm">
                S-Shape Traversal Runner — {waveNumber}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Stop {currentIndex + 1} of {totalStops} • {completedStops} stops completed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Strip */}
        <div className="w-full h-1 bg-muted shrink-0">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(completedStops / Math.max(1, totalStops)) * 100}%` }}
          />
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
              Loading S-Shape traversal route...
            </div>
          ) : !currentItem ? (
            <div className="py-12 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h4 className="font-bold text-lg text-foreground">Wave Picking Completed!</h4>
              <p className="text-xs text-muted-foreground">
                All stops on this S-Shape traversal route have been verified and picked into totes.
              </p>
              <button
                onClick={onWaveComplete}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Proceed to Put-Wall Station
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Target Bin Location Banner */}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1">
                <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Target Bin Location
                </span>
                <div className="text-2xl font-black font-mono tracking-tight text-foreground">
                  {currentItem.binCode}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Follow S-Shape sequence #{currentItem.sequenceOrder}
                </span>
              </div>

              {/* Product Specifications */}
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-foreground text-base">{currentItem.name}</h4>
                    <span className="font-mono text-xs text-muted-foreground block">
                      SKU: {currentItem.sku}
                    </span>
                    {currentItem.barcode && (
                      <span className="font-mono text-[11px] text-muted-foreground block">
                        Barcode: {currentItem.barcode}
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                      Pick Quantity
                    </span>
                    <span className="text-3xl font-black font-mono text-primary">
                      {currentItem.requiredQty}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">units</span>
                  </div>
                </div>

                {/* Tote Assignment Input */}
                <div className="pt-2 border-t border-border flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-muted-foreground" />
                  <label className="text-xs font-medium text-muted-foreground shrink-0">
                    Cart Tote ID:
                  </label>
                  <input
                    type="text"
                    value={toteBarcode}
                    onChange={(e) => setToteBarcode(e.target.value)}
                    className="px-2 py-1 text-xs font-mono font-bold rounded border border-input bg-background w-28 uppercase"
                  />
                </div>
              </div>

              {/* Feedback Alert */}
              {feedbackMsg && (
                <div
                  className={`p-3 text-xs rounded-xl flex items-center gap-2 ${
                    feedbackMsg.isError
                      ? "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400"
                      : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold"
                  }`}
                >
                  {feedbackMsg.isError ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  {feedbackMsg.text}
                </div>
              )}

              {/* Scanned Verification Fields */}
              <form onSubmit={handleConfirmPick} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Scan Bin Barcode</label>
                    <input
                      type="text"
                      placeholder={`e.g. ${currentItem.binCode}`}
                      value={scannedBin}
                      onChange={(e) => setScannedBin(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Scan SKU / Barcode</label>
                    <input
                      type="text"
                      placeholder={`e.g. ${currentItem.sku}`}
                      value={scannedSku}
                      onChange={(e) => setScannedSku(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShortPickQty(0);
                      setShowShortPick(true);
                    }}
                    className="px-3 py-2.5 text-xs font-semibold rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 transition"
                  >
                    Short Pick Exception
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingPick}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingPick ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Confirm & Next Stop
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Short Pick Exception Modal */}
        {showShortPick && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80">
            <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Record Short Pick Exception
              </h4>
              <p className="text-xs text-muted-foreground">
                Specify available quantity picked and report reason code for stock audit.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Actual Units Picked</label>
                <input
                  type="number"
                  min={0}
                  max={currentItem?.requiredQty || 1}
                  value={shortPickQty}
                  onChange={(e) => setShortPickQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-input bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Reason Code</label>
                <select
                  value={shortPickReason}
                  onChange={(e) => setShortPickReason(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background"
                >
                  <option value="Insufficient shelf stock">Insufficient shelf stock</option>
                  <option value="Damaged inventory on shelf">Damaged inventory on shelf</option>
                  <option value="Bin location empty">Bin location empty</option>
                  <option value="Barcode unreadable">Barcode unreadable</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setShowShortPick(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShortPickSubmit}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Log Exception
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

