"use client";

import React, { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";

interface ReorderRecommendation {
  productId: string;
  name: string;
  shortName?: string;
  sku: string;
  uom: string;
  currentStock: number;
  averageDailyDemand: number;
  dailyVolatilityStdDev: number;
  safetyStock: number;
  leadTimeDays: number;
  reorderPoint: number;
  daysUntilStockout: number | string;
  suggestedOrderQty: number;
  urgency: "CRITICAL" | "WARNING" | "HEALTHY";
}

interface ForecastingApiResponse {
  success: boolean;
  lookbackDays: number;
  recommendations: ReorderRecommendation[];
}

export default function ForecastingPage() {
  const params = useParams();
  const router = useRouter();
  const role = (params?.role as string) || "admin";

  const [lookbackDays, setLookbackDays] = useState<number>(60);
  const [searchTerm, setSearchTerm] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("ALL");

  const { data, isLoading, error, refetch } = useQuery<ForecastingApiResponse>({
    queryKey: ["forecast-recommendations", lookbackDays],
    queryFn: () => apiFetch<ForecastingApiResponse>(`/forecasts/reorder-recommendations?days=${lookbackDays}`),
    staleTime: 60 * 1000,
  });

  const recommendations = data?.recommendations || [];

  // Summary Metrics
  const metrics = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    let totalSuggestedUnits = 0;

    recommendations.forEach((r) => {
      if (r.urgency === "CRITICAL") critical++;
      else if (r.urgency === "WARNING") warning++;
      else healthy++;
      totalSuggestedUnits += r.suggestedOrderQty || 0;
    });

    return {
      totalItems: recommendations.length,
      critical,
      warning,
      healthy,
      totalSuggestedUnits,
    };
  }, [recommendations]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return recommendations.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.shortName && item.shortName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesUrgency =
        urgencyFilter === "ALL" || item.urgency === urgencyFilter;

      return matchesSearch && matchesUrgency;
    });
  }, [recommendations, searchTerm, urgencyFilter]);

  // Chart data: Top items needing reorders
  const chartData = useMemo(() => {
    return recommendations
      .filter((r) => r.suggestedOrderQty > 0)
      .slice(0, 8)
      .map((r) => ({
        name: r.shortName || r.name.slice(0, 14),
        current: r.currentStock,
        rop: r.reorderPoint,
        suggested: r.suggestedOrderQty,
        urgency: r.urgency,
      }));
  }, [recommendations]);

  const handleCreateDraftPo = (item: ReorderRecommendation) => {
    // Navigate to purchase orders page with pre-filled state
    router.push(`/dashboard/${role}/purchase-orders?productId=${item.productId}&suggestedQty=${item.suggestedOrderQty}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Link href={`/dashboard/${role}/analytics`} className="hover:text-amber-300 transition">
              Analytics
            </Link>
            <span>/</span>
            <span className="text-amber-400">Demand Forecasting & Reorder Planning</span>
          </div>
          <h1 className="mt-1 text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>📈</span>
            <span>Statistical Demand Forecasting (ROP Engine)</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">
            Automated Reorder Point (ROP) & Safety Stock modeling computed with a 95% service-level confidence interval (Z=1.65).
          </p>
        </div>

        {/* Lookback Period Selector */}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 self-start lg:self-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2">
            History:
          </span>
          {[30, 60, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setLookbackDays(days)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                lookbackDays === days
                  ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {days} Days
            </button>
          ))}
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-xl px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition"
            title="Refresh calculations"
          >
            ↻
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        <div className="glass-panel rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              Critical Stockouts
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold">
              !
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-rose-100">
            {metrics.critical}
          </div>
          <div className="mt-1 text-xs text-rose-300/80">
            Stockout horizon ≤ 7 days
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Below Reorder Point
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
              ⚠️
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-amber-100">
            {metrics.warning}
          </div>
          <div className="mt-1 text-xs text-amber-300/80">
            Requires PO replenishment
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Healthy Inventory
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
              ✓
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-100">
            {metrics.healthy}
          </div>
          <div className="mt-1 text-xs text-emerald-300/80">
            Sufficient buffer over ROP
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Total Recommended ROQ
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-slate-300 text-xs font-bold">
              📦
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-white">
            {metrics.totalSuggestedUnits.toLocaleString()} <span className="text-sm font-normal text-slate-400">units</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Sum of suggested replenishment
          </div>
        </div>

      </div>

      {/* Visual Chart: Replenishment Deficit & ROP Comparison */}
      {chartData.length > 0 && (
        <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">
                Reorder Deficits vs. Target Reorder Points (Top Items)
              </h3>
              <p className="text-xs text-slate-400">
                Current stock levels compared against statistically computed ROP safety thresholds
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-3 w-3 rounded-sm bg-slate-600" /> Current Stock
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="h-3 w-3 rounded-sm bg-amber-500" /> Recommended Order Qty (ROQ)
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-xl border border-white/10 bg-slate-900/95 p-3 text-xs shadow-xl backdrop-blur-md">
                        <div className="font-semibold text-white mb-1.5">{label}</div>
                        {payload.map((p, idx) => (
                          <div key={idx} className="flex justify-between gap-4 py-0.5" style={{ color: p.color }}>
                            <span>{p.name}:</span>
                            <span className="font-bold">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="current" name="Current Stock" fill="#475569" radius={[4, 4, 0, 0]} />
                <Bar dataKey="suggested" name="Recommended Order Qty" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.urgency === "CRITICAL" ? "#ef4444" : "#f59e0b"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-md space-y-4">
        
        {/* Table Filters Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              🔍
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product name, SKU, or model..."
              className="w-full rounded-xl border border-white/10 bg-slate-900/90 pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {["ALL", "CRITICAL", "WARNING", "HEALTHY"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setUrgencyFilter(status)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  urgencyFilter === status
                    ? "bg-white text-slate-950 shadow-md"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Recommendations Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-900/80 uppercase tracking-wider text-[11px] text-slate-400 border-b border-white/10">
              <tr>
                <th className="py-3 px-4">Product / SKU</th>
                <th className="py-3 px-4 text-right">Current Stock</th>
                <th className="py-3 px-4 text-right">Avg Daily Demand</th>
                <th className="py-3 px-4 text-right">Safety Stock (95%)</th>
                <th className="py-3 px-4 text-right">Reorder Point (ROP)</th>
                <th className="py-3 px-4 text-center">Days of Supply</th>
                <th className="py-3 px-4 text-right">Suggested Order (ROQ)</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent mb-2" />
                    <div>Computing statistical inventory models from historical ledger...</div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-rose-300 bg-rose-500/10">
                    Failed to load forecasting data: {String(error)}
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No items match the current search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isCritical = item.urgency === "CRITICAL";
                  const isWarning = item.urgency === "WARNING";

                  return (
                    <tr
                      key={item.productId}
                      className="hover:bg-white/[0.02] transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          SKU: {item.sku} {item.shortName ? `• ${item.shortName}` : ""}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium">
                        <span className={item.currentStock <= 0 ? "text-rose-400 font-bold" : "text-white"}>
                          {item.currentStock} {item.uom}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right text-slate-300 font-mono">
                        {item.averageDailyDemand.toFixed(2)}/day
                      </td>

                      <td className="py-3.5 px-4 text-right text-slate-300 font-mono">
                        {item.safetyStock} {item.uom}
                      </td>

                      <td className="py-3.5 px-4 text-right font-semibold text-amber-300 font-mono">
                        {item.reorderPoint} {item.uom}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            isCritical
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                              : isWarning
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          {item.daysUntilStockout} days
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-amber-400 font-mono">
                        {item.suggestedOrderQty > 0 ? `+${item.suggestedOrderQty} ${item.uom}` : "—"}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {item.suggestedOrderQty > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleCreateDraftPo(item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-amber-300 shadow-sm transition active:scale-95"
                          >
                            <span>Draft PO</span>
                            <span>↗</span>
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-400/80 font-medium">Optimal</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
