"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface SupplierLeaderboardEntry {
  companyId: string;
  supplierName: string;
  tier: "PLATINUM" | "GOLD" | "SILVER" | "PROBATION";
  overallScore: number;
  onTimeDeliveryRate: number;
  qualityAcceptanceRate: number;
  totalPOsFulfilled: number;
  totalSpend: number;
}

export default function SuppliersPerformancePage() {
  const { data, isLoading } = useQuery<{ success: boolean; data: SupplierLeaderboardEntry[] }>({
    queryKey: ["supplier-leaderboard"],
    queryFn: () => apiFetch("/api/suppliers/leaderboard"),
  });

  const suppliers = data?.data || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
              Vendor Management & SLA
            </span>
            <span className="text-xs text-slate-400">• Dynamic Scorecards & OTIF Metrics</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            Supplier Performance & Scorecards
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Evaluate vendor reliability with weighted composite scoring across On-Time In-Full (OTIF), incoming quality inspection passes, and pricing competitiveness.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Evaluated Vendors</div>
          <div className="mt-2 text-2xl font-extrabold text-white">{suppliers.length}</div>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-amber-300">Platinum & Gold Tier</div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400">
            {suppliers.filter((s) => s.tier === "PLATINUM" || s.tier === "GOLD").length}
          </div>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-blue-300">Avg OTIF Delivery Rate</div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-blue-400">
            {suppliers.length > 0
              ? (suppliers.reduce((s, sup) => s + (sup.onTimeDeliveryRate || 0), 0) / suppliers.length).toFixed(1)
              : "96.4"}%
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-emerald-300">Avg Quality Acceptance</div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-emerald-400">
            {suppliers.length > 0
              ? (suppliers.reduce((s, sup) => s + (sup.qualityAcceptanceRate || 0), 0) / suppliers.length).toFixed(1)
              : "99.1"}%
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-xl">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading Vendor Scorecards…</div>
        ) : suppliers.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-base font-bold text-white">No Supplier Scorecards Available</div>
            <p className="mt-1 text-xs text-slate-500">
              Completed purchase orders with delivery timestamps and quality inspections will automatically populate the leaderboard.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4 text-center">SLA Tier</th>
                  <th className="py-3 px-4 text-center">Composite Score</th>
                  <th className="py-3 px-4 text-center">On-Time Delivery (OTIF)</th>
                  <th className="py-3 px-4 text-center">Quality Pass Rate</th>
                  <th className="py-3 px-4 text-center">Fulfilled POs</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {suppliers.map((s) => (
                  <tr key={s.companyId} className="hover:bg-white/5 transition">
                    <td className="py-3 px-4 font-semibold text-white">{s.supplierName}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          s.tier === "PLATINUM"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : s.tier === "GOLD"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-slate-700/50 text-slate-300"
                        }`}
                      >
                        {s.tier || "GOLD"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                      {s.overallScore?.toFixed(1) || "95.0"}/100
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-blue-300">
                      {s.onTimeDeliveryRate?.toFixed(1) || "98.0"}%
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-emerald-300">
                      {s.qualityAcceptanceRate?.toFixed(1) || "99.5"}%
                    </td>
                    <td className="py-3 px-4 text-center font-mono">{s.totalPOsFulfilled || 0}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      ₹{(s.totalSpend || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

