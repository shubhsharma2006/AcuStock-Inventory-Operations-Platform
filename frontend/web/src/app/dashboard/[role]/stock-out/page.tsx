"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";

type ProductItem = {
  _id: string;
  name: string;
  shortName?: string;
  serialPolicy?: {
    enableSerial?: boolean;
    requireSerialOnIN?: boolean;
    requireSerialOnOUT?: boolean;
  };
};

type Company = {
  _id: string;
  name: string;
  type?: string;
};

type AvailableSerialsResponse = {
  serials: string[];
  totalCount: number;
};

export default function StockOutPage() {
  const router = useRouter();
  const { user } = useSession();

  // Form states
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
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
  const { data: productsData } = useQuery<{ items: ProductItem[] }>({
    queryKey: ["products-list"],
    queryFn: () => apiFetch<{ items: ProductItem[] }>("/items"),
  });

  const { data: companiesData } = useQuery<{ companies: Company[] }>({
    queryKey: ["companies-list"],
    queryFn: () => apiFetch<{ companies: Company[] }>("/companies"),
  });

  // Query available in-stock serials when product is selected
  const { data: availableSerialsData, isLoading: loadingSerials } = useQuery<AvailableSerialsResponse>({
    queryKey: ["available-serials", productId],
    queryFn: () => apiFetch<AvailableSerialsResponse>(`/stock/serials/${productId}?status=available`),
    enabled: Boolean(productId),
  });

  const products = productsData?.items || [];
  const companies = companiesData?.companies || [];
  const availableSerials = availableSerialsData?.serials || [];

  const selectedProduct = products.find((p) => p._id === productId);
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

    setLoading(true);
    setFormError(null);

    try {
      await apiFetch("/stock/out", {
        method: "POST",
        body: JSON.stringify({
          productId,
          quantity: Number(quantity),
          serialNumbers: selectedSerials,
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
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">1. Select Product & Quantity to Dispatch</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Product *</label>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setSelectedSerials([]);
                }}
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              >
                <option value="">Select a product...</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.shortName ? `(${p.shortName})` : ""}
                  </option>
                ))}
              </select>
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
        </div>

        {/* Step 2: Available In-Stock Serial Selection */}
        {selectedProduct && serialPolicy.enableSerial && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
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
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">3. Buyer & Dispatch Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Buyer Company / Customer</label>
              <select
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">Select or type customer name...</option>
                {companies.map((c) => (
                  <option key={c._id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
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
