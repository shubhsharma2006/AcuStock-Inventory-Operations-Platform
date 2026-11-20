'use client';

import React from 'react';
import type { BinNode } from './Warehouse3DScene';

interface BinDetailDrawerProps {
  bin: BinNode | null;
  onClose: () => void;
  onOptimizeForBin?: (binId: string) => void;
}

export function BinDetailDrawer({ bin, onClose, onOptimizeForBin }: BinDetailDrawerProps) {
  if (!bin) return null;

  const pct = bin.capacity?.occupancyPercent || 0;
  const isGoldenZone = (bin.gridCoordinates?.shelfLevel || 1) <= 2 && (bin.gridCoordinates?.aisleNumber || 1) <= 3;

  return (
    <div className="w-80 rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md flex flex-col justify-between text-xs text-slate-300">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Bin Location Node
            </span>
            <h3 className="text-base font-bold text-white font-mono">{bin.code}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Spatial Coordinates Pill */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
            <span className="block text-[10px] text-slate-500">Aisle</span>
            <span className="font-bold text-white">#{bin.gridCoordinates.aisleNumber}</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
            <span className="block text-[10px] text-slate-500">Bay</span>
            <span className="font-bold text-white">R{bin.gridCoordinates.bayNumber}</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
            <span className="block text-[10px] text-slate-500">Shelf</span>
            <span className="font-bold text-white">L{bin.gridCoordinates.shelfLevel}</span>
          </div>
        </div>

        {/* Golden Zone / Ergo Badge */}
        {isGoldenZone ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-300 flex items-center gap-2">
            <span>⭐</span>
            <span><strong>Golden Zone</strong>: Ergonomic waist-height pick position.</span>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-2.5 text-[11px] text-slate-400 flex items-center gap-2">
            <span>🪜</span>
            <span>Upper shelf tier (Level {bin.gridCoordinates.shelfLevel}). Requires reach equipment.</span>
          </div>
        )}

        {/* Capacity bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between font-medium">
            <span className="text-slate-400">Capacity Occupancy</span>
            <span className="text-white font-bold">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct > 85 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{bin.capacity.currentUnits} units stored</span>
            <span>Max: {bin.capacity.maxUnits}</span>
          </div>
        </div>

        {/* Stored SKU Items */}
        <div className="space-y-2">
          <span className="font-bold text-white uppercase tracking-wider text-[10px]">
            Stored Inventory
          </span>
          {bin.contents && bin.contents.length > 0 ? (
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {bin.contents.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-white/5 bg-slate-950/60 p-2 flex items-center justify-between">
                  <div className="truncate mr-2">
                    <span className="font-semibold text-white block truncate">{item.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{item.sku}</span>
                  </div>
                  <span className="shrink-0 font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    {item.quantity} pcs
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-slate-500 italic">
              Bin is currently vacant
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-white/10 space-y-2">
        {onOptimizeForBin && (
          <button
            type="button"
            onClick={() => onOptimizeForBin(bin._id)}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 font-bold text-white shadow-lg transition hover:brightness-110 flex items-center justify-center gap-1.5"
          >
            <span>🧭</span>
            <span>Calculate Route to Bin</span>
          </button>
        )}
      </div>
    </div>
  );
}
