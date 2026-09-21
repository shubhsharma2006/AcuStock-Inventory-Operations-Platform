"use client";

import { useState } from "react";

type BarcodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  serialNumber?: string;
  productName?: string;
  sku?: string;
};

export function BarcodeModal({
  isOpen,
  onClose,
  serialNumber = "SN-2026-9041",
  productName = "Sample Inventory Item",
  sku = "SKU-9900",
}: BarcodeModalProps) {
  const [labelFormat, setLabelFormat] = useState<"thermal" | "grid">("thermal");

  if (!isOpen) return null;

  function handlePrint() {
    window.print();
  }

  // Generate SVG Code128 representation bars
  const mockBars = [3, 1, 2, 1, 3, 2, 1, 2, 3, 1, 1, 2, 3, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 3, 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl print:border-none print:bg-white print:p-0 print:shadow-none">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-xl font-bold text-white">🏷️ Printable Barcode Label Generator</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400 print:hidden">
          Thermal printer & A4 sheet compatible serial barcode label.
        </p>

        {/* Format Selector */}
        <div className="mt-4 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setLabelFormat("thermal")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              labelFormat === "thermal" ? "bg-white text-slate-950" : "bg-white/5 text-slate-400"
            }`}
          >
            Thermal Label (4&quot; x 2&quot;)
          </button>
          <button
            type="button"
            onClick={() => setLabelFormat("grid")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              labelFormat === "grid" ? "bg-white text-slate-950" : "bg-white/5 text-slate-400"
            }`}
          >
            A4 Multi-Sheet Grid
          </button>
        </div>

        {/* Printable Label Card */}
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-slate-700 bg-white p-6 text-slate-950 shadow-md">
          <div className="text-center font-bold text-sm tracking-wide text-black">{productName}</div>
          <div className="text-xs text-slate-600 font-mono">SKU: {sku}</div>

          {/* Barcode SVG */}
          <div className="my-4 flex items-center justify-center gap-0.5 bg-white p-2">
            {mockBars.map((width, idx) => (
              <div
                key={idx}
                className="bg-black"
                style={{
                  width: `${width * 2}px`,
                  height: "48px",
                }}
              />
            ))}
          </div>

          <div className="font-mono text-base font-extrabold tracking-widest text-black">
            {serialNumber}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 uppercase tracking-wider">
            AcuStock Authenticated Serial
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-3 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-6 py-2 text-sm font-bold text-slate-950 hover:from-amber-200 hover:to-orange-400"
          >
            🖨️ Print Label
          </button>
        </div>
      </div>
    </div>
  );
}
