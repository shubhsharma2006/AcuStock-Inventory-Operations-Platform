"use client";

import { useState, useEffect, useCallback } from "react";
import { Portal } from "@/components/ui/portal";
import { apiFetch } from "@/lib/api";
import { generateCode128Svg } from "./code128";
import { generateQrSvg } from "./qrcode";
import { MobileBarcodeScanner } from "./mobile-barcode-scanner";

interface BarcodeRmaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  onActionComplete?: () => void;
}

export function BarcodeRmaModal({
  isOpen,
  onClose,
  initialCode = "",
  onActionComplete
}: BarcodeRmaModalProps) {
  const [barcodeInput, setBarcodeInput] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passportData, setPassportData] = useState<any | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Disposition form state
  const [dispositionNotes, setDispositionNotes] = useState("");
  const [returnReason, setReturnReason] = useState("CUSTOMER_RETURN");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchPassport = useCallback(async (codeToFetch: string) => {
    const clean = codeToFetch.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setActionSuccessMessage(null);

    try {
      const data = await apiFetch<any>(`/rma/passport/${encodeURIComponent(clean)}`);
      setPassportData(data);
      if (data.availableWarehouses && data.availableWarehouses.length > 0) {
        setSelectedWarehouseId(data.availableWarehouses[0]._id);
      }
    } catch (err: any) {
      console.error("Passport fetch error:", err);
      setError(err.message || "Failed to locate product passport for this barcode");
      setPassportData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && initialCode) {
      setBarcodeInput(initialCode);
      fetchPassport(initialCode);
    }
    if (!isOpen) {
      setPassportData(null);
      setError(null);
      setActionSuccessMessage(null);
      setDispositionNotes("");
    }
  }, [isOpen, initialCode, fetchPassport]);

  // Execute 1-Click Lifecycle Disposition Action
  async function handleDisposition(actionType: string) {
    if (!passportData || passportData.type !== "SERIAL") return;
    setSubmittingAction(actionType);
    setError(null);
    setActionSuccessMessage(null);

    try {
      const res = await apiFetch<any>("/rma/disposition", {
        method: "POST",
        body: JSON.stringify({
          serial: passportData.serial,
          disposition: actionType,
          warehouseId: selectedWarehouseId || undefined,
          notes: dispositionNotes,
          returnReason: returnReason
        })
      });

      setActionSuccessMessage(res.message || `Successfully processed: ${actionType}`);
      setDispositionNotes("");
      // Refresh passport to show new status & audit trail
      await fetchPassport(passportData.serial);
      if (onActionComplete) onActionComplete();
    } catch (err: any) {
      console.error("Disposition error:", err);
      setError(err.message || "Failed to process disposition action");
    } finally {
      setSubmittingAction(null);
    }
  }

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/98 p-5 sm:p-6 shadow-2xl backdrop-blur-xl flex flex-col max-h-[92vh]">
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Barcode RMA & Product Lifecycle Center</h2>
              <p className="text-xs text-slate-400">
                Scan product box to verify provenance, process customer returns, repair lab intake, or scrap write-offs.
              </p>
            </div>
          </div>

          {/* Barcode Search / Scan Bar */}
          <div className="mt-3.5 mb-2 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Scan or enter barcode / serial number (e.g. SN-OFF-PAP-1001, SKU)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchPassport(barcodeInput);
                }}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 pl-10 text-xs sm:text-sm text-white font-mono placeholder:text-slate-500 outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20"
              />
              <svg className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>

            <button
              type="button"
              onClick={() => fetchPassport(barcodeInput)}
              disabled={loading || !barcodeInput.trim()}
              className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? "Searching..." : "Lookup"}
            </button>

            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5"
              title="Open camera barcode scanner"
            >
              <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Camera</span>
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="my-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}
          {actionSuccessMessage && (
            <div className="my-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300 font-semibold">
              {actionSuccessMessage}
            </div>
          )}

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto space-y-4 my-2 pr-1">
            {passportData ? (
              <>
                {/* ── Product & Serial Identification Card ── */}
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-xl border border-amber-400/20">
                        📦
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-sm sm:text-base">{passportData.product?.name}</h3>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                            {passportData.product?.category}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                          <span className="font-mono">SKU: <strong className="text-white">{passportData.product?.sku}</strong></span>
                          <span>MRP: <strong className="text-amber-300">₹{passportData.product?.price}</strong></span>
                          {passportData.type === "SERIAL" && (
                            <span className="font-mono text-amber-300">SN: <strong>{passportData.serial}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {passportData.type === "SERIAL" && (
                      <div>
                        {passportData.currentStatus === "IN_STOCK" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            AVAILABLE IN-STOCK
                          </span>
                        )}
                        {passportData.currentStatus === "DISPATCHED_TO_CUSTOMER" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
                            <span className="h-2 w-2 rounded-full bg-sky-400" />
                            DISPATCHED TO BUYER
                          </span>
                        )}
                        {passportData.currentStatus === "UNDER_REPAIR" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                            UNDER REPAIR / DEFECTIVE
                          </span>
                        )}
                        {passportData.currentStatus === "SCRAPPED" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300">
                            <span className="h-2 w-2 rounded-full bg-rose-400" />
                            SCRAPPED / WRITTEN OFF
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Serial Barcode Verification Preview */}
                  {passportData.type === "SERIAL" && (
                    <div className="mt-3.5 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 bg-white/5 rounded-xl p-3">
                      <div
                        className="text-white max-w-[200px]"
                        dangerouslySetInnerHTML={{
                          __html: generateCode128Svg(passportData.serial, { height: 28, showText: true })
                        }}
                      />
                      <div
                        className="text-white"
                        dangerouslySetInnerHTML={{
                          __html: generateQrSvg(passportData.serial, { size: 52, margin: 1 })
                        }}
                      />
                      <div className="text-right text-[11px] text-slate-400">
                        <div>Location: <strong className="text-white">{passportData.lastLocation}</strong></div>
                        <div>Last Action: <span className="font-mono text-amber-300">{passportData.lastAction}</span></div>
                        <div>Timestamp: {new Date(passportData.lastActionAt).toLocaleString()}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Buyer & Warranty Passport (If Dispatched / Returned) ── */}
                {passportData.type === "SERIAL" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Buyer / Order Information */}
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Customer & Order Provenance
                      </div>
                      {passportData.buyer ? (
                        <div className="space-y-1">
                          <div className="font-bold text-white">{passportData.buyer.name || "Customer"}</div>
                          {passportData.buyer.phone && (
                            <div className="text-slate-400">Phone: {passportData.buyer.phone}</div>
                          )}
                          {passportData.buyer.email && (
                            <div className="text-slate-400">Email: {passportData.buyer.email}</div>
                          )}
                          {passportData.salesOrder && (
                            <div className="font-mono text-[11px] text-sky-300 mt-1">
                              SO: {passportData.salesOrder.orderNumber}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-500 italic">No sales dispatch record attached yet. Unit is in warehouse.</div>
                      )}
                    </div>

                    {/* Warranty Status */}
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Warranty Coverage
                      </div>
                      {passportData.warranty ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Seller Warranty:</span>
                            <span className={`font-bold uppercase ${passportData.warranty.sellerStatus === "active" ? "text-emerald-400" : "text-amber-400"}`}>
                              {passportData.warranty.sellerStatus}
                            </span>
                          </div>
                          {passportData.warranty.sellerExpiry && (
                            <div className="text-slate-400">
                              Expires: {new Date(passportData.warranty.sellerExpiry).toLocaleDateString()}
                            </div>
                          )}
                          <div className="text-slate-400">
                            Claims Filed: <strong className="text-white">{passportData.warranty.claimsCount || 0}</strong>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500 italic">Standard 1-Year Commercial Warranty Applicable.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── 1-Click Barcode RMA Actions Panel ── */}
                {passportData.type === "SERIAL" && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 uppercase tracking-wider text-xs">
                        🛠️ 1-Click Barcode RMA Disposition Actions
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Updates Stock Ledger & Serial Audit in 1-Click
                      </span>
                    </div>

                    {/* Inputs: Notes, Reason, Target Warehouse */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Return / Action Reason</label>
                        <select
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="CUSTOMER_RETURN">Customer Returned (Unopened / Good)</option>
                          <option value="ORDER_CANCELLED">Order Cancelled / Refund</option>
                          <option value="DEFECTIVE_ON_ARRIVAL">Defective on Arrival (DOA)</option>
                          <option value="WARRANTY_REPAIR">Warranty Repair Claim</option>
                          <option value="TRANSIT_DAMAGE">Transit / Physical Damage</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Target Warehouse</label>
                        <select
                          value={selectedWarehouseId}
                          onChange={(e) => setSelectedWarehouseId(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none"
                        >
                          {(passportData.availableWarehouses || []).map((w: any) => (
                            <option key={w._id} value={w._id}>
                              {w.name} {w.isDefault ? "(Default)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Technician / Inspection Notes</label>
                        <input
                          type="text"
                          placeholder="e.g. Box intact, cable missing, replaced PCB..."
                          value={dispositionNotes}
                          onChange={(e) => setDispositionNotes(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/10">
                      {/* Action 1: Restock (Accept Return) */}
                      <button
                        type="button"
                        onClick={() => handleDisposition("RETURN_RESTOCK")}
                        disabled={submittingAction !== null}
                        className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition cursor-pointer disabled:opacity-50 text-center"
                      >
                        {submittingAction === "RETURN_RESTOCK" ? "Processing..." : "🟢 Accept Return & Restock (+1)"}
                      </button>

                      {/* Action 2: Repair Lab / Fix */}
                      {passportData.currentStatus !== "UNDER_REPAIR" ? (
                        <button
                          type="button"
                          onClick={() => handleDisposition("REPAIR_START")}
                          disabled={submittingAction !== null}
                          className="flex-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition cursor-pointer disabled:opacity-50 text-center"
                        >
                          {submittingAction === "REPAIR_START" ? "Routing..." : "🟡 Move to Repair Lab / Fix"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDisposition("REPAIR_DONE")}
                          disabled={submittingAction !== null}
                          className="flex-1 rounded-xl bg-sky-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-sky-300 transition cursor-pointer disabled:opacity-50 text-center"
                        >
                          {submittingAction === "REPAIR_DONE" ? "Restocking..." : "🔵 Mark Repaired & Restock (+1)"}
                        </button>
                      )}

                      {/* Action 3: Scrap Write-off */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Are you sure you want to scrap serial ${passportData.serial}? This will record an inventory loss write-off.`)) {
                            handleDisposition("SCRAP_WRITEOFF");
                          }
                        }}
                        disabled={submittingAction !== null}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition cursor-pointer disabled:opacity-50 text-center"
                      >
                        {submittingAction === "SCRAP_WRITEOFF" ? "Writing off..." : "🔴 Scrap / Write-Off Unit"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Chronological Movement History Timeline ── */}
                {passportData.history && passportData.history.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                      Complete Lifecycle Audit Timeline ({passportData.history.length} events)
                    </h4>
                    <div className="space-y-2.5">
                      {passportData.history.map((h: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 text-xs border-l-2 border-amber-400/40 pl-3 py-0.5">
                          <div className="font-mono font-bold text-amber-300 shrink-0 w-28">
                            {h.action}
                          </div>
                          <div className="flex-1">
                            <span className="text-slate-300 font-medium">By {h.by} ({h.role})</span>
                            {h.warehouse && <span className="text-slate-400 ml-1.5">at {h.warehouse}</span>}
                            {h.notes && <div className="text-slate-400 italic mt-0.5">&quot;{h.notes}&quot;</div>}
                          </div>
                          <div className="text-slate-500 font-mono text-[10px] shrink-0">
                            {new Date(h.at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <div className="text-4xl mb-2">🔍</div>
                <div className="text-sm font-semibold text-slate-400">Scan or Enter a Product Barcode / Serial Number</div>
                <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Align your physical laser barcode scanner or use the camera to pull up the complete digital passport and 1-click disposition actions.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-3 border-t border-slate-800 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Mobile / Camera Scanner */}
      {showCameraScanner && (
        <MobileBarcodeScanner
          isOpen={showCameraScanner}
          onClose={() => setShowCameraScanner(false)}
          onScan={(scannedCode) => {
            setShowCameraScanner(false);
            setBarcodeInput(scannedCode);
            fetchPassport(scannedCode);
          }}
          title="Scan Product Box Barcode"
          subtitle="Align the 1D Code 128 or 2D QR Code on the box"
        />
      )}
    </Portal>
  );
}
