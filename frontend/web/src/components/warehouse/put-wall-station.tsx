"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Package,
  Layers,
  CheckCircle2,
  AlertCircle,
  Truck,
  Search,
  RefreshCw,
  Box,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface PutWallCubby {
  cubbyNumber: number;
  salesOrderId: string;
  orderNumber: string;
  customerName?: string;
  requiredItems: Array<{
    productId?: string;
    sku: string;
    name?: string;
    quantity: number;
  }>;
  sortedItems: Array<{
    productId?: string;
    sku: string;
    name?: string;
    quantity?: number;
    sortedAt?: string;
  }>;
  status: "ASSIGNED" | "IN_PROGRESS" | "READY_TO_PACK" | "CLOSED";
}

interface PutWallStationProps {
  waveId: string;
  waveNumber: string;
  onClose: () => void;
}

export function PutWallStation({ waveId, waveNumber, onClose }: PutWallStationProps) {
  const [cubbies, setCubbies] = useState<PutWallCubby[]>([]);
  const [wallId, setWallId] = useState<string>("PW-01");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [scannedBarcode, setScannedBarcode] = useState<string>("");
  const [isProcessingScan, setIsProcessingScan] = useState<boolean>(false);
  const [activeTargetCubby, setActiveTargetCubby] = useState<number | null>(null);
  const [scanMessage, setScanMessage] = useState<{
    text: string;
    type: "success" | "error" | "complete";
  } | null>(null);

  const [selectedCubbyDetail, setSelectedCubbyDetail] = useState<PutWallCubby | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const fetchPutWall = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<any>(`/picking-waves/${waveId}/put-wall`);
      if (res?.putWall) {
        setCubbies(res.putWall.cubbies || []);
        if (res.putWall.wallId) setWallId(res.putWall.wallId);
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load put wall state:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPutWall();
    // Maintain autofocus on the scanner input
    const focusTimer = setTimeout(() => barcodeInputRef.current?.focus(), 200);
    return () => clearTimeout(focusTimer);
  }, [waveId]);

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scannedBarcode.trim();
    if (!barcode) return;

    try {
      setIsProcessingScan(true);
      setScanMessage(null);

      const res = await apiFetch<any>(`/picking-waves/${waveId}/sort-item`, {
        method: "POST",
        body: JSON.stringify({ scannedBarcode: barcode }),
      });

      setIsProcessingScan(false);
      setScannedBarcode("");

      if (res.success) {
        setActiveTargetCubby(res.cubbyNumber);
        setScanMessage({
          text: res.message,
          type: res.isOrderComplete ? "complete" : "success",
        });

        // Refresh put wall data
        fetchPutWall();

        // Refocus scanner input
        barcodeInputRef.current?.focus();
      }
    } catch (err: any) {
      setIsProcessingScan(false);
      setScanMessage({
        text: err.message || `Failed to sort scanned barcode "${barcode}"`,
        type: "error",
      });
      barcodeInputRef.current?.focus();
    }
  };

  const handleCompleteCubby = async (cubbyNumber: number) => {
    try {
      const res = await apiFetch<any>(`/picking-waves/${waveId}/complete-cubby/${cubbyNumber}`, {
        method: "POST",
      });

      if (res.success) {
        setSelectedCubbyDetail(null);
        fetchPutWall();
      }
    } catch (err: any) {
      alert(err.message || "Failed to seal cubby");
    }
  };

  const readyToPackCount = cubbies.filter((c) => c.status === "READY_TO_PACK").length;
  const inProgressCount = cubbies.filter((c) => c.status === "IN_PROGRESS").length;
  const closedCount = cubbies.filter((c) => c.status === "CLOSED").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Put-Wall Station</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                  {wallId}
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                  Wave: {waveNumber}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Scan bulk-picked items to light up destination order cubby slots
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchPutWall}
              disabled={isLoading}
              className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground transition"
              title="Refresh Put Wall"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scanner Bar & Live Feedback */}
        <div className="p-4 border-b border-border bg-background shrink-0">
          <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan item barcode / SKU (e.g. SKU-101) with hardware gun..."
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                disabled={isProcessingScan}
                className="w-full pl-9 pr-24 py-2.5 text-sm rounded-xl border border-input bg-card focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase text-muted-foreground px-2 py-0.5 rounded bg-muted">
                Laser Ready
              </span>
            </div>

            <button
              type="submit"
              disabled={isProcessingScan || !scannedBarcode.trim()}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm flex items-center justify-center gap-2"
            >
              {isProcessingScan ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Route Item
            </button>
          </form>

          {/* Flash Feedback Banner */}
          {scanMessage && (
            <div
              className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2 transition-all ${
                scanMessage.type === "complete"
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold"
                  : scanMessage.type === "success"
                  ? "bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400"
              }`}
            >
              {scanMessage.type === "complete" ? (
                <Sparkles className="w-4 h-4 shrink-0" />
              ) : scanMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              {scanMessage.text}
            </div>
          )}
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-3 border-b border-border text-center text-xs bg-muted/20 shrink-0">
          <div className="py-2.5 border-r border-border">
            <span className="text-muted-foreground">In Sorting: </span>
            <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">
              {inProgressCount} orders
            </span>
          </div>
          <div className="py-2.5 border-r border-border">
            <span className="text-muted-foreground">Ready to Pack: </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {readyToPackCount} orders
            </span>
          </div>
          <div className="py-2.5">
            <span className="text-muted-foreground">Sealed & Packaged: </span>
            <span className="font-bold text-muted-foreground font-mono">{closedCount} orders</span>
          </div>
        </div>

        {/* 4x6 Physical Put-Wall Matrix Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {cubbies.map((cubby) => {
              const totalRequired = cubby.requiredItems.reduce(
                (acc, r) => acc + (r.quantity || 1),
                0
              );
              const totalSorted = cubby.sortedItems.length;
              const isTarget = activeTargetCubby === cubby.cubbyNumber;
              const isReady = cubby.status === "READY_TO_PACK";
              const isClosed = cubby.status === "CLOSED";

              return (
                <div
                  key={cubby.cubbyNumber}
                  onClick={() => setSelectedCubbyDetail(cubby)}
                  className={`relative p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between min-h-[130px] ${
                    isTarget
                      ? "ring-4 ring-primary shadow-xl bg-primary/10 border-primary scale-[1.03]"
                      : isReady
                      ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50"
                      : isClosed
                      ? "bg-muted/40 border-border/50 opacity-60"
                      : cubby.status === "IN_PROGRESS"
                      ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
                      : "bg-card border-border hover:border-primary/40 shadow-sm"
                  }`}
                >
                  {/* Top Slot Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                        isTarget
                          ? "bg-primary text-primary-foreground"
                          : isReady
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      Slot {cubby.cubbyNumber < 10 ? `0${cubby.cubbyNumber}` : cubby.cubbyNumber}
                    </span>

                    {isReady && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        PACK
                      </span>
                    )}

                    {isClosed && (
                      <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                        SEALED
                      </span>
                    )}
                  </div>

                  {/* Order Number & Customer */}
                  <div className="my-2">
                    <span className="font-mono text-xs font-bold text-foreground block truncate">
                      {cubby.orderNumber}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {cubby.customerName || "Customer"}
                    </span>
                  </div>

                  {/* Progress Bar & Unit Count */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className="text-muted-foreground">Items</span>
                      <span
                        className={`font-semibold ${
                          isReady
                            ? "text-emerald-600 dark:text-emerald-400"
                            : totalSorted > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {totalSorted} / {totalRequired}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isReady ? "bg-emerald-500" : isClosed ? "bg-muted-foreground" : "bg-primary"
                        }`}
                        style={{
                          width: `${Math.min(100, (totalSorted / Math.max(1, totalRequired)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cubby Detail Inspection Drawer */}
        {selectedCubbyDetail && (
          <div className="p-4 border-t border-border bg-card shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">
                  Cubby #{selectedCubbyDetail.cubbyNumber} — {selectedCubbyDetail.orderNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({selectedCubbyDetail.customerName})
                </span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-4">
                <span>
                  Sorted: {selectedCubbyDetail.sortedItems.length} of{" "}
                  {selectedCubbyDetail.requiredItems.reduce((a, b) => a + (b.quantity || 1), 0)}{" "}
                  units
                </span>
                <span>Status: {selectedCubbyDetail.status}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {selectedCubbyDetail.status === "READY_TO_PACK" && (
                <button
                  onClick={() => handleCompleteCubby(selectedCubbyDetail.cubbyNumber)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Box className="w-4 h-4" />
                  Seal & Pack Order
                </button>
              )}
              <button
                onClick={() => setSelectedCubbyDetail(null)}
                className="w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted text-foreground transition"
              >
                Close Drawer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

