"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

type WarrantyStats = {
  purchase: { active: number; expiringSoon: number; expired: number };
  seller: { active: number; expiringSoon: number; expired: number };
  notSold: number;
};

type WarrantyItem = {
  _id: string;
  serialNumber: string;
  productId?: { name: string; shortName?: string };
  purchaseWarranty?: { months: number; status: string; expiresAt?: string };
  sellerWarranty?: { months: number; status: string; expiresAt?: string };
  createdAt?: string;
};

export default function WarrantyPage() {
  const [searchSerial, setSearchSerial] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "expiring">("all");

  const { data: stats } = useQuery<WarrantyStats>({
    queryKey: ["warranty-stats"],
    queryFn: () => apiFetch<WarrantyStats>("/warranty/stats"),
  });

  const { data: rawWarranties, isLoading, error } = useQuery({
    queryKey: ["warranties", activeTab, searchSerial],
    queryFn: () =>
      apiFetch<any>(
        `/warranty?${activeTab !== "all" ? `status=${activeTab}` : ""}${searchSerial ? `&search=${encodeURIComponent(searchSerial)}` : ""}`
      ),
  });

  const warranties: WarrantyItem[] = Array.isArray(rawWarranties)
    ? rawWarranties
    : Array.isArray(rawWarranties?.warranties)
    ? rawWarranties.warranties
    : [];

  function badgeColor(status?: string) {
    if (status === "active") return "bg-emerald-400/10 text-emerald-300 border-emerald-400/20";
    if (status === "expiring-soon") return "bg-amber-400/10 text-amber-300 border-amber-400/20";
    if (status === "expired") return "bg-rose-400/10 text-rose-300 border-rose-400/20";
    return "bg-slate-400/10 text-slate-400 border-slate-400/20";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">🛡️ Serial Warranty Tracking</h1>
          <p className="text-sm text-slate-400">
            Track purchase and seller warranty expiration dates across all serial-tracked inventory.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-emerald-300">Active Warranties</div>
          <div className="mt-2 text-3xl font-bold text-white">
            {(stats?.purchase.active || 0) + (stats?.seller.active || 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Valid & protected units</div>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-amber-300">Expiring Soon (30 Days)</div>
          <div className="mt-2 text-3xl font-bold text-amber-200">
            {(stats?.purchase.expiringSoon || 0) + (stats?.seller.expiringSoon || 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Requires renewal check</div>
        </div>

        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-rose-300">Expired Warranties</div>
          <div className="mt-2 text-3xl font-bold text-rose-200">
            {(stats?.purchase.expired || 0) + (stats?.seller.expired || 0)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Coverage ended</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <input
          type="text"
          value={searchSerial}
          onChange={(e) => setSearchSerial(e.target.value)}
          placeholder="Lookup serial number or product name..."
          className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
        />

        <div className="flex rounded-xl border border-white/10 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "all" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "active" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            Active Only
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expiring")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "expiring" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            Expiring Soon
          </button>
        </div>
      </div>

      {isLoading && <div className="p-8 text-center text-slate-400">Loading warranty records...</div>}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4">Serial Number</th>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Purchase Warranty</th>
                <th className="px-6 py-4">Seller Warranty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {warranties.map((w) => (
                <tr key={w._id} className="transition hover:bg-white/5">
                  <td className="px-6 py-4 font-mono font-bold text-amber-300">{w.serialNumber}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{w.productId?.name || "Unknown Product"}</div>
                    {w.productId?.shortName && <div className="text-xs text-slate-400">{w.productId.shortName}</div>}
                  </td>
                  <td className="px-6 py-4">
                    {w.purchaseWarranty ? (
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${badgeColor(w.purchaseWarranty.status)}`}>
                        {w.purchaseWarranty.months} mo ({w.purchaseWarranty.status})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {w.sellerWarranty ? (
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${badgeColor(w.sellerWarranty.status)}`}>
                        {w.sellerWarranty.months} mo ({w.sellerWarranty.status})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Not Sold</span>
                    )}
                  </td>
                </tr>
              ))}
              {warranties.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No warranty records match your query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
