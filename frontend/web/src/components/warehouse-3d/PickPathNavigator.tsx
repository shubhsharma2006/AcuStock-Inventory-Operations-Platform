'use client';

import React from 'react';

export interface RouteStop {
  id: string;
  code: string;
  aisleNumber: number;
  bayNumber: number;
  shelfLevel: number;
  stepNumber: number;
  cumulativeDistanceMeters: number;
}

export interface RouteMetrics {
  totalDistanceMeters: number;
  unoptimizedDistanceMeters: number;
  distanceSavedMeters: number;
  percentSavings: number;
  orderedStops: RouteStop[];
}

interface PickPathNavigatorProps {
  metrics: RouteMetrics | null;
  onClear: () => void;
  onSelectStop?: (stop: RouteStop) => void;
}

export function PickPathNavigator({ metrics, onClear, onSelectStop }: PickPathNavigatorProps) {
  if (!metrics) return null;

  return (
    <div className="w-80 rounded-2xl border border-cyan-500/20 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md flex flex-col justify-between text-xs text-slate-300">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧭</span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                S-Shape 2-Opt Router
              </span>
              <h3 className="text-sm font-bold text-white">Optimized Pick Route</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Distance Savings Banner */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Walking Distance Reduced
          </div>
          <div className="text-2xl font-black text-white">
            -{metrics.percentSavings}%
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <span>Optimized: <strong className="text-white">{metrics.totalDistanceMeters}m</strong></span>
            <span>·</span>
            <span>Naive: <s className="text-slate-500">{metrics.unoptimizedDistanceMeters}m</s></span>
          </div>
        </div>

        {/* Step-by-Step Stop Sequence List */}
        <div className="space-y-2">
          <span className="font-bold text-white uppercase tracking-wider text-[10px] block">
            Pick Sequence ({metrics.orderedStops.length} Waypoints)
          </span>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {metrics.orderedStops.map((stop) => (
              <div
                key={stop.stepNumber}
                onClick={() => onSelectStop && onSelectStop(stop)}
                className="rounded-xl border border-white/5 bg-slate-950/70 p-2 flex items-center justify-between cursor-pointer hover:border-cyan-500/40 hover:bg-slate-950 transition"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-300 border border-cyan-500/30 shrink-0">
                    {stop.stepNumber}
                  </span>
                  <div>
                    <span className="font-mono font-bold text-white block text-xs">{stop.code}</span>
                    <span className="text-[10px] text-slate-400">
                      Aisle #{stop.aisleNumber} · Bay {stop.bayNumber} · L{stop.shelfLevel}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  +{stop.cumulativeDistanceMeters}m
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-white/10 flex gap-2">
        <button
          type="button"
          onClick={onClear}
          className="flex-1 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
