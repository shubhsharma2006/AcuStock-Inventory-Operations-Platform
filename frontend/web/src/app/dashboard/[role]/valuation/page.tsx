"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface ValuationSummary {
  totalCostValue: number;
  totalMarketValue: number;
  itemCount: number;
  totalUnits: number;
  byMethod?: Record<string, { count: number; value: number }>;
}

export default function ValuationPage() {
  const { data, isLoading } = useQuery<{ success: boolean; data: ValuationSummary }>({
    queryKey: ["valuation-summary"],
    queryFn: () => apiFetch("/api/valuation/summary"),
  });

  const summary = data?.data || {
    totalCostValue: 0,
    totalMarketValue: 0,
    itemCount: 0,
    totalUnits: 0,
    byMethod: {
      WAC: { count: 0, value: 0 },
      FIFO: { count: 0, value: 0 },
      STANDARD: { count: 0, value: 0 },
    },
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Financial Accounting & Costing
            </span>
            <span className="text-xs text-slate-400">• WAC, FIFO, Standard & Landed Cost</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            Stock Valuation & Landed Cost
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Real-time balance sheet inventory valuation across FIFO cost layers, Moving Weighted Average Cost (WAC), Purchase Price Variance (PPV), and multi-currency landed cost apportionment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-emerald-300">Total Book Inventory Value</div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-emerald-400">
            ₹{summary.totalCostValue?.toLocaleString() || "0"}
          </div>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-blue-300">Estimated Market/Retail Value</div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-blue-400">
            ₹{summary.totalMarketValue?.toLocaleString() || "0"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Valued SKUs</div>
          <div className="mt-2 text-2xl font-extrabold text-white">{summary.itemCount || 0}</div>
        </div>
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-purple-300">Total Physical Units</div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-purple-400">
            {summary.totalUnits?.toLocaleString() || "0"}
          </div>
        </div>
      </div>

      {/* Methods breakdown */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Costing Engines & Apportionment Rules
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/5 bg-slate-950 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Weighted Average Cost (WAC)</span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Default</span>
            </div>
            <p className="text-xs text-slate-400">
              `New WAC = ((Old Qty × Old WAC) + (In Qty × In Unit Cost)) / Total Qty`. Recalculates dynamically on each Stock IN.
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-slate-950 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">First-In, First-Out (FIFO)</span>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">Strict Layering</span>
            </div>
            <p className="text-xs text-slate-400">
              Tracks individual receiving cost layers. Stock OUT consumes oldest available cost layers first for precise COGS reporting.
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-slate-950 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Landed Cost Apportionment</span>
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">Multi-Currency</span>
            </div>
            <p className="text-xs text-slate-400">
              Apportions freight, customs, insurance, and handling charges by VALUE, WEIGHT, or VOLUME across received PO line items.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

