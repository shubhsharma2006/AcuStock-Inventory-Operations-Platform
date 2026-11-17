"use client";

import React, { useState, useEffect, useRef } from "react";

export type ScanActionContext = "RECEIVE" | "PICK" | "CYCLE_COUNT" | "TRANSFER" | "LOOKUP";

interface ScanActionOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  defaultContext?: ScanActionContext;
  onScanResult?: (barcode: string, context: ScanActionContext) => void;
}

export function ScanActionOverlay({
  isOpen,
  onClose,
  defaultContext = "LOOKUP",
  onScanResult
}: ScanActionOverlayProps) {
  const [context, setContext] = useState<ScanActionContext>(defaultContext);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Global shortcut (Ctrl+B / Cmd+B) & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = barcodeInput.trim();
    if (!cleanCode) return;

    setLastScanned(cleanCode);
    setBarcodeInput("");
    setScanStatus("success");
    setStatusMessage(`Processed barcode: ${cleanCode}`);

    if (onScanResult) {
      onScanResult(cleanCode, context);
    }
  };

  const contexts: { id: ScanActionContext; label: string; icon: string }[] = [
    { id: "LOOKUP", label: "Lookup SKU", icon: "🔍" },
    { id: "RECEIVE", label: "Receive (PO)", icon: "📦" },
    { id: "PICK", label: "Pick (SO)", icon: "⚡" },
    { id: "CYCLE_COUNT", label: "Cycle Count", icon: "📋" },
    { id: "TRANSFER", label: "Transfer", icon: "🔄" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-overlay-title"
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-lg">
              📷
            </div>
            <div>
              <h2 id="scan-overlay-title" className="text-base font-semibold text-zinc-900 dark:text-white">
                Scan-First Warehouse Terminal
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Press Esc or ⌘B to exit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Context Selector */}
        <div className="px-6 pt-4 pb-2">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 block uppercase tracking-wider">
            Active Scan Workflow
          </label>
          <div className="grid grid-cols-5 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
            {contexts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContext(c.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-medium transition ${
                  context === c.id
                    ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <span className="text-sm">{c.icon}</span>
                <span className="mt-1 text-[11px] truncate w-full text-center">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scan Input Form */}
        <form onSubmit={handleScanSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="scan-input" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Scan Barcode / SKU / Serial
            </label>
            <div className="relative">
              <input
                id="scan-input"
                ref={inputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Ready for hardware scanner or type SKU..."
                className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-mono text-base placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!barcodeInput.trim()}
                className="absolute right-2 top-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition"
              >
                Submit
              </button>
            </div>
          </div>

          {/* Feedback Banner */}
          {scanStatus !== "idle" && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2.5 text-sm ${
                scanStatus === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40"
                  : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/40"
              }`}
            >
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span className="truncate">{statusMessage}</span>
            </div>
          )}

          {lastScanned && (
            <div className="pt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
              <span>Last scanned: <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">{lastScanned}</span></span>
              <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{context}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
