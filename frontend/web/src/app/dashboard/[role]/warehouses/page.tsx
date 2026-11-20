"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { BinHierarchyExplorer } from "@/components/warehouse/bin-hierarchy-explorer";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { ALL_INDIAN_STATES, INDIAN_STATES_AND_CITIES, TOP_ALL_INDIAN_CITIES } from "@/lib/india-geo-data";

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
  const [selectedWarehouseForTopology, setSelectedWarehouseForTopology] = useState<Warehouse | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const { data: rawWarehouses = [], isLoading, error } = useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });
  const warehouses: Warehouse[] = Array.isArray(rawWarehouses)
    ? rawWarehouses
    : ((rawWarehouses as any)?.warehouses || (rawWarehouses as any)?.data || []);

  const { data: warehouseStock = [], isLoading: isLoadingStock } = useQuery<WarehouseStockItem[]>({
    queryKey: ["warehouse-stock", selectedWarehouseForStock?._id],
    queryFn: () => apiFetch(`/warehouses/${selectedWarehouseForStock?._id}/stock`),
    enabled: !!selectedWarehouseForStock,
  });

  const filteredWarehouses = warehouses.filter((w) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      w.name.toLowerCase().includes(term) ||
      w.code.toLowerCase().includes(term) ||
      w.address?.city?.toLowerCase().includes(term) ||
      w.address?.state?.toLowerCase().includes(term)
    );
  });

  const totalCapacity = warehouses.reduce((sum, w) => sum + (w.capacity || 0), 0);
  const defaultWarehouse = warehouses.find((w) => w.isDefault) || warehouses[0];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-300 border border-amber-400/20">
                Multi-Location Engine
              </span>
              <span className="text-xs text-slate-400">SAP EWM Standard Storage Locations</span>
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Warehouses & Distribution Hubs
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              Control multi-facility stock distribution, regional fulfillment hubs, zone storage limits, and 6-level bin topology architectures.
            </p>
          </div>

          <button
            id="create-warehouse-btn"
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:from-amber-300 hover:to-orange-300"
          >
            <span>+ Add Warehouse Facility</span>
          </button>
        </div>

        {/* Executive KPI Row */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
            <div className="text-xs text-slate-400">Active Facilities</div>
            <div className="mt-1 text-2xl font-extrabold text-white">{warehouses.length}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Distribution Hubs</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="text-xs text-emerald-300">Primary Hub</div>
            <div className="mt-1 text-lg font-bold text-emerald-400 truncate">
              {defaultWarehouse ? defaultWarehouse.name : "None assigned"}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
              {defaultWarehouse?.code || "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
            <div className="text-xs text-sky-300">Total System Capacity</div>
            <div className="mt-1 text-2xl font-extrabold text-sky-400">
              {totalCapacity > 0 ? totalCapacity.toLocaleString() : "Uncapped"}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Volumetric Units</div>
          </div>
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
            <div className="text-xs text-indigo-300">Topology Engine</div>
            <div className="mt-1 text-lg font-bold text-indigo-400">6-Level Granular</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Aisle → Rack → Shelf → Bin</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 backdrop-blur-xl">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search facility name, code, or city…"
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
        <div className="text-xs text-slate-400">
          Showing <strong className="text-white">{filteredWarehouses.length}</strong> of {warehouses.length} hubs
        </div>
      </div>

      {isLoading ? <div className="text-slate-400 py-8 text-center text-sm">Loading warehouses…</div> : null}
      {error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error instanceof Error ? error.message : "Failed to load warehouses"}
        </div>
      ) : null}

      {/* Warehouse Cards Grid */}
      {!isLoading && !error ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredWarehouses.map((wh) => (
            <div
              key={wh._id}
              className="relative flex flex-col justify-between rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl transition hover:border-amber-400/40 hover:bg-slate-900/80 shadow-lg group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition">
                      {wh.name}
                    </h3>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                        {wh.code}
                      </span>
                      {wh.isDefault ? (
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/30">
                          Primary Default
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-300">
                  {wh.address?.city || wh.address?.state ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>📍</span>
                      <span>
                        {[wh.address?.street, wh.address?.city, wh.address?.state, wh.address?.zipCode]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  ) : null}

                  {wh.contactPerson ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>👤</span>
                      <span>{wh.contactPerson} {wh.phone ? `(${wh.phone})` : ""}</span>
                    </div>
                  ) : null}

                  {wh.capacity ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>📦</span>
                      <span>Capacity: <strong className="text-white font-mono">{wh.capacity.toLocaleString()}</strong> units</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500">
                      <span>📦</span>
                      <span>Capacity: Standard Storage Pool</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between border-t border-white/10 pt-4 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="warehouse-twin"
                    className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition flex items-center gap-1.5"
                  >
                    <span>🏬</span>
                    <span>3D Twin</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedWarehouseForTopology(wh)}
                    className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition flex items-center gap-1.5"
                  >
                    <span>🗺️</span>
                    <span>Topology</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedWarehouseForStock(wh)}
                    className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition"
                  >
                    Stock →
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(wh.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}

          {filteredWarehouses.length === 0 && warehouses.length > 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-400">
              <p className="font-semibold text-white">No facilities match your search criteria</p>
              <button
                onClick={() => setSearchTerm("")}
                className="mt-2 text-xs text-amber-400 hover:underline"
              >
                Clear filter
              </button>
            </div>
          ) : null}

          {warehouses.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-400">
              <div className="text-3xl mb-2">🏢</div>
              <p className="font-semibold text-white">No warehouses registered yet</p>
              <p className="text-xs text-slate-500 mt-1">Create your first warehouse or distribution center above.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 6-Level Bin Hierarchy Explorer (SAP EWM Storage Location Standard) */}
      {selectedWarehouseForTopology ? (
        <BinHierarchyExplorer
          warehouseId={selectedWarehouseForTopology._id}
          warehouseName={selectedWarehouseForTopology.name}
          warehouseCode={selectedWarehouseForTopology.code}
          onClose={() => setSelectedWarehouseForTopology(null)}
        />
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

  const warehouseCityOptions = useMemo(() => {
    if (state && INDIAN_STATES_AND_CITIES[state]) {
      return INDIAN_STATES_AND_CITIES[state];
    }
    return TOP_ALL_INDIAN_CITIES;
  }, [state]);
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

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Street Address</label>
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Plot 45, MIDC Phase 2"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <TypeaheadInput
                label="State"
                value={state}
                onChange={(val) => setState(val)}
                options={ALL_INDIAN_STATES}
                placeholder="Type or select State…"
              />
            </div>
            <div>
              <TypeaheadInput
                label="City"
                value={city}
                onChange={(val) => setCity(val)}
                options={warehouseCityOptions}
                placeholder="Type or select City…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
