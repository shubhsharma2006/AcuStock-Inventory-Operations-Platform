"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { ResponsiveDataView, type ResponsiveColumn } from "@/components/ui/responsive-data-view";
import { BarcodeLabelModal } from "@/components/barcode/barcode-label-modal";
import { Portal } from "@/components/ui/portal";
import type { Role } from "@/lib/acustock";

type InventoryLot = {
  _id: string;
  lotNumber: string;
  productId: {
    _id: string;
    name: string;
    sku?: string;
    uom?: string;
    category?: string;
    trackingMode?: string;
  };
  initialQty: number;
  remainingQty: number;
  mfgDate?: string;
  expiryDate: string;
  supplierWarrantyExpiry?: string;
  supplierId?: {
    _id: string;
    name?: string;
    companyName?: string;
  };
  supplierBatchNumber?: string;
  costPrice?: number;
  status: "ACTIVE" | "DEPLETED" | "EXPIRED" | "BLOCKED" | "RECALLED";
  blockReason?: string;
  blockedAt?: string;
  notes?: string;
  createdAt: string;
  isExpired: boolean;
  isNearExpiry: boolean;
  daysUntilExpiry: number;
};

type LotDetail = InventoryLot & {
  transactions?: Array<{
    _id: string;
    type: "IN" | "OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT";
    quantity: number;
    lotAllocations?: Array<{ lotNumber: string; quantity: number }>;
    createdAt: string;
    createdBy?: { name: string; role: string };
  }>;
};

