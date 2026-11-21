'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface SlottingRec {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  velocityTier: string;
  currentBin: {
    id: string;
    code: string;
    aisle: number;
    shelf: number;
  };
  proposedBin: {
    id: string;
    code: string;
    aisle: number;
    shelf: number;
  };
  impact: {
    distanceSavedMetersPerPick: number;
    monthlyMetersSaved: number;
    monthlyHoursSaved: number;
    severity: string;
    reason: string;
  };
}

interface SlottingModalProps {
  warehouseId: string;
  warehouseName?: string;
  isOpen: boolean;
  onClose: () => void;
  onMovesApplied?: () => void;
}

export function SlottingModal({
  warehouseId,
  warehouseName = 'Warehouse Facility',
  isOpen,
  onClose,
  onMovesApplied
}: SlottingModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    summary: { totalBinsAnalyzed: number; misSlottedCount: number; estimatedHoursSavedPerMonth: number };
    recommendations: SlottingRec[];
  } | null>(null);
  const [selectedMoveIds, setSelectedMoveIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Fetch recommendations on modal open
  React.useEffect(() => {
    if (!isOpen || !warehouseId) return;
    setLoading(true);
    setStatusMsg(null);
    apiFetch<any>(`/warehouses/${warehouseId}/slotting-recommendations`)
      .then((res) => {
        setData(res);
        // Select all by default
        if (res.recommendations) {
          setSelectedMoveIds(new Set(res.recommendations.map((r: SlottingRec) => r.id)));
        }
      })
      .catch((err) => {
        console.error('Failed to fetch slotting recommendations:', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, warehouseId]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedMoveIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMoveIds(next);
  };

  const handleApplyMoves = async () => {
    if (!data || selectedMoveIds.size === 0) return;
    setApplying(true);
    setStatusMsg(null);

    const movesToApply = data.recommendations
      .filter((r) => selectedMoveIds.has(r.id))
      .map((r) => ({
        sku: r.sku,
        currentBinId: r.currentBin.id,
        proposedBinId: r.proposedBin.id,
        quantity: r.quantity
      }));

    try {
      const res = await apiFetch<any>(`/warehouses/${warehouseId}/apply-slotting-moves`, {
        method: 'POST',
        body: JSON.stringify({ moves: movesToApply })
      });
      setStatusMsg(`Successfully generated ${res.transfersCreated || movesToApply.length} Stock Transfer orders!`);
      if (onMovesApplied) onMovesApplied();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message || 'Failed to apply relocations'}`);
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🧠</span>
            <div>
              <h2 className="text-base font-bold text-white">
                AI Velocity Slotting Optimizer
              </h2>
              <p className="text-xs text-slate-400">
                Facility: <strong className="text-white">{warehouseName}</strong> · Pareto 80/20 Ergonomic Analysis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <span className="text-xs">Analyzing historical pick vectors & rack elevations...</span>
          </div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 text-center">
                <span className="block text-[10px] uppercase font-bold text-slate-500">
                  Mis-Slotted SKUs
                </span>
                <span className="text-xl font-bold text-amber-400">
                  {data.summary.misSlottedCount}
                </span>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-center">
                <span className="block text-[10px] uppercase font-bold text-emerald-400">
                  Est. Labor Saved
                </span>
                <span className="text-xl font-bold text-white">
                  {data.summary.estimatedHoursSavedPerMonth} hrs/mo
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 text-center">
                <span className="block text-[10px] uppercase font-bold text-slate-500">
                  Bins Analyzed
                </span>
                <span className="text-xl font-bold text-white">
                  {data.summary.totalBinsAnalyzed}
                </span>
              </div>
            </div>

            {statusMsg && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/50 p-3 text-xs text-cyan-300">
                {statusMsg}
              </div>
            )}

            {/* Recommendations List */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                <span className="font-semibold text-white">Recommended Relocations</span>
                <span>{selectedMoveIds.size} selected</span>
              </div>

              {data.recommendations.length > 0 ? (
                data.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => toggleSelect(rec.id)}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition flex items-start gap-3 text-xs ${
                      selectedMoveIds.has(rec.id)
                        ? 'border-cyan-500/40 bg-slate-950/80 shadow-md'
                        : 'border-white/5 bg-slate-950/40 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMoveIds.has(rec.id)}
                      onChange={() => {}}
                      className="mt-1 rounded accent-cyan-400"
                    />

                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white text-sm">{rec.productName}</span>
                          <span className="font-mono text-slate-400 text-[11px] ml-2">({rec.sku})</span>
                        </div>
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                          Class A Velocity
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="rounded-lg bg-slate-800 px-2 py-0.5 font-mono text-slate-300">
                          {rec.currentBin.code} (L{rec.currentBin.shelf})
                        </span>
                        <span className="text-cyan-400 font-bold">➔</span>
                        <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5 font-mono text-emerald-300 border border-emerald-500/30 font-bold">
                          {rec.proposedBin.code} (L{rec.proposedBin.shelf} Golden Zone)
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400">{rec.impact.reason}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold text-emerald-400 block text-xs">
                        -{rec.impact.monthlyHoursSaved}h
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {rec.impact.monthlyMetersSaved}m saved
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
                  Warehouse is optimally slotted! Fast-moving SKUs are already in prime Golden Zone locations.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="pt-4 border-t border-white/10 flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={applying || selectedMoveIds.size === 0}
            onClick={handleApplyMoves}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {applying ? 'Applying Moves...' : `Apply Relocations (${selectedMoveIds.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
