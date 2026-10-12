"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export interface ProductDetails {
  _id: string;
  name: string;
  shortName?: string;
  sku?: string;
  barcode?: string;
  barcodeFormat?: string;
  category?: string;
  subCategory?: string;
  brand?: string;
  model?: string;
  description?: string;
  hsn?: string;
  uom?: string;
  currentStock?: number;
  quantity?: number;
  lowStockThreshold?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  autoPoEnabled?: boolean;
  salesPrice?: number;
  purchasePrice?: number;
  mrp?: number;
  taxRate?: number;
  taxType?: string;
  trackingMode?: "NONE" | "SERIAL" | "BATCH";
  serialPolicy?: {
    enableSerial?: boolean;
    requireSerialOnIN?: boolean;
    requireSerialOnOUT?: boolean;
  };
  imageUrl?: string;
  gallery?: Array<{ url: string; isPrimary?: boolean; altText?: string }>;
  preferredSupplierId?: {
    _id: string;
    name?: string;
    companyName?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  warehouseStocks?: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    quantity: number;
    minThreshold: number;
  }>;
  activeLots?: Array<{
    _id: string;
    lotNumber: string;
    quantity: number;
    expirationDate?: string;
    manufactureDate?: string;
    status: string;
    isExpired?: boolean;
  }>;
  inStockSerialsCount?: number;
  recentMovements?: Array<{
    _id: string;
    type: "IN" | "OUT" | "TRANSFER";
    quantity: number;
    referenceDoc?: string;
    createdAt: string;
    performedBy?: { name?: string; email?: string };
  }>;
  createdBy?: { name?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
}

interface ProductDetailsModalProps {
  productId: string | null;
  onClose: () => void;
  role?: string;
}

