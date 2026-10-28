"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { BarcodeRmaModal } from "@/components/barcode/barcode-rma-modal";

type SerialSearchResult = {
  serial: string;
  status: "in-stock" | "out-of-stock";
  lastAction: "IN" | "OUT";
  lastActionAt: string;
  productId?: string;
  productName?: string;
  productShortName?: string;
  actorName?: string;
};

type PerProductSummary = {
  productId?: string;
  productName?: string;
  productShortName?: string;
  inStock: number;
  outOfStock: number;
};

type SerialSearchResponse = {
  query: string;
  totalMatches: number;
  perProduct: PerProductSummary[];
  results: SerialSearchResult[];
};

export default function SerialManagementPage() {
  const [query, setQuery] = useState("");
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<SerialSearchResponse>({
    queryKey: ["serial-search", query],
    queryFn: () =>
      apiFetch<SerialSearchResponse>(`/stock/serial/search?q=${encodeURIComponent(query || "A")}`),
    enabled: true,
  });

  const results = data?.results || [];
  const summary = data?.perProduct || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
            🔍 Serial Tracking & Audit
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">Serial Number Management</h1>
          <p className="text-sm text-slate-400">
            Search serial numbers, verify global uniqueness, and inspect full lifecycle audit histories.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("open-barcode-scanner"));
            }
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-amber-300 hover:to-orange-400 transition cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <span>📷 Scan Barcode / RMA (Alt+B)</span>
        </button>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-slate-400">Matching Serials</div>
          <div className="mt-2 text-3xl font-bold text-white">{data?.totalMatches || 0}</div>
          <div className="mt-1 text-xs text-slate-400">Total serial records found</div>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-emerald-400">Currently In-Stock</div>
          <div className="mt-2 text-3xl font-bold text-emerald-300">
            {results.filter((r) => r.status === "in-stock").length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Available for Stock OUT</div>
        </div>

        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 backdrop-blur-xl">
          <div className="text-xs uppercase tracking-wider text-sky-400">Dispatched / Out</div>
          <div className="mt-2 text-3xl font-bold text-sky-300">
            {results.filter((r) => r.status === "out-of-stock").length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Dispatched to buyers</div>
        </div>
      </div>

      {/* Live Search Bar */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type serial number to lookup (e.g. SN-1002, ABC9988)..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 pl-11 text-sm text-white outline-none focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
          />
          <svg className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Results */}
      {isLoading && <div className="p-8 text-center text-slate-400">Searching serial audit ledger...</div>}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          {summary.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">Product Summary Breakdown</h3>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {summary.map((s, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
                    <div className="font-semibold text-white">{s.productName || "Unknown Product"}</div>
                    <div className="mt-1 flex justify-between text-slate-400">
                      <span className="text-emerald-400 font-medium">In-Stock: {s.inStock}</span>
                      <span className="text-sky-400 font-medium">Dispatched: {s.outOfStock}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4">Serial Number</th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4">Current Status</th>
                  <th className="px-6 py-4">Last Movement</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {results.map((r, idx) => (
                  <tr key={idx} className="transition hover:bg-white/5">
                    <td className="px-6 py-4 font-mono font-bold text-amber-300">
                      {r.serial}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{r.productName || "Product"}</div>
                      {r.productShortName && <div className="text-xs text-slate-400">{r.productShortName}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          r.status === "in-stock"
                            ? "bg-emerald-400/10 text-emerald-400"
                            : "bg-sky-400/10 text-sky-300"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${r.status === "in-stock" ? "bg-emerald-400" : "bg-sky-400"}`} />
                        {r.status === "in-stock" ? "Available IN-Stock" : "Dispatched OUT"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      <div>{r.lastActionAt ? new Date(r.lastActionAt).toLocaleString() : "N/A"}</div>
                      {r.actorName && <div className="text-[11px] text-slate-500">By: {r.actorName}</div>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedSerial(r.serial)}
                        className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition cursor-pointer"
                      >
                        🔍 Inspect & RMA
                      </button>
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No serial numbers found matching &quot;{query}&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Barcode RMA Lifecycle Modal */}
      {selectedSerial && (
        <BarcodeRmaModal
          isOpen={Boolean(selectedSerial)}
          initialCode={selectedSerial}
          onClose={() => setSelectedSerial(null)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}
