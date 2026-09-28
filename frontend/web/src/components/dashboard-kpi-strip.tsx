"use client";

import { useState } from "react";
import { useKpis, type KpiPeriod } from "@/hooks/use-kpis";
import Link from "next/link";

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

interface DashboardKpiStripProps {
  basePath?: string;
  refreshToken?: number;
}

export function DashboardKpiStrip({ basePath = "/dashboard/admin", refreshToken = 0 }: DashboardKpiStripProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<KpiPeriod>("30d");
  const { data, loading, error } = useKpis(selectedPeriod, refreshToken);
  const [showRiskDrawer, setShowRiskDrawer] = useState(false);

  const periods: { label: string; value: KpiPeriod }[] = [
    { label: "7D", value: "7d" },
    { label: "30D", value: "30d" },
    { label: "90D", value: "90d" },
    { label: "YTD", value: "ytd" },
  ];

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-8 w-44 animate-pulse rounded-xl bg-slate-800" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Gracefully degrade if KPIs fail or user lacks permissions
  }

  const { financials, deadStock, stockoutRisk, pipeline } = data;

  return (
    <div className="space-y-4">
      {/* KPI Section Header & Period Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Financial Intelligence & Velocity
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-300">Live Inventory Valuation & Risk Radar</p>
        </div>

        {/* Period Pills */}
        <div className="inline-flex rounded-xl border border-white/10 bg-slate-900/80 p-1 backdrop-blur-md">
          {periods.map((p) => {
            const isActive = selectedPeriod === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setSelectedPeriod(p.value)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-amber-400 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5-Card High-Density Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Valuation at Cost */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-slate-900/80 to-slate-900/90 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-sky-300">Stock Valuation</span>
            <span className="text-base">💎</span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {formatCurrency(financials.valuationAtCost)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>Retail: {formatCurrency(financials.valuationAtRetail)}</span>
            <span className="font-mono text-sky-400">{formatCount(financials.totalStockUnits)} units</span>
          </div>
        </div>

        {/* Card 2: Margin Potential */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-slate-900/90 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-emerald-300">Gross Margin</span>
            <span className="text-base">📈</span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {financials.potentialMarginPercent.toFixed(1)}%
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            Spread across {financials.productCount} active products
          </div>
        </div>

        {/* Card 3: Dead Stock */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-slate-900/80 to-slate-900/90 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-amber-300">Dead Stock</span>
            <span className="text-base">⏳</span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {deadStock.itemCount} <span className="text-sm font-normal text-slate-400">items</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>Trapped: {formatCurrency(deadStock.trappedCapital)}</span>
            <span className="text-amber-400/80">{deadStock.windowDays}d window</span>
          </div>
        </div>

        {/* Card 4: Stockout Risk */}
        <div
          onClick={() => stockoutRisk.criticalCount > 0 && setShowRiskDrawer(!showRiskDrawer)}
          className={`relative overflow-hidden rounded-2xl border p-4 backdrop-blur-xl transition ${
            stockoutRisk.criticalCount > 0
              ? "border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-slate-900/80 to-slate-900/90 cursor-pointer hover:border-rose-400/50"
              : "border-slate-800 bg-slate-900/60"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className={`font-medium ${stockoutRisk.criticalCount > 0 ? "text-rose-300" : "text-slate-400"}`}>
              Stockout Risk
            </span>
            <span className="text-base">{stockoutRisk.criticalCount > 0 ? "🚨" : "🛡️"}</span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {stockoutRisk.criticalCount} <span className="text-sm font-normal text-slate-400">critical</span>
          </div>
          <div className="mt-1 text-[11px] text-rose-300/80 flex items-center justify-between">
            <span>{stockoutRisk.criticalCount > 0 ? "Click to view items" : "All products safe"}</span>
            {stockoutRisk.criticalCount > 0 && <span className="font-mono text-xs">→</span>}
          </div>
        </div>

        {/* Card 5: Pipeline & Orders */}
        <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-slate-900/80 to-slate-900/90 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-violet-300">Order Pipeline</span>
            <span className="text-base">📦</span>
          </div>
          <div className="mt-2 text-lg font-bold tracking-tight text-white">
            {formatCurrency(pipeline.pendingPOs.totalValue + pipeline.pendingSOs.totalValue)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>PO: {pipeline.pendingPOs.count} ({formatCurrency(pipeline.pendingPOs.totalValue)})</span>
            <span>SO: {pipeline.pendingSOs.count}</span>
          </div>
        </div>
      </div>

      {/* Expandable Stockout Risk Item Drawer */}
      {showRiskDrawer && stockoutRisk.items.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
              <h4 className="text-sm font-bold text-white">Critical Stockout Warnings</h4>
              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                {stockoutRisk.items.length} items below minimum threshold
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowRiskDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close ✕
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stockoutRisk.items.map((item) => (
              <div
                key={item.productId}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/80 p-3"
              >
                <div className="min-w-0 pr-2">
                  <p className="truncate text-xs font-semibold text-white">{item.name}</p>
                  <p className="text-[11px] text-slate-400">
                    Threshold: <span className="font-mono text-slate-300">{item.threshold}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-lg px-2 py-1 text-xs font-bold font-mono ${
                      item.currentStock <= 0
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {item.currentStock} left
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Link
              href={`${basePath}/stock-in`}
              className="rounded-xl bg-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/40 transition"
            >
              Restock Inventory Now →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
