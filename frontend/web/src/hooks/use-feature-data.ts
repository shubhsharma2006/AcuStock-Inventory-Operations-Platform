"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { NotificationTarget } from "@/lib/acustock";

export type ProductItem = {
  _id: string;
  name: string;
  shortName?: string;
  hsn?: string;
  sku?: string;
  barcode?: string;
  barcodeFormat?: string;
  uom?: string;
  taxRate?: number;
  taxType?: string;
  category?: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  quantity?: number;
  currentStock?: number;
  salesPrice?: number;
  purchasePrice?: number;
  mrp?: number;
  lowStockThreshold?: number;
  reorderQuantity?: number;
  autoPoEnabled?: boolean;
  preferredSupplierId?: { _id: string; companyName?: string; name?: string } | string | null;
};

export type RemainingStockItem = {
  productId: string;
  name: string;
  shortName?: string;
  lowStockThreshold?: number;
  totalIn: number;
  totalOut: number;
};

export type StockLedgerItem = {
  _id: string;
  productId?: {
    _id?: string;
    name?: string;
    shortName?: string;
    hsn?: string;
    serialPolicy?: {
      enableSerial?: boolean;
      requireSerialOnIN?: boolean;
      requireSerialOnOUT?: boolean;
    };
  };
  createdBy?: {
    _id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
  type: "IN" | "OUT";
  quantity: number;
  condition?: string;
  role?: string;
  notes?: string;
  serialNumbers?: string[];
  partyDetails?: {
    companyName?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerAddress?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  transactionDetails?: {
    paymentMethod?: string;
    transactionId?: string;
    supplierType?: string;
    buyerType?: string;
    warrantyPeriod?: string;
    deliveredBy?: string;
    receivedBy?: string;
    transactionDate?: string;
    modelVariant?: string;
  };
  createdAt: string;
  editHistory?: { editedAt: string }[];
};

export type StockLedgerPayload = {
  entries: StockLedgerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export type NotificationItem = {
  _id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  priority?: string;
  category?: string;
  type?: string;
  link?: string;
  targetRole?: string;
  userId?: string;
  metadata?: NotificationTarget & Record<string, unknown>;
};

export type NotificationsPayload = {
  notifications: NotificationItem[];
  unreadCount: number;
  total: number;
  page: number;
  totalPages: number;
};

export type ProfileItem = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: "ADMIN" | "MANAGER" | "USER" | "SUPER_ADMIN";
  isActive?: boolean;
};

export type SerialPolicyItem = {
  _id?: string;
  productId: string;
  serialEnabled: boolean;
  requireSerialIn: boolean;
  requireSerialOut: boolean;
  locked?: boolean;
  productIdPopulated?: {
    _id?: string;
    name?: string;
    shortName?: string;
  };
};

export type PermissionItem = {
  _id?: string;
  role: "ADMIN" | "MANAGER" | "USER";
  canManageUsers?: boolean;
  canAddProduct?: boolean;
  canEditProduct?: boolean;
  canAddCompany?: boolean;
  canEditCompany?: boolean;
  canStockIn?: boolean;
  canStockOut?: boolean;
  canViewStockLedger?: boolean;
  canViewAllReports?: boolean;
  canViewOwnReports?: boolean;
  canAddLogistics?: boolean;
  canEditLogistics?: boolean;
  canDeleteLogistics?: boolean;
  canManageCompanies?: boolean;
};

export type AccountStatsPayload = {
  users: { total: number; active: number; inactive: number };
  managers: { total: number; active: number; inactive: number };
};

export function useProductsData(refreshToken = 0) {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const payload = await apiFetch<ProductItem[]>("/items");
        if (!cancelled) setItems(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load products");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { items, loading, error };
}

export function useRemainingStockData(search = "", refreshToken = 0) {
  const [items, setItems] = useState<RemainingStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
        const payload = await apiFetch<{ items: RemainingStockItem[] }>(`/stock/summary${suffix}`);
        if (!cancelled) setItems(payload.items || []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load stock summary");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [search, refreshToken]);

  return { items, loading, error };
}

export function useStockLedgerData(
  page = 1,
  limit = 20,
  type = "",
  startDate = "",
  endDate = "",
  refreshToken = 0,
) {
  const [payload, setPayload] = useState<StockLedgerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        if (type) params.set("type", type);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);

        const response = await apiFetch<StockLedgerPayload>(`/stock/ledger?${params.toString()}`);
        if (!cancelled) setPayload(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load stock ledger");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [page, limit, type, startDate, endDate, refreshToken]);

  return {
    entries: payload?.entries ?? [],
    pagination: payload?.pagination ?? { page, limit, total: 0, pages: 1 },
    loading,
    error,
  };
}

export function useProfileData(refreshToken = 0) {
  const [profile, setProfile] = useState<ProfileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<ProfileItem>("/settings/profile");
        if (!cancelled) setProfile(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { profile, loading, error };
}

export function useAccountStats(refreshToken = 0) {
  const [stats, setStats] = useState<AccountStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<AccountStatsPayload>("/settings/account-stats");
        if (!cancelled) setStats(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load account stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { stats, loading, error };
}

export function useSerialPolicy(productId: string, refreshToken = 0) {
  const [policy, setPolicy] = useState<SerialPolicyItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<SerialPolicyItem>(`/settings/serial-policies/${productId}`);
        if (!cancelled) setPolicy(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load serial policy");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [productId, refreshToken]);

  return { policy, loading, error, setPolicy };
}

export function useRolePermissions(role: "MANAGER" | "USER", refreshToken = 0) {
  const [permission, setPermission] = useState<PermissionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<PermissionItem>(`/settings/permissions/${role}`);
        if (!cancelled) setPermission(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load permissions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [role, refreshToken]);

  return { permission, loading, error, setPermission };
}

export function useNotificationsData(page = 1, limit = 10, refreshToken = 0) {
  const [payload, setPayload] = useState<NotificationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<NotificationsPayload>(`/notifications?page=${page}&limit=${limit}`);
        if (!cancelled) setPayload(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load notifications");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [page, limit, refreshToken]);

  return {
    notifications: payload?.notifications ?? [],
    unreadCount: payload?.unreadCount ?? 0,
    total: payload?.total ?? 0,
    totalPages: payload?.totalPages ?? 1,
    loading,
    error,
  };
}
