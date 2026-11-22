'use client';

import React, { useState } from 'react';

export interface TransferLineItem {
  _id: string;
  product: {
    _id?: string;
    name?: string;
    sku?: string;
    uom?: string;
  } | string;
  quantity: number;
  serialNumbers?: string[];
  receivedQuantity?: number;
}

export interface StockTransferData {
  _id: string;
  transferNumber: string;
  fromWarehouse: { _id?: string; name?: string; code?: string } | string;
  toWarehouse: { _id?: string; name?: string; code?: string } | string;
  items: TransferLineItem[];
}

interface Props {
  transfer: StockTransferData;
  error?: string;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    receivedItems: Array<{
      lineId: string;
      receivedSerials?: string[];
      product: string;
      receivedQuantity: number;
      discrepancyNotes?: string;
    }>;
    receiptNotes?: string;
  }) => void;
}

export function StockTransferReceiveModal({ transfer, error, isLoading = false, onClose, onConfirm }: Props) {
  // Initialize line items with full shipped quantity by default
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    transfer.items.forEach((it) => {
      init[it._id] = it.quantity;
    });
    return init;
  });

  const [selectedSerials, setSelectedSerials] = useState<Record<string, string[]>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [generalReceiptNotes, setGeneralReceiptNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const fromName = typeof transfer.fromWarehouse === 'object' ? transfer.fromWarehouse?.name || 'Source Warehouse' : 'Source';
  const toName = typeof transfer.toWarehouse === 'object' ? transfer.toWarehouse?.name || 'Destination Warehouse' : 'Destination';

  const handleQtyChange = (itemId: string, maxQty: number, valStr: string) => {
    setValidationError(null);
    const parsed = parseInt(valStr, 10);
    if (isNaN(parsed)) {
      setLineQuantities((prev) => ({ ...prev, [itemId]: 0 }));
      return;
    }
    const clamped = Math.min(Math.max(0, parsed), maxQty);
    setLineQuantities((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const fillAllFull = () => {
    const full: Record<string, number> = {};
    transfer.items.forEach((it) => {
      full[it._id] = it.quantity;
    });
    setSelectedSerials({});
    setLineQuantities(full);
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Verify upper bounds
    for (const it of transfer.items) {
      const entered = lineQuantities[it._id] ?? it.quantity;
      if (entered > it.quantity) {
        setValidationError(`Received quantity for item cannot exceed shipped quantity (${it.quantity}).`);
        return;
      }
    }

    const receivedItems = transfer.items.map((it) => {
      const prodId = typeof it.product === 'object' ? it.product?._id || String(it.product) : String(it.product);
      const qty = lineQuantities[it._id] ?? it.quantity;
      const note = lineNotes[it._id]?.trim();
      return {
        lineId: it._id,
        receivedSerials: selectedSerials[it._id] ?? it.serialNumbers,
        product: prodId,
        receivedQuantity: qty,
        discrepancyNotes: note || undefined,
      };
    });

    onConfirm({
      receivedItems,
      receiptNotes: generalReceiptNotes.trim() || undefined,
    });
  };

  const totalShipped = transfer.items.reduce((sum, it) => sum + it.quantity, 0);
  const totalReceived = transfer.items.reduce((sum, it) => sum + (lineQuantities[it._id] ?? it.quantity), 0);
  const totalShortage = Math.max(0, totalShipped - totalReceived);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-xl border border-emerald-500/30 text-emerald-400">
              📥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Receive Stock Transfer</h2>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {transfer.transferNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                From <b className="text-slate-200">{fromName}</b> → To <b className="text-slate-200">{toName}</b>
              </p>
            </div>
          </div>
          <button
            aria-label="Close receipt"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {(validationError || error) && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {validationError || error}
          </div>
        )}

        {/* Shortage Summary Banner */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-slate-950 p-3">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Shipped Units:</span>
              <div className="font-mono font-bold text-white text-sm">{totalShipped}</div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Receiving Units:</span>
              <div className="font-mono font-bold text-emerald-400 text-sm">{totalReceived}</div>
            </div>
            {totalShortage > 0 && (
              <>
                <div className="h-6 w-px bg-white/10" />
                <div>
                  <span className="text-amber-400 text-[10px] uppercase font-bold">Transit Shortage:</span>
                  <div className="font-mono font-bold text-amber-400 text-sm">-{totalShortage} units</div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={fillAllFull}
            className="rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Reset to 100% Full
          </button>
        </div>

        {/* Line Items Form */}
        <form onSubmit={handleSubmit} className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Line Items Receiving Verification</div>
          
          {transfer.items.map((it) => {
            const prodName = typeof it.product === 'object' ? it.product?.name || 'Product' : 'Product';
            const prodSku = typeof it.product === 'object' ? it.product?.sku : undefined;
            const currentRec = lineQuantities[it._id] ?? it.quantity;
            const isShort = currentRec < it.quantity;

            return (
              <div
                key={it._id}
                className={`rounded-xl border p-3.5 transition ${
                  isShort ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5 bg-slate-950/60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">{prodName}</div>
                    {prodSku && <div className="text-[10px] font-mono text-slate-400">SKU: {prodSku}</div>}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase">Shipped</div>
                      <div className="font-mono font-bold text-slate-300 text-xs">{it.quantity}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-emerald-400">Received Qty</div>
                      <input
                        type="number"
                        min={0}
                        max={it.quantity}
                        readOnly={Boolean(it.serialNumbers?.length)}
                        value={currentRec}
                        onChange={(e) => handleQtyChange(it._id, it.quantity, e.target.value)}
                        className="w-20 rounded-lg border border-white/20 bg-slate-900 px-2 py-1 text-center font-mono text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {Boolean(it.serialNumbers?.length) && (
                  <fieldset className="mt-3 text-xs text-slate-200">
                    <legend>Received serial numbers</legend>
                    {it.serialNumbers?.map(serial => {
                      const selected = selectedSerials[it._id] ?? it.serialNumbers ?? [];
                      return (
                        <label key={serial} className="mr-3 inline-flex items-center gap-1">
                          <input type="checkbox" checked={selected.includes(serial)} onChange={event => {
                            const next = event.target.checked ? [...selected, serial] : selected.filter(value => value !== serial);
                            setSelectedSerials(prev => ({ ...prev, [it._id]: next }));
                            setLineQuantities(prev => ({ ...prev, [it._id]: next.length }));
                          }} />
                          {serial}
                        </label>
                      );
                    })}
                  </fieldset>
                )}
                {/* Discrepancy Alert & Note field if shortage */}
                {isShort && (
                  <div className="mt-2.5 pt-2 border-t border-amber-500/20">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-amber-400">
                        ⚠️ Shortage of {it.quantity - currentRec} units recorded
                      </span>
                      <span className="text-[10px] text-slate-400">Explain shortage reason:</span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Broken packaging / missing from sealed carton"
                      value={lineNotes[it._id] || ''}
                      onChange={(e) => setLineNotes({ ...lineNotes, [it._id]: e.target.value })}
                      className="w-full rounded-lg border border-amber-500/30 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* General Receipt Notes */}
          <div className="pt-2">
            <label className="text-xs font-bold text-slate-300 block mb-1">
              General Inwarding Notes / Dock Condition
            </label>
            <input
              type="text"
              placeholder="e.g. Received in good order at Bay 4, physical seal inspected."
              value={generalReceiptNotes}
              onChange={(e) => setGeneralReceiptNotes(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Footer CTAs */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition shadow-xl disabled:opacity-50"
            >
              {isLoading ? 'Processing Inward Stock…' : `Confirm Receipt (${totalReceived} Units)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
