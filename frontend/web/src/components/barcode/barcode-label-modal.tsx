"use client";

import { useState, useId, useMemo, useEffect } from "react";
import { Portal } from "@/components/ui/portal";
import { generateCode128Svg } from "./code128";
import { generateQrSvg } from "./qrcode";
import { apiFetch } from "@/lib/api";

export type LabelLayout = "THERMAL_4X2" | "THERMAL_2X1" | "THERMAL_4X6" | "AVERY_30";
export type GeneratorMode = "SERIALIZED_UNITS" | "MASTER_SKU";

interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    _id: string;
    name: string;
    sku: string;
    price?: number;
    serialNumber?: string;
    companyName?: string;
    category?: string;
  } | null;
}

export function BarcodeLabelModal({ isOpen, onClose, product }: BarcodeLabelModalProps) {
  const [mode, setMode] = useState<GeneratorMode>("SERIALIZED_UNITS");
  const [symbology, setSymbology] = useState<"CODE128" | "QR" | "BOTH">("BOTH");
  const [layout, setLayout] = useState<LabelLayout>("THERMAL_4X2");

  // Quantity / Unit Count (e.g., 200 units)
  const [copies, setCopies] = useState<number>(4);

  // Serial generator configuration
  const defaultPrefix = product ? `SN-${product.sku ? product.sku.slice(0, 8).toUpperCase() : "PROD"}-` : "SN-";
  const [serialPrefix, setSerialPrefix] = useState<string>(defaultPrefix);
  const [startNumber, setStartNumber] = useState<number>(1001);
  const [paddingDigits, setPaddingDigits] = useState<number>(4);

  // Packaging Box Metadata Toggles
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showMfgDate, setShowMfgDate] = useState<boolean>(true);
  const [showBoxCount, setShowBoxCount] = useState<boolean>(true);
  const [batchLot, setBatchLot] = useState<string>("");

  // Optional: Auto register serials in Inventory
  const [registerInInventory, setRegisterInInventory] = useState<boolean>(false);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [registerSuccessMessage, setRegisterSuccessMessage] = useState<string | null>(null);

  // Fetch warehouses if registration toggle is enabled
  useEffect(() => {
    if (!isOpen || !registerInInventory) return;
    let isMounted = true;
    apiFetch<any>("/warehouses")
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data?.warehouses || [];
        setWarehouses(list);
        if (list.length > 0 && !selectedWarehouseId) {
          setSelectedWarehouseId(list[0]._id);
        }
      })
      .catch((err) => console.error("Error fetching warehouses:", err));
    return () => {
      isMounted = false;
    };
  }, [isOpen, registerInInventory, selectedWarehouseId]);

  // Compute unit labels list
  const labelsList = useMemo(() => {
    if (!product) return [];

    if (mode === "MASTER_SKU") {
      const code = product.serialNumber || product.sku || product._id;
      return Array.from({ length: copies }).map((_, idx) => ({
        index: idx + 1,
        code,
        displaySerial: code,
        boxNumber: idx + 1,
        totalBoxes: copies
      }));
    }

    // SERIALIZED_UNITS: Generate distinct sequential serial numbers
    return Array.from({ length: copies }).map((_, idx) => {
      const num = startNumber + idx;
      const numStr = String(num).padStart(paddingDigits, "0");
      const generatedSerial = `${serialPrefix}${numStr}`;
      return {
        index: idx + 1,
        code: generatedSerial,
        displaySerial: generatedSerial,
        boxNumber: idx + 1,
        totalBoxes: copies
      };
    });
  }, [product, mode, copies, serialPrefix, startNumber, paddingDigits]);

  if (!isOpen || !product) return null;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Handle Print Action with strict print isolation
  async function handlePrint() {
    if (registerInInventory && mode === "SERIALIZED_UNITS") {
      try {
        setIsRegistering(true);
        const serialsToRegister = labelsList.map((l) => l.code);
        await apiFetch("/rma/bulk-register-serials", {
          method: "POST",
          body: JSON.stringify({
            productId: product!._id,
            warehouseId: selectedWarehouseId || undefined,
            serials: serialsToRegister
          })
        });
        setRegisterSuccessMessage(`✅ Registered ${serialsToRegister.length} serials in warehouse inventory!`);
      } catch (err: any) {
        console.error("Bulk serial registration error:", err);
        alert(`Warning: Print will proceed, but failed to auto-register serials: ${err.message}`);
      } finally {
        setIsRegistering(false);
      }
    }

    // Trigger browser print
    window.print();
  }

  // Dimension presets for CSS
  const getPageStyle = () => {
    switch (layout) {
      case "THERMAL_4X2":
        return `@page { size: 4in 2in; margin: 0; }`;
      case "THERMAL_2X1":
        return `@page { size: 2in 1in; margin: 0; }`;
      case "THERMAL_4X6":
        return `@page { size: 4in 6in; margin: 0.1in; }`;
      case "AVERY_30":
        return `@page { size: 8.5in 11in; margin: 0.5in 0.1875in; }`;
      default:
        return `@page { size: auto; margin: 0; }`;
    }
  };

  return (
    <Portal>
      {/* ── Strict Isolated Print Stylesheet ── */}
      <style dangerouslySetInnerHTML={{ __html: getPageStyle() }} />

      {/* ── Screen Dialog Backdrop ── */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
        <div className="relative w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/98 p-5 sm:p-6 shadow-2xl backdrop-blur-xl flex flex-col max-h-[92vh]">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">Enterprise Barcode & Box Label Studio</h2>
                <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-400/20">
                  Zero Waste
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Generate pure vector 1D Code 128 & 2D QR stickers for units, bulk packaging boxes, and pallets.
              </p>
            </div>
          </div>

          {/* Configuration Controls Bar */}
          <div className="overflow-y-auto space-y-3.5 my-3.5 pr-1">
            {/* Mode & Symbology Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Generation Mode */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
                  Label Tracking Mode
                </label>
                <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("SERIALIZED_UNITS")}
                    className={`flex-1 py-1.5 rounded-md font-semibold transition cursor-pointer text-center ${
                      mode === "SERIALIZED_UNITS"
                        ? "bg-amber-400 text-slate-950 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    📦 Serialized Boxes ({copies})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("MASTER_SKU")}
                    className={`flex-1 py-1.5 rounded-md font-semibold transition cursor-pointer text-center ${
                      mode === "MASTER_SKU"
                        ? "bg-amber-400 text-slate-950 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🏷️ Master SKU / Bin
                  </button>
                </div>
              </div>

              {/* Symbology */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Symbology
                </label>
                <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSymbology("CODE128")}
                    className={`flex-1 py-1.5 rounded-md font-medium transition cursor-pointer ${
                      symbology === "CODE128" ? "bg-white/20 text-white font-bold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    1D Code 128
                  </button>
                  <button
                    type="button"
                    onClick={() => setSymbology("QR")}
                    className={`flex-1 py-1.5 rounded-md font-medium transition cursor-pointer ${
                      symbology === "QR" ? "bg-white/20 text-white font-bold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    2D QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setSymbology("BOTH")}
                    className={`flex-1 py-1.5 rounded-md font-medium transition cursor-pointer ${
                      symbology === "BOTH" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>

              {/* Hardware Layout & Quantity */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Paper Format
                    </label>
                    <select
                      value={layout}
                      onChange={(e) => setLayout(e.target.value as LabelLayout)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="THERMAL_4X2">Thermal 4&quot; × 2&quot; (Box)</option>
                      <option value="THERMAL_2X1">Thermal 2&quot; × 1&quot; (Compact)</option>
                      <option value="THERMAL_4X6">Thermal 4&quot; × 6&quot; (Master)</option>
                      <option value="AVERY_30">Avery 5160 Sheet (30/pg)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Units to Label
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bulk Serial Sequence Controls (Active in SERIALIZED_UNITS mode) */}
            {mode === "SERIALIZED_UNITS" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span>⚡ Bulk Sequential Serial Generator</span>
                    <span className="text-slate-400 font-normal font-sans">
                      (Generates {copies} distinct serial barcodes)
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Preview: <strong className="text-white">{serialPrefix}{String(startNumber).padStart(paddingDigits, "0")}</strong> → <strong className="text-white">{serialPrefix}{String(startNumber + copies - 1).padStart(paddingDigits, "0")}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Serial Prefix</label>
                    <input
                      type="text"
                      value={serialPrefix}
                      onChange={(e) => setSerialPrefix(e.target.value.toUpperCase())}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white font-mono uppercase outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Start Number</label>
                    <input
                      type="number"
                      value={startNumber}
                      onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Padding Digits</label>
                    <select
                      value={paddingDigits}
                      onChange={(e) => setPaddingDigits(parseInt(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white outline-none"
                    >
                      <option value={3}>3 Digits (001)</option>
                      <option value={4}>4 Digits (0001)</option>
                      <option value={5}>5 Digits (00001)</option>
                      <option value={6}>6 Digits (000001)</option>
                    </select>
                  </div>
                </div>

                {/* Auto Register in Inventory Checkbox */}
                <div className="mt-2.5 pt-2.5 border-t border-amber-500/10 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={registerInInventory}
                      onChange={(e) => setRegisterInInventory(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-amber-400/20"
                    />
                    <span className="font-semibold text-amber-200">
                      Auto-register these {copies} serial numbers into warehouse stock ledger
                    </span>
                  </label>

                  {registerInInventory && warehouses.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Target Warehouse:</span>
                      <select
                        value={selectedWarehouseId}
                        onChange={(e) => setSelectedWarehouseId(e.target.value)}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-white outline-none"
                      >
                        {warehouses.map((w) => (
                          <option key={w._id} value={w._id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Packaging Box Metadata Toggles */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Box Tag Elements:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-400"
                />
                <span>MRP / Price</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMfgDate}
                  onChange={(e) => setShowMfgDate(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-400"
                />
                <span>Mfg Date</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBoxCount}
                  onChange={(e) => setShowBoxCount(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-400"
                />
                <span>Box Counter (e.g. 1 of {copies})</span>
              </label>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[10px] text-slate-400">Batch/Lot:</span>
                <input
                  type="text"
                  placeholder="Optional"
                  value={batchLot}
                  onChange={(e) => setBatchLot(e.target.value.toUpperCase())}
                  className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-white font-mono uppercase outline-none"
                />
              </div>
            </div>
          </div>

          {/* Registration Success Notification */}
          {registerSuccessMessage && (
            <div className="mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
              {registerSuccessMessage}
            </div>
          )}

          {/* Live Printable Preview Container (Screen view) */}
          <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 min-h-[160px]">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                Live Printable Sticker Preview ({labelsList.length} total)
              </p>
              <span className="text-[11px] text-slate-500 font-mono">
                {layout === "THERMAL_4X2" && "Thermal 4\"×2\" continuous roll (1 sticker / page)"}
                {layout === "THERMAL_2X1" && "Thermal 2\"×1\" item roll (1 sticker / page)"}
                {layout === "THERMAL_4X6" && "Thermal 4\"×6\" carton roll (1 sticker / page)"}
                {layout === "AVERY_30" && "Avery 5160 30 labels / sheet"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {labelsList.slice(0, 6).map((lbl) => (
                <div
                  key={lbl.index}
                  className="rounded-xl border border-slate-300 bg-white p-3 text-slate-900 shadow-md flex flex-col justify-between"
                  style={{ minHeight: "135px" }}
                >
                  {/* Top Bar: Product Name, SKU, Price */}
                  <div className="flex justify-between items-start border-b border-slate-200 pb-1.5 mb-1.5">
                    <div className="min-w-0 pr-2">
                      <h4 className="font-bold text-xs truncate max-w-[200px] text-slate-950">
                        {product.name}
                      </h4>
                      <div className="flex items-center gap-2 font-mono text-[10px] text-slate-600">
                        <span>SKU: {product.sku}</span>
                        {batchLot && <span className="text-amber-800 font-semibold">LOT: {batchLot}</span>}
                      </div>
                    </div>
                    {showPrice && product.price !== undefined && (
                      <span className="font-black text-xs text-slate-950 shrink-0">
                        ₹{product.price}
                      </span>
                    )}
                  </div>

                  {/* Middle: Crisp Pure Vector Barcodes */}
                  <div className="flex items-center justify-around gap-2 my-auto py-1">
                    {(symbology === "CODE128" || symbology === "BOTH") && (
                      <div
                        className="text-slate-950 flex justify-center flex-1 max-w-[190px]"
                        dangerouslySetInnerHTML={{
                          __html: generateCode128Svg(lbl.code, { height: 38, showText: false })
                        }}
                      />
                    )}
                    {(symbology === "QR" || symbology === "BOTH") && (
                      <div
                        className="text-slate-950 flex justify-center shrink-0"
                        dangerouslySetInnerHTML={{
                          __html: generateQrSvg(lbl.code, { size: 68, margin: 1 })
                        }}
                      />
                    )}
                  </div>

                  {/* Serial String Display */}
                  <div className="text-center font-mono font-bold text-[11px] tracking-wider text-slate-900 pt-0.5">
                    SN: {lbl.displaySerial}
                  </div>

                  {/* Footer: Box Count, Mfg Date, Branding */}
                  <div className="flex justify-between items-center text-[9px] text-slate-600 pt-1 border-t border-slate-200 mt-1">
                    <span>{showBoxCount ? `Box ${lbl.boxNumber} of ${lbl.totalBoxes}` : lbl.code}</span>
                    {showMfgDate && <span>Mfg: {todayStr}</span>}
                    <span className="font-semibold">{product.companyName || "AcuStock ERP"}</span>
                  </div>
                </div>
              ))}
            </div>

            {labelsList.length > 6 && (
              <p className="text-center text-xs text-amber-400/90 mt-3 font-mono">
                + {labelsList.length - 6} additional unique serial stickers ready to stream to printer.
              </p>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-slate-800 mt-3">
            <div className="text-xs text-slate-400">
              Output: <strong className="text-white">{copies} {mode === "SERIALIZED_UNITS" ? "unique serial" : "master"} sticker(s)</strong>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={isRegistering}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg hover:from-amber-300 hover:to-orange-400 transition cursor-pointer disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>{isRegistering ? "Registering & Printing..." : `Print ${copies} Label(s)`}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Strict Isolated Printable Container (Only Visible During Print) ── */}
      <div id="printable-barcode-sheet" className="hidden print:block">
        {layout === "AVERY_30" ? (
          // Avery 30-up Sheet (3 columns x 10 rows per A4/Letter page)
          <div className="avery-sheet-page grid grid-cols-3 gap-2 p-4">
            {labelsList.map((lbl) => (
              <div
                key={lbl.index}
                className="border border-slate-300 p-2 flex flex-col justify-between text-slate-950 bg-white"
                style={{ width: "2.625in", height: "1in" }}
              >
                <div className="flex justify-between items-start leading-tight">
                  <span className="font-bold text-[9px] truncate max-w-[1.8in]">{product.name}</span>
                  {showPrice && product.price !== undefined && (
                    <span className="font-bold text-[9px]">₹{product.price}</span>
                  )}
                </div>
                <div className="flex items-center justify-around gap-1 my-auto">
                  <div
                    className="flex justify-center"
                    dangerouslySetInnerHTML={{
                      __html: generateCode128Svg(lbl.code, { height: 26, showText: false })
                    }}
                  />
                  <div
                    className="shrink-0"
                    dangerouslySetInnerHTML={{
                      __html: generateQrSvg(lbl.code, { size: 45, margin: 0 })
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-[7px] font-mono leading-none pt-0.5 border-t border-slate-200">
                  <span className="font-bold">SN: {lbl.displaySerial}</span>
                  <span>{showBoxCount ? `Box ${lbl.boxNumber}/${lbl.totalBoxes}` : product.sku}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Thermal Continuous Roll (1 Sticker per page with hardware eject)
          <div>
            {labelsList.map((lbl) => (
              <div
                key={lbl.index}
                className="thermal-label-unit flex flex-col justify-between text-slate-950 bg-white p-3 box-border"
                style={{
                  width: layout === "THERMAL_2X1" ? "2in" : layout === "THERMAL_4X6" ? "4in" : "4in",
                  height: layout === "THERMAL_2X1" ? "1in" : layout === "THERMAL_4X6" ? "6in" : "2in"
                }}
              >
                {/* Header */}
                <div className="flex justify-between items-start border-b border-black pb-1 leading-tight">
                  <div className="min-w-0 pr-1">
                    <h3 className="font-black text-xs truncate max-w-[2.8in] text-black">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-2 font-mono text-[9px] text-black">
                      <span>SKU: {product.sku}</span>
                      {batchLot && <span>LOT: {batchLot}</span>}
                    </div>
                  </div>
                  {showPrice && product.price !== undefined && (
                    <span className="font-black text-xs text-black shrink-0">
                      ₹{product.price}
                    </span>
                  )}
                </div>

                {/* Pure Vector Barcodes */}
                <div className="flex items-center justify-around gap-2 my-auto py-1">
                  {(symbology === "CODE128" || symbology === "BOTH") && (
                    <div
                      className="text-black flex justify-center flex-1 max-w-[2.6in]"
                      dangerouslySetInnerHTML={{
                        __html: generateCode128Svg(lbl.code, {
                          height: layout === "THERMAL_2X1" ? 24 : 36,
                          showText: false
                        })
                      }}
                    />
                  )}
                  {(symbology === "QR" || symbology === "BOTH") && (
                    <div
                      className="text-black flex justify-center shrink-0"
                      dangerouslySetInnerHTML={{
                        __html: generateQrSvg(lbl.code, {
                          size: layout === "THERMAL_2X1" ? 45 : 62,
                          margin: 0
                        })
                      }}
                    />
                  )}
                </div>

                {/* Serial Monospace String */}
                <div className="text-center font-mono font-black text-xs tracking-wider text-black pt-0.5">
                  SN: {lbl.displaySerial}
                </div>

                {/* Footer Tag */}
                <div className="flex justify-between items-center text-[8px] font-mono font-semibold text-black pt-0.5 border-t border-black">
                  <span>{showBoxCount ? `Box ${lbl.boxNumber} of ${lbl.totalBoxes}` : lbl.code}</span>
                  {showMfgDate && <span>Mfg: {todayStr}</span>}
                  <span>{product.companyName || "AcuStock Enterprise"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Portal>
  );
}
