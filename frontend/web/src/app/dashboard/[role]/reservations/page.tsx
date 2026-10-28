"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type ReservationItem = {
  _id: string;
  itemId: {
    _id: string;
    name: string;
    sku?: string;
  } | string;
  warehouseId?: {
    _id: string;
    name: string;
    code?: string;
  } | string;
  quantity: number;
  status: "ACTIVE" | "FULFILLED" | "RELEASED" | "EXPIRED";
  reference?: string;
  notes?: string;
  expiresAt: string;
  releasedAt?: string;
  fulfilledAt?: string;
  createdAt: string;
};

type CatalogItem = {
  _id: string;
  name: string;
  sku?: string;
  currentStock?: number;
};

type WarehouseItem = {
  _id: string;
  name: string;
  code?: string;
};

export default function StockReservationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Hold Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [holdQuantity, setHoldQuantity] = useState(1);
  const [holdMinutes, setHoldMinutes] = useState("60");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Queries
  const { data: reservationsData, isLoading: reservationsLoading } = useQuery({
    queryKey: ["reservations", statusFilter],
    queryFn: () =>
      apiFetch<{ success: boolean; reservations: ReservationItem[] }>(
        `/reservations${statusFilter && statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`
      ),
    refetchInterval: 10000,
  });

  const { data: itemsData } = useQuery({
    queryKey: ["products-list"],
    queryFn: () => apiFetch<CatalogItem[] | { items: CatalogItem[] }>("/items"),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch<WarehouseItem[] | { warehouses: WarehouseItem[] }>("/warehouses"),
  });

  const itemsList: CatalogItem[] = Array.isArray(itemsData)
    ? itemsData
    : itemsData?.items || [];

  const warehousesList: WarehouseItem[] = Array.isArray(warehousesData)
    ? warehousesData
    : warehousesData?.warehouses || [];

  // Mutations
  const createReservationMutation = useMutation({
    mutationFn: (body: {
      itemId: string;
      warehouseId?: string;
      quantity: number;
      holdDurationMinutes: number;
      reference?: string;
      notes?: string;
    }) =>
      apiFetch("/reservations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      setModalOpen(false);
      setSelectedItemId("");
      setSelectedWarehouseId("");
      setHoldQuantity(1);
      setReference("");
      setNotes("");
      setCreateError(null);
    },
    onError: (err: any) => {
      setCreateError(err.message || "Failed to create reservation. Insufficient unreserved stock.");
    },
  });

  const releaseReservationMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch(`/reservations/${id}/release`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  const fulfillReservationMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiFetch(`/reservations/${id}/fulfill`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  function handleCreateHold() {
    setCreateError(null);
    if (!selectedItemId) {
      setCreateError("Please select a catalog item.");
      return;
    }
    if (holdQuantity <= 0) {
      setCreateError("Hold quantity must be at least 1.");
      return;
    }

    createReservationMutation.mutate({
      itemId: selectedItemId,
      warehouseId: selectedWarehouseId || undefined,
      quantity: holdQuantity,
      holdDurationMinutes: parseInt(holdMinutes) || 60,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  // Filter reservations
  const allReservations = reservationsData?.reservations || [];
  const filteredReservations = allReservations.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const itemName = typeof r.itemId === "object" ? r.itemId.name : "";
    const itemSku = typeof r.itemId === "object" ? r.itemId.sku || "" : "";
    const ref = r.reference || "";
    return itemName.toLowerCase().includes(q) || itemSku.toLowerCase().includes(q) || ref.toLowerCase().includes(q);
  });

  // Calculate metrics
  const activeHolds = allReservations.filter((r) => r.status === "ACTIVE");
  const totalLockedUnits = activeHolds.reduce((acc, r) => acc + (r.quantity || 0), 0);
  const fulfilledCount = allReservations.filter((r) => r.status === "FULFILLED").length;
  const releasedCount = allReservations.filter((r) => r.status === "RELEASED" || r.status === "EXPIRED").length;

  function getTimeRemaining(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m left`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Stock Holds & Soft Locks
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
              ATP Engine
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Prevent overselling during quotes, cart checkouts, and pending transfers by temporarily locking inventory from the Available-To-Promise pool.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateError(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Stock Hold
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Holds</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{activeHolds.length}</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">Currently soft-locking stock</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Locked Units (ATP Impact)</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{totalLockedUnits}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Excluded from free dispatch</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Fulfilled Holds</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{fulfilledCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Dispatched into Stock OUT</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Released / Expired</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{releasedCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Auto-restored to ATP pool</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-medium">
          {["ACTIVE", "ALL", "FULFILLED", "RELEASED", "EXPIRED"].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === tab
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {tab === "ACTIVE" ? "Active Holds" : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by SKU, product, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {reservationsLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading stock holds...</div>
        ) : filteredReservations.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No stock reservations found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              There are no {statusFilter.toLowerCase()} reservations matching your filter. Create a soft-lock to hold items for checkout.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Reference / Hold ID</th>
                  <th className="px-4 py-3">Catalog Item</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">TTL Expiry</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReservations.map((r) => {
                  const itemName = typeof r.itemId === "object" ? r.itemId.name : "Item #" + r.itemId;
                  const itemSku = typeof r.itemId === "object" ? r.itemId.sku : "";
                  const warehouseName =
                    typeof r.warehouseId === "object" && r.warehouseId
                      ? r.warehouseId.name
                      : "Default Warehouse";

                  return (
                    <tr key={r._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.reference || "Manual Hold"}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 truncate max-w-xs">
                          {r._id}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {itemName}
                        </div>
                        {itemSku && (
                          <div className="font-mono text-xs text-slate-500">SKU: {itemSku}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {warehouseName}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                        {r.quantity}
                      </td>
                      <td className="px-4 py-3.5">
                        {r.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active Hold
                          </span>
                        ) : r.status === "FULFILLED" ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            Fulfilled
                          </span>
                        ) : r.status === "RELEASED" ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                            Released
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Expired
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {r.status === "ACTIVE" ? (
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">
                            {getTimeRemaining(r.expiresAt)}
                          </span>
                        ) : (
                          <span>{new Date(r.expiresAt).toLocaleTimeString()}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-2">
                        {r.status === "ACTIVE" && (
                          <>
                            <button
                              onClick={() => {
                                if (confirm("Release this hold early and return stock to the Available-To-Promise pool?")) {
                                  releaseReservationMutation.mutate({ id: r._id, reason: "Manual user release" });
                                }
                              }}
                              className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium transition"
                            >
                              Release
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Mark this reservation as fulfilled?")) {
                                  fulfillReservationMutation.mutate({ id: r._id });
                                }
                              }}
                              className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium transition"
                            >
                              Fulfill
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Stock Hold */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Create Stock Soft-Lock</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hold inventory for checkout or customer quotation</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Catalog Product *
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                >
                  <option value="">-- Choose Item --</option>
                  {itemsList.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} {item.sku ? `(${item.sku})` : ""} - Stock: {item.currentStock ?? "?"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Warehouse Location (Optional)
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                >
                  <option value="">All / Primary Warehouse</option>
                  {warehousesList.map((wh) => (
                    <option key={wh._id} value={wh._id}>
                      {wh.name} {wh.code ? `(${wh.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hold Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={holdQuantity}
                    onChange={(e) => setHoldQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hold TTL Duration
                  </label>
                  <select
                    value={holdMinutes}
                    onChange={(e) => setHoldMinutes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                  >
                    <option value="15">15 Minutes (Cart hold)</option>
                    <option value="30">30 Minutes</option>
                    <option value="60">1 Hour (Recommended)</option>
                    <option value="240">4 Hours</option>
                    <option value="1440">24 Hours (Quote hold)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reference / Order ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. CART-8472 or QUOTE-2026-001"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Internal Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Reason for stock reservation..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateHold}
                disabled={!selectedItemId || holdQuantity <= 0 || createReservationMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition"
              >
                {createReservationMutation.isPending ? "Locking Stock..." : "Confirm Reservation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
