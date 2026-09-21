"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface Warehouse {
  _id: string;
  name: string;
  code: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  contactPerson?: string;
  phone?: string;
  email?: string;
  isDefault: boolean;
  isActive: boolean;
  capacity?: number;
  notes?: string;
  createdAt: string;
}

interface WarehouseStockItem {
  productId: string;
  currentStock: number;
  totalIn: number;
  totalOut: number;
  product?: {
    name: string;
    sku?: string;
    uom?: string;
  };
}

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWarehouseForStock, setSelectedWarehouseForStock] = useState<Warehouse | null>(null);

  const { data: warehouses = [], isLoading, error } = useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  const { data: warehouseStock = [], isLoading: isLoadingStock } = useQuery<WarehouseStockItem[]>({
    queryKey: ["warehouse-stock", selectedWarehouseForStock?._id],
    queryFn: () => apiFetch(`/warehouses/${selectedWarehouseForStock?._id}/stock`),
    enabled: !!selectedWarehouseForStock,
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Multi-Location Engine</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">Warehouses & Hubs</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage multi-location physical inventory, regional distribution hubs, and zone capacities.
          </p>
        </div>
        <button
          id="create-warehouse-btn"
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
        >
          <span>+ Add Warehouse</span>
        </button>
      </div>

      {isLoading ? <div className="text-slate-400">Loading warehouses…</div> : null}
      {error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error instanceof Error ? error.message : "Failed to load warehouses"}
        </div>
      ) : null}

      {/* Warehouse Cards Grid */}
      {!isLoading && !error ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((wh) => (
            <div
              key={wh._id}
              className="relative flex flex-col justify-between rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-amber-400/30"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-white">{wh.name}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                        {wh.code}
                      </span>
                      {wh.isDefault ? (
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                          Primary Default
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1 text-xs text-slate-300">
                  {wh.address?.city || wh.address?.state ? (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span>📍</span>
                      <span>
                        {[wh.address?.street, wh.address?.city, wh.address?.state, wh.address?.zipCode]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  ) : null}

                  {wh.contactPerson ? (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span>👤</span>
                      <span>{wh.contactPerson} {wh.phone ? `(${wh.phone})` : ""}</span>
                    </div>
                  ) : null}

                  {wh.capacity ? (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span>📦</span>
                      <span>Capacity: {wh.capacity.toLocaleString()} units</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedWarehouseForStock(wh)}
                  className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition"
                >
                  View Stock Balances →
                </button>
                <span className="text-xs text-slate-500">
                  {new Date(wh.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}

          {warehouses.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-400">
              <div className="text-3xl mb-2">🏢</div>
              <p className="font-semibold text-white">No warehouses registered yet</p>
              <p className="text-xs text-slate-500 mt-1">Create your first warehouse or distribution center above.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Stock Balances Drilldown Drawer / Modal */}
      {selectedWarehouseForStock ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Stock at {selectedWarehouseForStock.name}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Location Code: {selectedWarehouseForStock.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWarehouseForStock(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {isLoadingStock ? <div className="p-8 text-center text-slate-400">Loading stock balances…</div> : null}

            {!isLoadingStock ? (
              <div className="mt-4">
                {warehouseStock.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr>
                          <th className="py-2.5">Product</th>
                          <th className="py-2.5">SKU</th>
                          <th className="py-2.5 text-right">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {warehouseStock.map((row) => (
                          <tr key={row.productId} className="hover:bg-white/[0.02]">
                            <td className="py-3 text-white font-medium">
                              {row.product?.name || "Unknown Product"}
                            </td>
                            <td className="py-3 font-mono text-xs text-amber-300">
                              {row.product?.sku || "—"}
                            </td>
                            <td className="py-3 text-right font-bold text-emerald-400">
                              {row.currentStock} {row.product?.uom || "PCS"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    No active stock recorded at this warehouse yet.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Create Warehouse Modal */}
      {showCreateModal ? (
        <CreateWarehouseModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["warehouses"] })}
        />
      ) : null}
    </div>
  );
}

function CreateWarehouseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: object) => apiFetch("/warehouses", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create warehouse"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Warehouse name is required");
      return;
    }
    if (!code.trim()) {
      setError("Warehouse code is required");
      return;
    }

    mutation.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      address: {
        street: street.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
      },
      contactPerson: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      isDefault,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">Create New Warehouse</h3>
            <p className="text-xs text-slate-400 mt-0.5">Register a storage facility or regional dispatch hub</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Warehouse Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pune Central Depot"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Location Code *</label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WH-PUN-01"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-amber-300 outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Street Address</label>
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Plot 45, MIDC Phase 2"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Pune"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">State</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Maharashtra"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">PIN / Zip Code</label>
              <input
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="411001"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Capacity (units)</label>
              <input
                type="number"
                min="0"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="50000"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Contact Manager</label>
              <input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Rajesh Verma"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-white/20 bg-slate-950 text-amber-400"
            />
            <label htmlFor="isDefault" className="text-xs text-slate-300 select-none">
              Set as Default Warehouse for Stock IN
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {mutation.isPending ? "Creating…" : "Save Warehouse"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