export default function LotsPage() {
  const params = useParams();
  const role = (params?.role as Role) || "ADMIN";
  const { user } = useSession();

  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [activeTab, setActiveTab] = useState<"ALL" | "ACTIVE" | "NEAR_EXPIRY" | "EXPIRED" | "BLOCKED">("ALL");
  const [search, setSearch] = useState("");

  // Modals
  const [barcodeProduct, setBarcodeProduct] = useState<{
    _id: string;
    name: string;
    sku: string;
    serialNumber?: string;
    price?: number;
    companyName?: string;
  } | null>(null);

  const [selectedLotForHistory, setSelectedLotForHistory] = useState<LotDetail | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [lotToBlock, setLotToBlock] = useState<InventoryLot | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockingSubmitting, setBlockingSubmitting] = useState(false);

  // Load lots
  useEffect(() => {
    let cancelled = false;

    async function loadLots() {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (activeTab === "NEAR_EXPIRY") {
          queryParams.set("nearExpiry", "true");
        } else if (activeTab !== "ALL") {
          queryParams.set("status", activeTab);
        }
        if (search.trim()) {
          queryParams.set("search", search.trim());
        }

        const res = await apiFetch<{ success: boolean; lots: InventoryLot[] }>(
          `/lots?${queryParams.toString()}`
        );
        if (!cancelled && res.success) {
          setLots(res.lots || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load inventory lots");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLots();
    return () => {
      cancelled = true;
    };
  }, [activeTab, search, refreshKey]);

  // Load lot history
  async function openLotHistory(lotId: string) {
    setLoadingHistory(true);
    setSelectedLotForHistory(null);
    try {
      const res = await apiFetch<{ success: boolean; lot: LotDetail }>(`/lots/${lotId}`);
      if (res.success) {
        setSelectedLotForHistory(res.lot);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load lot timeline");
    } finally {
      setLoadingHistory(false);
    }
  }

  // Handle block/unblock
  async function handleToggleBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!lotToBlock) return;
    setBlockingSubmitting(true);
    try {
      const endpoint = lotToBlock.status === "BLOCKED" 
        ? `/lots/${lotToBlock._id}/unblock` 
        : `/lots/${lotToBlock._id}/block`;
      
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ reason: blockReason.trim() || undefined }),
      });

      setLotToBlock(null);
      setBlockReason("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update lot block status");
    } finally {
      setBlockingSubmitting(false);
    }
  }

  // Stats calculation
  const stats = useMemo(() => {
    let active = 0;
    let nearExpiry = 0;
    let expired = 0;
    let blocked = 0;

    for (const lot of lots) {
      if (lot.status === "BLOCKED") blocked++;
      else if (lot.isExpired || lot.status === "EXPIRED") expired++;
      else if (lot.isNearExpiry) nearExpiry++;
      else if (lot.status === "ACTIVE") active++;
    }

    return { total: lots.length, active, nearExpiry, expired, blocked };
  }, [lots]);

  // Responsive Table Columns
  const columns: ResponsiveColumn<InventoryLot>[] = [
    {
      key: "lotNumber",
      header: "Lot / Batch",
      render: (lot) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-amber-300 text-sm">{lot.lotNumber}</span>
            {lot.status === "BLOCKED" ? (
              <span className="rounded bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                BLOCKED
              </span>
            ) : lot.isExpired ? (
              <span className="rounded bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                EXPIRED
              </span>
            ) : lot.isNearExpiry ? (
              <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                NEAR EXPIRY
              </span>
            ) : (
              <span className="rounded bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                HEALTHY
              </span>
            )}
          </div>
          {lot.supplierBatchNumber ? (
            <div className="text-xs text-slate-400 mt-0.5">
              Vendor Batch: <span className="font-mono text-slate-300">{lot.supplierBatchNumber}</span>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "product",
      header: "Product & SKU",
      render: (lot) => (
        <div>
          <div className="font-semibold text-white">{lot.productId?.name || "Unknown Product"}</div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span className="font-mono text-amber-300/80">{lot.productId?.sku || "—"}</span>
            <span>·</span>
            <span className="rounded bg-white/5 px-1.5 py-0.2">{lot.productId?.category || "General"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Available / Initial",
      render: (lot) => {
        const pct = Math.max(0, Math.min(100, Math.round((lot.remainingQty / (lot.initialQty || 1)) * 100)));
        return (
          <div className="w-36">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-bold text-white">{lot.remainingQty} {lot.productId?.uom || "PCS"}</span>
              <span className="text-slate-400">of {lot.initialQty}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-rose-400"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "expiry",
      header: "Shelf Life & Expiry",
      render: (lot) => {
        const expDate = new Date(lot.expiryDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        return (
          <div>
            <div className="font-medium text-slate-200 text-xs">{expDate}</div>
            <div className="text-[11px] mt-0.5">
              {lot.isExpired ? (
                <span className="text-rose-400 font-semibold">Expired {Math.abs(lot.daysUntilExpiry)}d ago</span>
              ) : lot.isNearExpiry ? (
                <span className="text-amber-400 font-semibold">⚠️ {lot.daysUntilExpiry} days left</span>
              ) : (
                <span className="text-slate-400">{lot.daysUntilExpiry} days remaining</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "supplier",
      header: "Supplier / Origin",
      render: (lot) => (
        <div className="text-xs text-slate-300">
          <div>{lot.supplierId?.companyName || lot.supplierId?.name || "Direct Receiving"}</div>
          {lot.mfgDate ? (
            <div className="text-[11px] text-slate-500 mt-0.5">
              MFG: {new Date(lot.mfgDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (lot) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              setBarcodeProduct({
                _id: lot._id,
                name: `${lot.productId?.name || "Product"} [${lot.lotNumber}]`,
                sku: lot.productId?.sku || "SKU-UNKNOWN",
                serialNumber: lot.lotNumber,
                price: lot.costPrice,
                companyName: "AcuStock Batch",
              })
            }
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
            title="Generate Batch Barcode / QR Label"
          >
            <span>🏷️ Label</span>
          </button>

          <button
            type="button"
            onClick={() => openLotHistory(lot._id)}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:border-amber-400/40 hover:bg-amber-400/10 transition cursor-pointer"
            title="View Stock Ledger History for Lot"
          >
            <span>👁️ Timeline</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLotToBlock(lot);
              setBlockReason(lot.blockReason || "");
            }}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              lot.status === "BLOCKED"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            }`}
            title={lot.status === "BLOCKED" ? "Unblock Lot for Picking" : "Quarantine / Block Lot"}
          >
            <span>{lot.status === "BLOCKED" ? "Release" : "Quarantine"}</span>
          </button>
        </div>
      ),
    },
  ];

  // Mobile Card Renderer
  const renderMobileCard = (lot: InventoryLot) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-amber-300 text-sm">{lot.lotNumber}</span>
            {lot.status === "BLOCKED" ? (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                BLOCKED
              </span>
            ) : lot.isExpired ? (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                EXPIRED
              </span>
            ) : lot.isNearExpiry ? (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                NEAR EXPIRY
              </span>
            ) : (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                HEALTHY
              </span>
            )}
          </div>
          <div className="font-semibold text-white mt-1 text-sm">{lot.productId?.name || "Product"}</div>
        </div>

        <div className="text-right">
          <div className="text-sm font-bold text-white">{lot.remainingQty} {lot.productId?.uom || "PCS"}</div>
          <div className="text-xs text-slate-400">of {lot.initialQty}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-white/5">
        <div>
          <span className="text-slate-400">Expiry: </span>
          <span className="font-medium text-slate-200">
            {new Date(lot.expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className="text-right">
          {lot.isExpired ? (
            <span className="text-rose-400 font-semibold">Expired {Math.abs(lot.daysUntilExpiry)}d ago</span>
          ) : lot.isNearExpiry ? (
            <span className="text-amber-400 font-semibold">⚠️ {lot.daysUntilExpiry} days left</span>
          ) : (
            <span className="text-slate-400">{lot.daysUntilExpiry}d left</span>
          )}
        </div>
        <div>
          <span className="text-slate-400">SKU: </span>
          <span className="font-mono text-amber-300">{lot.productId?.sku || "—"}</span>
        </div>
        <div className="text-right">
          <span className="text-slate-400">Supplier: </span>
          <span className="text-slate-200">{lot.supplierId?.companyName || "Direct"}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() =>
            setBarcodeProduct({
              _id: lot._id,
              name: `${lot.productId?.name || "Product"} [${lot.lotNumber}]`,
              sku: lot.productId?.sku || "SKU-UNKNOWN",
              serialNumber: lot.lotNumber,
              price: lot.costPrice,
              companyName: "AcuStock Batch",
            })
          }
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-300 active:scale-95 transition"
        >
          <span>🏷️ Label</span>
        </button>
        <button
          type="button"
          onClick={() => openLotHistory(lot._id)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2 text-xs font-semibold text-amber-300 active:scale-95 transition"
        >
          <span>👁️ Timeline</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setLotToBlock(lot);
            setBlockReason(lot.blockReason || "");
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold active:scale-95 transition ${
            lot.status === "BLOCKED"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          <span>{lot.status === "BLOCKED" ? "Release" : "Quarantine"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Traceability & Expiration</div>
          <h1 className="mt-1 text-2xl lg:text-3xl font-bold tracking-tight text-white">
            Batch & Lot Control Center
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Enterprise batch tracking, shelf-life monitoring, FEFO picking enforcement, and quarantine management.
          </p>
        </div>

        {/* Search */}
        <div className="w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lot # or product SKU..."
            className="w-full sm:w-72 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
          />
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400 font-medium">Total Batches</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-xs text-emerald-400 font-medium">Active Lots</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">{stats.active}</div>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="text-xs text-amber-400 font-medium">Near Expiry (&lt;30d)</div>
          <div className="mt-1 text-2xl font-bold text-amber-300">{stats.nearExpiry}</div>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="text-xs text-rose-400 font-medium">Expired</div>
          <div className="mt-1 text-2xl font-bold text-rose-300">{stats.expired}</div>
        </div>
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-purple-400 font-medium">Quarantined</div>
          <div className="mt-1 text-2xl font-bold text-purple-300">{stats.blocked}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 pb-3">
        {[
          { key: "ALL", label: "All Lots" },
          { key: "ACTIVE", label: "Healthy Active" },
          { key: "NEAR_EXPIRY", label: "⚠️ Near Expiry" },
          { key: "EXPIRED", label: "⛔ Expired" },
          { key: "BLOCKED", label: "🔒 Quarantined" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table & Mobile Cards */}
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : (
        <ResponsiveDataView
          columns={columns}
          data={lots}
          keyExtractor={(lot) => lot._id}
          renderMobileCard={renderMobileCard}
          isLoading={loading}
          emptyMessage="No inventory lots found matching criteria."
          emptyIcon="🏷️"
        />
      )}

      {/* Barcode & QR Label Modal */}
      {barcodeProduct ? (
        <BarcodeLabelModal
          isOpen={Boolean(barcodeProduct)}
          onClose={() => setBarcodeProduct(null)}
          product={barcodeProduct}
        />
      ) : null}

      {/* Lot History / Timeline Slide-over Modal */}
      {selectedLotForHistory ? (
        <Portal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-amber-300">
                      {selectedLotForHistory.lotNumber}
                    </span>
                    <span className="text-xs text-slate-400">· Lot History</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mt-0.5">
                    {selectedLotForHistory.productId?.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLotForHistory(null)}
                  className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Lot Metadata Grid */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-white/10 pb-4">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
                  <div className="text-slate-400">Available</div>
                  <div className="text-base font-bold text-white mt-0.5">
                    {selectedLotForHistory.remainingQty} {selectedLotForHistory.productId?.uom || "PCS"}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
                  <div className="text-slate-400">Initial Received</div>
                  <div className="text-base font-bold text-white mt-0.5">
                    {selectedLotForHistory.initialQty}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
                  <div className="text-slate-400">Expiry Date</div>
                  <div className="text-sm font-bold text-amber-300 mt-1">
                    {new Date(selectedLotForHistory.expiryDate).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5">
                  <div className="text-slate-400">Status</div>
                  <div className="text-sm font-bold text-emerald-400 mt-1">
                    {selectedLotForHistory.status}
                  </div>
                </div>
              </div>

              {/* Ledger Movements Timeline */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Stock Ledger Audit Trail ({selectedLotForHistory.transactions?.length || 0} events)
                </h4>

                {selectedLotForHistory.transactions && selectedLotForHistory.transactions.length > 0 ? (
                  <div className="space-y-2">
                    {selectedLotForHistory.transactions.map((tx) => {
                      const isAddition = tx.type === "IN" || tx.type === "TRANSFER_IN";
                      return (
                        <div
                          key={tx._id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/40 border border-white/5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-bold ${
                                isAddition
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              }`}
                            >
                              {tx.type}
                            </span>
                            <span className="text-slate-300">
                              by {tx.createdBy?.name || "System"} ({tx.createdBy?.role || "USER"})
                            </span>
                          </div>

                          <div className="text-right">
                            <div className={`font-mono font-bold ${isAddition ? "text-emerald-400" : "text-rose-400"}`}>
                              {isAddition ? "+" : "-"}{tx.quantity} units
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {new Date(tx.createdAt).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/30 rounded-2xl">
                    No individual ledger records logged yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* Block/Quarantine Modal */}
      {lotToBlock ? (
        <Portal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white">
                {lotToBlock.status === "BLOCKED" ? "Release Lot from Quarantine" : "Quarantine / Block Lot"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {lotToBlock.status === "BLOCKED"
                  ? `Release Lot ${lotToBlock.lotNumber} back to active inventory picking.`
                  : `Quarantine Lot ${lotToBlock.lotNumber} to prevent it from being allocated to orders.`}
              </p>

              <form onSubmit={handleToggleBlock} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {lotToBlock.status === "BLOCKED" ? "Release Notes (Optional)" : "Reason for Quarantine *"}
                  </label>
                  <textarea
                    required={lotToBlock.status !== "BLOCKED"}
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder={
                      lotToBlock.status === "BLOCKED"
                        ? "Quality audit passed, releasing to stock..."
                        : "Damaged packaging, suspicious odor, temperature breach..."
                    }
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setLotToBlock(null)}
                    className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={blockingSubmitting}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      lotToBlock.status === "BLOCKED"
                        ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                        : "bg-rose-500 text-white hover:bg-rose-400"
                    } disabled:opacity-50`}
                  >
                    {blockingSubmitting
                      ? "Processing…"
                      : lotToBlock.status === "BLOCKED"
                      ? "Release to Active"
                      : "Confirm Quarantine"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
