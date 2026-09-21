"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type AdminDashboardStats = {
  totalProducts: number;
  activeProducts: number;
  totalCompanies: number;
  activeCompanies: number;
  totalStockItems: number;
  productsInStock: number;
  totalManagers: number;
  activeManagers: number;
  totalUsers: number;
  activeUsers: number;
  serialEnabledProducts: number;
  stockInToday: number;
  stockOutToday: number;
  stockInTodayCount: number;
  stockOutTodayCount: number;
};

export type AdminDashboardChart = {
  labels: string[];
  stockIn: number[];
  stockOut: number[];
};

export type AdminDashboardPayload = {
  stats: AdminDashboardStats;
  charts: {
    stockMovement: AdminDashboardChart;
    productWise: { labels: string[]; data: number[] };
    managerActivity: { labels: string[]; transactions: number[]; quantity: number[] };
    userActivity: { labels: string[]; transactions: number[]; quantity: number[] };
  };
  lowStockAlerts: Array<{
    productId: string;
    productName: string;
    shortName?: string;
    currentStock: number;
    reorderLevel: number;
    unit?: string;
  }>;
  recentActivity: Array<{
    _id: string;
    type: string;
    quantity: number;
    productName: string;
    shortName?: string;
    userName: string;
    userRole: string;
    companyName?: string;
    timestamp: string;
    serialNumbers?: string[];
  }>;
  topPerformers: Array<{
    name: string;
    role: string;
    transactions: number;
    totalQuantity: number;
  }>;
};

export function useAdminDashboardData(enabled = true, refreshToken = 0) {
  const [data, setData] = useState<AdminDashboardPayload | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const payload = await apiFetch<AdminDashboardPayload>("/reports/admin-dashboard");
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshToken]);

  return { data, loading, error };
}
