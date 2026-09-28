"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type KpiPeriod = "7d" | "30d" | "90d" | "ytd";

export interface StockoutRiskItem {
  productId: string;
  name: string;
  shortName?: string;
  currentStock: number;
  threshold: number;
}

export interface KpiData {
  period: KpiPeriod;
  financials: {
    valuationAtCost: number;
    valuationAtRetail: number;
    potentialMarginPercent: number;
    totalStockUnits: number;
    productCount: number;
  };
  deadStock: {
    itemCount: number;
    trappedCapital: number;
    windowDays: number;
  };
  stockoutRisk: {
    criticalCount: number;
    items: StockoutRiskItem[];
  };
  pipeline: {
    pendingPOs: {
      count: number;
      totalValue: number;
    };
    pendingSOs: {
      count: number;
      totalValue: number;
    };
  };
}

export function useKpis(initialPeriod: KpiPeriod = "30d", refreshToken = 0) {
  const [period, setPeriod] = useState<KpiPeriod>(initialPeriod);
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const payload = await apiFetch<KpiData>(`/reports/kpis?period=${period}`);
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load KPIs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [period, refreshToken]);

  return { data, loading, error, period, setPeriod };
}
