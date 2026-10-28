"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Portal } from "@/components/ui/portal";
import { apiFetch } from "@/lib/api";
import { MobileBarcodeScanner } from "./mobile-barcode-scanner";
import { BarcodeRmaModal } from "./barcode-rma-modal";
import { BarcodeLabelModal } from "./barcode-label-modal";
import { useRouter } from "next/navigation";

interface GlobalBarcodeScannerProps {
  role?: string;
}

export function GlobalBarcodeScanner({ role = "admin" }: GlobalBarcodeScannerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);

  // Sub-modals
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [rmaSerial, setRmaSerial] = useState<string | null>(null);
  const [printProduct, setPrintProduct] = useState<any | null>(null);

  // Hardware scanner rapid key wedge buffer
  const keyBuffer = useRef<string>("");
  const lastKeyTime = useRef<number>(0);

  const handleResolve = useCallback(async (codeToLookup: string) => {
    const clean = codeToLookup.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setScanResult(null);

    try {
      const data = await apiFetch<any>(`/rma/passport/${encodeURIComponent(clean)}`);
      setScanResult(data);

      // If it's a serial number, offer immediate RMA / Passport inspection
      if (data.type === "SERIAL") {
        setRmaSerial(data.serial);
        setIsOpen(false);
      }
    } catch (err: any) {
      console.error("Quick scan lookup error:", err);
      setError(err.message || `No entity found matching barcode "${clean}"`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for Global Hotkey (Alt+B or Option+B) & Custom Event
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check for Alt+B / Option+B
      if (e.altKey && (e.key === "b" || e.key === "B" || e.code === "KeyB")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      // Hardware Barcode Scanner Keyboard Wedge Detection:
      // Scanners type fast (<35ms between keystrokes)
      const now = Date.now();
      const diff = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // Ignore normal typing in active inputs/textareas
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Enter") {
        if (keyBuffer.current.length >= 3 && diff < 80) {
          const barcode = keyBuffer.current;
          keyBuffer.current = "";
          handleResolve(barcode);
          setIsOpen(true);
        }
        keyBuffer.current = "";
      } else if (e.key.length === 1 && !isInput) {
        if (diff > 100) {
          keyBuffer.current = e.key;
        } else {
          keyBuffer.current += e.key;
        }
      }
    }

    function handleCustomOpen() {
      setIsOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-barcode-scanner", handleCustomOpen);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-barcode-scanner", handleCustomOpen);
    };
  }, [handleResolve]);

  return (
    <>
      {/* ── Main Quick-Scanner Dialog ── */}
      {isOpen && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/98 p-5 shadow-2xl backdrop-blur-xl flex flex-col">
              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>

              {/* Title Header */}
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Universal Barcode Quick-Scanner</h2>
                    <kbd className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                      Alt+B
                    </kbd>
                  </div>
                  <p className="text-xs text-slate-400">
                    Auto-detects Serials, Product SKUs, Batch Lots, and Dock Shipments.
                  </p>
                </div>
              </div>

              {/* Input & Action Bar */}
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Scan with hardware scanner or type barcode..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleResolve(query);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-500 outline-none focus:border-amber-400/40"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleResolve(query)}
                  disabled={loading || !query.trim()}
                  className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? "..." : "Resolve"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowCameraScanner(true)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition cursor-pointer"
                  title="Camera scanner"
                >
                  📷
                </button>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {error}
                </div>
              )}

              {/* Resolved Product SKU Preview Card */}
              {scanResult && scanResult.type === "PRODUCT_SKU" && (
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">{scanResult.product?.name}</h4>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        SKU: {scanResult.product?.sku} • MRP: ₹{scanResult.product?.price}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/20">
                      Total Stock: {scanResult.product?.totalStock} {scanResult.product?.unit}
                    </span>
                  </div>

                  {/* Warehouse breakdown */}
                  {scanResult.warehouseStock && scanResult.warehouseStock.length > 0 && (
                    <div className="rounded-lg border border-white/5 bg-slate-900/60 p-2 text-xs space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stock by Warehouse:</div>
                      {scanResult.warehouseStock.map((w: any) => (
                        <div key={w.warehouseId} className="flex justify-between text-slate-300">
                          <span>{w.warehouseName}:</span>
                          <span className="font-bold text-white">{w.currentStock} units</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setPrintProduct(scanResult.product);
                        setIsOpen(false);
                      }}
                      className="rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition cursor-pointer"
                    >
                      🏷️ Generate & Print Barcodes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/dashboard/${role}/stock-in?sku=${encodeURIComponent(scanResult.product?.sku)}`);
                        setIsOpen(false);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
                    >
                      Stock IN +
                    </button>
                  </div>
                </div>
              )}

              {/* Keyboard Shortcuts Hint */}
              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                <span>Hardware laser scanners fire automatically</span>
                <span>Press <kbd className="font-mono text-slate-400">Esc</kbd> to close</span>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Camera scanner sub-modal */}
      {showCameraScanner && (
        <MobileBarcodeScanner
          isOpen={showCameraScanner}
          onClose={() => setShowCameraScanner(false)}
          onScan={(code) => {
            setShowCameraScanner(false);
            setQuery(code);
            handleResolve(code);
          }}
          title="Warehouse Fast Scanner"
          subtitle="Point at any barcode sticker"
        />
      )}

      {/* Barcode RMA Lifecycle Modal */}
      {rmaSerial && (
        <BarcodeRmaModal
          isOpen={Boolean(rmaSerial)}
          initialCode={rmaSerial}
          onClose={() => setRmaSerial(null)}
        />
      )}

      {/* Barcode Label Print Modal */}
      {printProduct && (
        <BarcodeLabelModal
          isOpen={Boolean(printProduct)}
          product={printProduct}
          onClose={() => setPrintProduct(null)}
        />
      )}
    </>
  );
}
