"use client";

import { useState, useMemo, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type ProductItem = {
  _id: string;
  name: string;
  shortName?: string;
  sku?: string;
  currentStock?: number;
  quantity?: number;
  category?: string;
  uom?: string;
  trackingMode?: "NONE" | "SERIAL" | "BATCH";
  lotPolicy?: {
    requireSupplierBatch?: boolean;
    minShelfLifeDays?: number;
    allocationStrategy?: "FEFO" | "FIFO";
  };
  serialPolicy?: {
    enableSerial?: boolean;
    requireSerialOnIN?: boolean;
    requireSerialOnOUT?: boolean;
  };
};

type InventoryLot = {
  _id: string;
  lotNumber: string;
  remainingQty: number;
  initialQty: number;
  expiryDate: string;
  mfgDate?: string;
  supplierBatchNumber?: string;
  status: string;
  isExpired?: boolean;
  isNearExpiry?: boolean;
  daysUntilExpiry?: number;
};

type Company = {
  _id: string;
  name: string;
  type?: string;
  city?: string;
  gstin?: string;
  phone?: string;
  email?: string;
};

type WarehouseItem = {
  _id: string;
  name: string;
  code?: string;
  location?: string;
  isPrimary?: boolean;
};

type AvailableSerialsResponse = {
  serials: string[];
  totalCount: number;
};

export default function StockOutPage() {
  const router = useRouter();
  const { user } = useSession();
  const queryClient = useQueryClient();

  // Form states
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT");
  const [transactionId, setTransactionId] = useState("");
  const [warrantyPeriod, setWarrantyPeriod] = useState("12 Months");
  const [condition, setCondition] = useState("New");
  const [notes, setNotes] = useState("");
  const [serialSearchQuery, setSerialSearchQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: productsData, refetch: refetchProducts, isFetching: loadingProducts } = useQuery<ProductItem[] | { items: ProductItem[] }>({
    queryKey: ["products-list"],
    queryFn: () => apiFetch("/items"),
  });

  const { data: companiesData, refetch: refetchCompanies, isFetching: loadingCompanies } = useQuery<Company[] | { companies: Company[] }>({
    queryKey: ["companies-list"],
    queryFn: () => apiFetch("/companies"),
  });

  const { data: warehousesData, refetch: refetchWarehouses, isFetching: loadingWarehouses } = useQuery<WarehouseItem[] | { warehouses: WarehouseItem[] }>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  // Query available in-stock serials when product is selected
  const { data: availableSerialsData, isLoading: loadingSerials } = useQuery<AvailableSerialsResponse>({
    queryKey: ["available-serials", productId],
    queryFn: () => apiFetch<AvailableSerialsResponse>(`/stock/serials/${productId}?status=available`),
    enabled: Boolean(productId),
  });

  // Query available lots when product is batch-tracked
  const { data: availableLotsData, isLoading: loadingLots } = useQuery<{ success: boolean; lots: InventoryLot[] }>({
    queryKey: ["available-lots", productId],
    queryFn: () => apiFetch<{ success: boolean; lots: InventoryLot[] }>(`/lots/availability/${productId}`),
    enabled: Boolean(productId),
  });

  const availableLots = useMemo(() => {
    return availableLotsData?.lots || [];
  }, [availableLotsData]);

  const products = useMemo(() => {
    if (Array.isArray(productsData)) return productsData;
    return (productsData as any)?.items || [];
  }, [productsData]);

  const companies = useMemo(() => {
    if (Array.isArray(companiesData)) return companiesData;
    return (companiesData as any)?.companies || [];
  }, [companiesData]);

  const warehouses = useMemo(() => {
    if (Array.isArray(warehousesData)) return warehousesData;
    return (warehousesData as any)?.warehouses || [];
  }, [warehousesData]);

  const availableSerials = availableSerialsData?.serials || [];

  const selectedProduct = products.find((p: ProductItem) => p._id === productId);

  // Auto-select FEFO lot (earliest valid non-expired active lot)
  useEffect(() => {
    if (selectedProduct?.trackingMode === "BATCH" && availableLots.length > 0) {
      const fefoCandidate = availableLots.find((l) => !l.isExpired && l.status === "ACTIVE");
      if (fefoCandidate && !selectedLotId) {
        setSelectedLotId(fefoCandidate._id);
      }
    }
  }, [selectedProduct, availableLots, selectedLotId]);

  // Auto-select primary warehouse if none selected
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const primary = warehouses.find((w: WarehouseItem) => w.isPrimary || (w as any).isDefault) || warehouses[0];
      if (primary?._id) setWarehouseId(primary._id);
    }
  }, [warehouses, warehouseId]);

  // Options for Searchable Comboboxes
  const productOptions: SearchableSelectOption[] = useMemo(() => {
    return products.map((p: ProductItem) => {
      const stock = p.currentStock ?? p.quantity ?? 0;
      const isOut = stock <= 0;
      return {
        value: p._id,
        label: p.name,
        sublabel: p.sku || p.shortName || undefined,
        badge: isOut ? "0 In Stock" : `${stock} in stock`,
        badgeColor: isOut ? "rose" : "emerald",
        icon: "📦",
        details: `${p.category || "General"} · ${p.uom || "PCS"}`,
      };
    });
  }, [products]);

  const companyOptions: SearchableSelectOption[] = useMemo(() => {
    return companies.map((c: any) => ({
      value: c.companyName || c.name,
      label: c.companyName || c.name,
      sublabel: c.address?.city || c.city || (c.taxId || c.gstin ? `GST: ${c.taxId || c.gstin}` : undefined),
      badge: c.type || "Customer",
      badgeColor: "blue",
      icon: "🏢",
      details: c.email || c.phone || undefined,
    }));
  }, [companies]);

  const warehouseOptions: SearchableSelectOption[] = useMemo(() => {
    return warehouses.map((w: WarehouseItem) => ({
      value: w._id,
      label: w.name,
      sublabel: w.code || undefined,
      badge: w.isPrimary || (w as any).isDefault ? "Primary Hub" : "Active Branch",
      badgeColor: "purple",
      icon: "🏭",
      details: (w as any).address?.city || w.location || undefined,
    }));
  }, [warehouses]);

  const serialPolicy = selectedProduct?.serialPolicy || {};
  const requiresSerials = serialPolicy.enableSerial && serialPolicy.requireSerialOnOUT;

  function toggleSerialSelection(serial: string) {
    setSelectedSerials((prev) => {
      if (prev.includes(serial)) {
        return prev.filter((s) => s !== serial);
      }
      if (prev.length >= quantity) {
        return [...prev.slice(1), serial]; // Replace oldest if max reached
      }
      return [...prev, serial];
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productId) {
      setFormError("Please select a product.");
      return;
    }
    if (quantity <= 0) {
      setFormError("Quantity must be greater than 0.");
      return;
    }

    if (serialPolicy.enableSerial && requiresSerials && selectedSerials.length !== quantity) {
      setFormError(`Serial policy requires selecting exactly ${quantity} in-stock serial number(s) (selected ${selectedSerials.length}).`);
      return;
    }

    if (selectedProduct?.trackingMode === "BATCH") {
      const activeLots = availableLots.filter((l) => !l.isExpired && l.status === "ACTIVE");
      if (activeLots.length === 0) {
        setFormError("No active, non-expired lots available in stock for this batch-tracked product. Cannot dispatch.");
        return;
      }
    }

    setLoading(true);
    setFormError(null);

    try {
      await apiFetch("/stock/out", {
        method: "POST",
        body: JSON.stringify({
          productId,
          warehouseId: warehouseId || undefined,
          quantity: Number(quantity),
          serialNumbers: selectedSerials,
          lotId: selectedProduct?.trackingMode === "BATCH" ? (selectedLotId || undefined) : undefined,
          preferredLotId: selectedProduct?.trackingMode === "BATCH" ? (selectedLotId || undefined) : undefined,
          buyer: buyerName.trim() || undefined,
          condition,
          transaction: {
            supplierType: "BUYER",
            paymentMethod,
            transactionId: transactionId.trim() || undefined,
            warrantyPeriod,
          },
          notes: notes.trim() || undefined,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["available-serials", productId] });
      queryClient.invalidateQueries({ queryKey: ["available-lots", productId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-lots"] });

      const roleHome = `/dashboard/${
        user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
          ? "admin"
          : user?.role.toLowerCase()
      }`;
      router.push(`${roleHome}/stock-ledger`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record Stock OUT dispatch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-300">
          📤 Stock Dispatch Engine
        </div>
        <h1 className="mt-2 text-3xl font-bold text-white">Record Stock OUT (Buyer Dispatch)</h1>
        <p className="text-sm text-slate-400">
          Issue inventory to buyers, select available in-stock serial numbers, and sign the immutable Stock Ledger.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Product & Quantity */}
        <div className="relative z-30 rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">1. Select Product & Quantity to Dispatch</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <SearchableSelect
                label="Product to Dispatch"
                required
                options={productOptions}
                value={productId}
                onChange={(val) => {
                  setProductId(val);
                  setSelectedSerials([]);
                }}
                placeholder="Select product to dispatch..."
                searchPlaceholder="Type initial letter or SKU to search..."
                onRefresh={() => refetchProducts()}
                isLoading={loadingProducts}
                onAddNew={() => {
                  const role = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : (user?.role || "user").toLowerCase();
                  router.push(`/dashboard/${role}/products`);
                }}
                addNewLabel="+ New Product in Catalog"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Dispatch Quantity *</label>
              <input
                type="number"
                min={1}
                max={100000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>
          </div>

          {/* Source Warehouse Selector */}
          <div>
            <SearchableSelect
              label="Source Dispatch Warehouse"
              required
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
              placeholder="Select source warehouse..."
              searchPlaceholder="Type warehouse name or code..."
              onRefresh={() => refetchWarehouses()}
              isLoading={loadingWarehouses}
              onAddNew={() => {
                const role = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : (user?.role || "user").toLowerCase();
                router.push(`/dashboard/${role}/warehouses`);
              }}
              addNewLabel="+ Add New Warehouse"
            />
          </div>

          {/* Tracking Policy Info Banner */}
          {selectedProduct && (
            <div className={`rounded-xl border p-4 text-xs ${
              selectedProduct.trackingMode === "BATCH"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : serialPolicy.enableSerial
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-slate-950/60 text-slate-400"
            }`}>
              {selectedProduct.trackingMode === "BATCH" ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <span>🧪 Batch Item with Automated FEFO Allocation:</span>
                    <span>Earliest expiring batch automatically prioritized to prevent shrinkage.</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                    FEFO Active
                  </span>
                </div>
              ) : serialPolicy.enableSerial ? (
                <div className="flex items-center gap-2 font-medium">
                  <span>⚡ Enterprise Serial Policy Active:</span>
                  <span>{requiresSerials ? "Serials REQUIRED on Stock OUT" : "Serials OPTIONAL on Stock OUT"}</span>
                </div>
              ) : (
                <div>Standard inventory item (Dispatched directly from stock ledger).</div>
              )}
            </div>
          )}
        </div>

        {/* Step 2A: FEFO Batch Allocation (If Batch-Tracked) */}
        {selectedProduct?.trackingMode === "BATCH" && (
          <div className="relative z-20 rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-6 backdrop-blur-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>2. FEFO Batch Allocation</span>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                    First-Expired First-Out
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Select a lot for dispatch or accept the system-recommended earliest expiring batch.
                </p>
              </div>
              {selectedLotId && (
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Allocated Lot ID: {availableLots.find(l => l._id === selectedLotId)?.lotNumber || "Selected"}
                </span>
              )}
            </div>

            {loadingLots ? (
              <div className="p-6 text-center text-xs text-slate-400 animate-pulse">
                Analyzing inventory shelf-life & sorting lots by FEFO...
              </div>
            ) : availableLots.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {availableLots.map((lot, idx) => {
                  const isSelected = selectedLotId === lot._id;
                  const isBlocked = lot.status === "BLOCKED";
                  const isExpired = lot.isExpired;
                  const isNear = lot.isNearExpiry;
                  const isFefoRecommended = idx === 0 && !isExpired && !isBlocked;

                  return (
                    <div
                      key={lot._id}
                      onClick={() => {
                        if (!isBlocked && !isExpired) {
                          setSelectedLotId(lot._id);
                        }
                      }}
                      className={`relative rounded-xl border p-4 transition text-xs ${
                        isBlocked || isExpired
                          ? "border-rose-500/20 bg-rose-500/5 opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "border-emerald-400 bg-emerald-400/10 cursor-pointer shadow-lg shadow-emerald-500/5"
                          : "border-white/10 bg-slate-950/70 hover:bg-white/5 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">
                              {lot.lotNumber}
                            </span>
                            {isFefoRecommended && (
                              <span className="rounded bg-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 border border-emerald-400/40">
                                ⚡ FEFO Recommended
                              </span>
                            )}
                          </div>
                          {lot.supplierBatchNumber && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Supplier Batch: {lot.supplierBatchNumber}
                            </div>
                          )}
                        </div>

                        <input
                          type="radio"
                          name="preferredLot"
                          checked={isSelected}
                          disabled={isBlocked || isExpired}
                          onChange={() => setSelectedLotId(lot._id)}
                          className="h-4 w-4 accent-emerald-400 mt-1 cursor-pointer"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5">
                        <div className="text-[11px] text-slate-300">
                          Available: <strong className="text-white font-mono">{lot.remainingQty}</strong> units
                        </div>

                        <div>
                          {isExpired ? (
                            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/30">
                              Expired
                            </span>
                          ) : isBlocked ? (
                            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                              Quarantined
                            </span>
                          ) : isNear ? (
                            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                              ⚠️ Expiring in {lot.daysUntilExpiry}d ({new Date(lot.expiryDate).toLocaleDateString()})
                            </span>
                          ) : (
                            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 border border-white/10">
                              Expires: {new Date(lot.expiryDate).toLocaleDateString()} ({lot.daysUntilExpiry}d left)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-center text-xs text-rose-300">
                ⚠️ No active lots found for this product. You cannot dispatch batch-tracked products without active inventory lots.
              </div>
            )}
          </div>
        )}

        {/* Step 2: Available In-Stock Serial Selection */}
        {selectedProduct && serialPolicy.enableSerial && (
          <div className="relative z-20 rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-white">2. Select In-Stock Serial Numbers</h2>
                <p className="text-xs text-slate-400">Scan barcodes or click to select units for dispatch</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full ${
                  selectedSerials.length === quantity
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}>
                  Selected: {selectedSerials.length} / {quantity} required
                </span>
              </div>
            </div>

            {/* Quick Actions & Barcode Search Filter */}
            {availableSerials.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3">
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={serialSearchQuery}
                    onChange={(e) => setSerialSearchQuery(e.target.value)}
                    placeholder="🔍 Filter / Scan Serial Barcode..."
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs text-white uppercase outline-none focus:border-cyan-400/40"
                  />
                  {serialSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSerialSearchQuery("")}
                      className="absolute right-3 top-2 text-xs text-slate-500 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const needed = availableSerials.slice(0, quantity);
                      setSelectedSerials(needed);
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                  >
                    ⚡ Auto-Pick First {quantity} (FIFO)
                  </button>

                  {selectedSerials.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedSerials([])}
                      className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            {loadingSerials ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading in-stock serial numbers...</div>
            ) : availableSerials.length > 0 ? (
              (() => {
                const filteredSerials = serialSearchQuery
                  ? availableSerials.filter(s => s.toUpperCase().includes(serialSearchQuery.trim().toUpperCase()))
                  : availableSerials;

                return (
                  <div className="space-y-2">
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-y-auto pr-1">
                      {filteredSerials.map((s) => {
                        const isChecked = selectedSerials.includes(s);
                        return (
                          <label
                            key={s}
                            onClick={() => toggleSerialSelection(s)}
                            className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs font-mono transition ${
                              isChecked
                                ? "border-emerald-400 bg-emerald-400/10 text-emerald-300 font-bold"
                                : "border-white/10 bg-slate-950 text-slate-300 hover:bg-white/5"
                            }`}
                          >
                            <span>{s}</span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="h-4 w-4 accent-emerald-400"
                            />
                          </label>
                        );
                      })}
                    </div>
                    {filteredSerials.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No serials matching "{serialSearchQuery}"
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-xs text-rose-200">
                ⚠️ No available in-stock serial numbers found for this product. Perform Stock IN first.
              </div>
            )}
          </div>
        )}

        {/* Step 3: Customer / Buyer Metadata */}
        <div className="relative z-10 rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">3. Buyer & Dispatch Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SearchableSelect
                label="Buyer Company / Customer"
                options={companyOptions}
                value={buyerName}
                onChange={(val) => setBuyerName(val)}
                placeholder="Select or type customer name..."
                searchPlaceholder="Type initial letter or customer name..."
                onRefresh={() => refetchCompanies()}
                isLoading={loadingCompanies}
                onAddNew={() => {
                  const role = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : (user?.role || "user").toLowerCase();
                  router.push(`/dashboard/${role}/companies`);
                }}
                addNewLabel="+ Register New Company"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Payment Terms</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="CREDIT">Customer Credit (Net 30)</option>
                <option value="PREPAID">Prepaid / Full Payment</option>
                <option value="COD">Cash on Delivery</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Sales Order / Invoice Ref ID</label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. SO-2026-9901"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Customer Warranty Granted</label>
              <input
                type="text"
                value={warrantyPeriod}
                onChange={(e) => setWarrantyPeriod(e.target.value)}
                placeholder="e.g. 12 Months"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Dispatch Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Dispatch notes or carrier tracking remarks..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white outline-none focus:border-amber-300/40"
            />
          </div>
        </div>

        {formError && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
            {formError}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-8 py-3.5 font-bold text-slate-950 transition hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
          >
            {loading ? "Recording Stock OUT..." : "Submit Stock OUT Dispatch"}
          </button>
        </div>
      </form>
    </div>
  );
}