function formatNumber(value?: number) {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function ProductDetailsModal({
  productId,
  onClose,
  role = "admin",
}: ProductDetailsModalProps) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSku, setCopiedSku] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState(false);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiFetch<ProductDetails>(`/items/${productId}`)
      .then((data) => {
        if (isMounted) setProduct(data);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load product details");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [productId]);

  if (!productId) return null;

  function copyToClipboard(text: string, type: "sku" | "barcode") {
    navigator.clipboard.writeText(text);
    if (type === "sku") {
      setCopiedSku(true);
      setTimeout(() => setCopiedSku(false), 2000);
    } else {
      setCopiedBarcode(true);
      setTimeout(() => setCopiedBarcode(false), 2000);
    }
  }

  const stock = product?.currentStock ?? product?.quantity ?? 0;
  const threshold = product?.lowStockThreshold ?? product?.reorderLevel ?? 10;
  const isOut = stock <= 0;
  const isLow = stock <= threshold && stock > 0;

  const salesPrice = product?.salesPrice ?? 0;
  const purchasePrice = product?.purchasePrice ?? 0;
  const grossProfit = salesPrice - purchasePrice;
  const profitMargin = salesPrice > 0 ? ((grossProfit / salesPrice) * 100).toFixed(1) : "0.0";

  const supplier = product?.preferredSupplierId;
  const supplierName = supplier?.companyName || supplier?.name || "Direct / Open Supplier";

  const rolePrefix = `/dashboard/${role.toLowerCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-[2rem] border border-white/15 bg-slate-950 p-6 sm:p-8 shadow-2xl custom-scrollbar">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-slate-400 hover:border-white/20 hover:text-white transition"
          title="Close details"
        >
          ✕
        </button>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
            <span className="text-3xl animate-spin">⏳</span>
            <p className="text-sm font-medium">Retrieving product master specifications & ledger...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-center text-rose-300">
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              Dismiss
            </button>
          </div>
        ) : product ? (
          <div className="space-y-6">
            {/* Header: Visual Identity & Badges */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-5 border-b border-white/10 pb-6">
              {/* Product Thumbnail / Image */}
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 flex items-center justify-center">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl">📦</span>
                )}
                {product.gallery && product.gallery.length > 1 && (
                  <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    {product.gallery.length} photos
                  </span>
                )}
              </div>

              {/* Title & Metadata */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-amber-400/15 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-400/30">
                    {product.category || "General"}
                  </span>
                  {product.brand && (
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-slate-300">
                      Brand: {product.brand}
                    </span>
                  )}
                  {product.shortName && (
                    <span className="text-xs text-slate-400 font-mono">
                      Model: {product.shortName}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl font-bold text-white tracking-tight break-words">
                  {product.name}
                </h2>

                {product.description && (
                  <p className="text-xs leading-5 text-slate-300 max-w-2xl line-clamp-2">
                    {product.description}
                  </p>
                )}

                {/* SKU and Barcode Badges */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(product.sku || "", "sku")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-mono text-amber-300 hover:border-amber-400/40 transition"
                    title="Click to copy SKU"
                  >
                    <span>SKU: {product.sku || "N/A"}</span>
                    <span className="text-[10px] text-slate-400">
                      {copiedSku ? "✓ Copied" : "📋"}
                    </span>
                  </button>

                  {product.barcode && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(product.barcode || "", "barcode")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-300 hover:border-white/20 transition"
                      title="Click to copy Barcode"
                    >
                      <span>📟 {product.barcode}</span>
                      <span className="text-[10px] text-slate-400">
                        {copiedBarcode ? "✓ Copied" : "📋"}
                      </span>
                    </button>
                  )}

                  {product.hsn && (
                    <span className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs font-mono text-slate-400">
                      HSN: {product.hsn}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Grid 1: Stock Status & Financial Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Total Stock */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-1">
                <div className="text-xs text-slate-400 uppercase font-medium tracking-wider">
                  Live Stock Balance
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">
                    {formatNumber(stock)}
                  </span>
                  <span className="text-xs text-slate-400">{product.uom || "PCS"}</span>
                </div>
                <div className="pt-1">
                  {isOut ? (
                    <span className="inline-block rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-300 border border-rose-500/30">
                      Out of Stock
                    </span>
                  ) : isLow ? (
                    <span className="inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                      Low Stock (Alert at {threshold})
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                      Adequate Stock
                    </span>
                  )}
                </div>
              </div>

              {/* Selling Price */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-1">
                <div className="text-xs text-slate-400 uppercase font-medium tracking-wider">
                  Sales Price
                </div>
                <div className="text-2xl font-bold text-white">
                  ₹{formatNumber(salesPrice)}
                </div>
                <div className="text-xs text-slate-400 pt-1">
                  MRP: ₹{formatNumber(product.mrp || salesPrice)}
                </div>
              </div>

              {/* Purchase Cost & Profit Margin */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-1">
                <div className="text-xs text-slate-400 uppercase font-medium tracking-wider">
                  Cost & Margin
                </div>
                <div className="text-2xl font-bold text-white">
                  ₹{formatNumber(purchasePrice)}
                </div>
                <div className="flex items-center gap-1.5 text-xs pt-1">
                  <span className={`font-semibold ${Number(profitMargin) > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                    +{profitMargin}% Margin
                  </span>
                  <span className="text-slate-500">(₹{formatNumber(grossProfit)})</span>
                </div>
              </div>

              {/* Tax & Compliance */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-1">
                <div className="text-xs text-slate-400 uppercase font-medium tracking-wider">
                  Tax & UoM
                </div>
                <div className="text-2xl font-bold text-white">
                  {product.taxRate ? `${product.taxRate}%` : "0%"}
                </div>
                <div className="text-xs text-slate-400 pt-1">
                  {product.taxType || "GST"} · Unit: {product.uom || "PCS"}
                </div>
              </div>
            </div>

            {/* Grid 2: Warehouse Distribution & Tracking Policy */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Warehouse Breakdown */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>🏭</span> Warehouse Allocations
                  </h3>
                  <span className="text-xs text-slate-400">
                    {product.warehouseStocks?.length || 0} locations
                  </span>
                </div>

                {product.warehouseStocks && product.warehouseStocks.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {product.warehouseStocks.map((ws) => (
                      <div
                        key={ws.warehouseId}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{ws.warehouseName}</div>
                          <div className="font-mono text-[10px] text-slate-400">{ws.warehouseCode}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-300">
                            {formatNumber(ws.quantity)} {product.uom || "PCS"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4 text-center text-xs text-slate-400">
                    All stock currently held in primary central warehouse.
                  </div>
                )}
              </div>

              {/* Tracking Mode & Serial/Lot Governance */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>🛡️</span> Tracking & Governance
                  </h3>
                  <span className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {product.trackingMode || "NONE"}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span>Serial Tracking Enabled:</span>
                    <span className={`font-semibold ${product.serialPolicy?.enableSerial ? "text-emerald-300" : "text-slate-400"}`}>
                      {product.serialPolicy?.enableSerial ? "Yes (Active)" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span>Require Serial on Stock IN:</span>
                    <span className={`font-semibold ${product.serialPolicy?.requireSerialOnIN ? "text-emerald-300" : "text-slate-400"}`}>
                      {product.serialPolicy?.requireSerialOnIN ? "Required (Strict)" : "Optional"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span>Require Serial on Stock OUT:</span>
                    <span className={`font-semibold ${product.serialPolicy?.requireSerialOnOUT ? "text-emerald-300" : "text-slate-400"}`}>
                      {product.serialPolicy?.requireSerialOnOUT ? "Required (Strict)" : "Optional"}
                    </span>
                  </div>
                  {product.inStockSerialsCount !== undefined && (
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                      <span>In-Stock Active Serials:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {product.inStockSerialsCount} units
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Active Batches / Lots (if batch tracked or present) */}
            {product.activeLots && product.activeLots.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>🧪</span> Active Batches & FEFO Expirations
                  </h3>
                  <span className="text-xs text-slate-400">
                    {product.activeLots.length} lot(s)
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {product.activeLots.map((lot) => (
                    <div
                      key={lot._id}
                      className="rounded-xl border border-white/5 bg-slate-950/60 p-3 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-purple-300">
                          Lot: {lot.lotNumber}
                        </span>
                        <span className="font-bold text-white">
                          {formatNumber(lot.quantity)} units
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Expires: {formatDate(lot.expirationDate)}
                      </div>
                      {lot.isExpired && (
                        <span className="inline-block text-[10px] font-bold text-rose-400">
                          ⚠️ EXPIRED
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Supplier Profile & Reorder Rules */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>🤝</span> Procurement & Replenishment
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div className="space-y-1 rounded-xl border border-white/5 bg-slate-950/60 p-3">
                  <div className="text-slate-400">Preferred Supplier</div>
                  <div className="text-sm font-semibold text-white">{supplierName}</div>
                  {supplier?.email && (
                    <div className="text-slate-400 font-mono text-[11px]">{supplier.email}</div>
                  )}
                  {supplier?.phone && (
                    <div className="text-slate-400 text-[11px]">📞 {supplier.phone}</div>
                  )}
                </div>

                <div className="space-y-1 rounded-xl border border-white/5 bg-slate-950/60 p-3">
                  <div className="text-slate-400">Automated Replenishment Rules</div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="font-semibold text-white">Reorder Quantity:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {product.reorderQuantity || 20} units
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Auto-PO Enabled:</span>
                    <span className={`font-semibold ${product.autoPoEnabled ? "text-emerald-300" : "text-slate-400"}`}>
                      {product.autoPoEnabled ? "⚡ Yes (Auto-Triggers on low stock)" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
              <div className="text-xs text-slate-400">
                Created: {formatDate(product.createdAt)} {product.createdBy ? `by ${product.createdBy.name || product.createdBy.email}` : ""}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`${rolePrefix}/stock-in`);
                  }}
                  className="rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition"
                >
                  📥 Record Stock IN
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`${rolePrefix}/stock-out`);
                  }}
                  className="rounded-xl bg-sky-500/20 border border-sky-500/30 px-3.5 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/30 transition"
                >
                  📤 Record Stock OUT
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`${rolePrefix}/stock-ledger`);
                  }}
                  className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  📜 View Ledger
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-950 hover:bg-slate-200 transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
