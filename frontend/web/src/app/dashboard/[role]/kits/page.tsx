"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface KitComponent {
  productId: { _id: string; name: string; sku: string };
  quantity: number;
  scrapFactorPercent: number;
  unitCost: number;
}

interface KitRecord {
  _id: string;
  name: string;
  sku: string;
  type: string;
  components: KitComponent[];
  totalComponentCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  yieldQuantity: number;
  isActive: boolean;
}

export default function KitsPage() {
  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: KitRecord[] }>({
    queryKey: ["kits"],
    queryFn: () => apiFetch("/api/kits"),
  });

  const kits = data?.data || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
              Manufacturing & Assembly
            </span>
            <span className="text-xs text-slate-400">• Multi-Level Bill of Materials</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            Kits, Bundles & Assemblies (BOM)
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Configure component hierarchies, track sub-assembly yields, manage work orders, and automatically compute standard product build costs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Defined BOMs</div>
          <div className="mt-2 text-2xl font-extrabold text-white">{kits.length}</div>
        </div>
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-indigo-300">Active Production Kits</div>
          <div className="mt-2 text-2xl font-extrabold text-indigo-400">
            {kits.filter((k) => k.isActive).length}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-emerald-300">Avg Component Count</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">
            {kits.length > 0 ? (kits.reduce((s, k) => s + (k.components?.length || 0), 0) / kits.length).toFixed(1) : 0}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-xl">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading BOM Registry…</div>
        ) : kits.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-base font-bold text-white">No Kits or BOMs Configured</div>
            <p className="mt-1 text-xs text-slate-500">
              Create product bundle definitions with raw component requirements to begin assembling.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">BOM Name / SKU</th>
                  <th className="py-3 px-4">Assembly Type</th>
                  <th className="py-3 px-4 text-center">Components</th>
                  <th className="py-3 px-4 text-right">Labor & Overhead</th>
                  <th className="py-3 px-4 text-right">Total Build Cost</th>
                  <th className="py-3 px-4 text-center">Yield</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {kits.map((kit) => (
                  <tr key={kit._id} className="hover:bg-white/5 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{kit.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{kit.sku}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-indigo-300 border border-white/5">
                        {kit.type || "ASSEMBLY"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-amber-300">
                      {kit.components?.length || 0} parts
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      ₹{((kit.laborCost || 0) + (kit.overheadCost || 0)).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      ₹{(kit.totalCost || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {kit.yieldQuantity || 1} unit
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

