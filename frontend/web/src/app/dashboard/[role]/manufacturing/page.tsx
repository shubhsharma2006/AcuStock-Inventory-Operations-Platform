"use client";

import React, { useState, useEffect } from "react";
import {
  Factory,
  Cpu,
  Layers,
  Wrench,
  Clock,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  Package,
  ShoppingCart,
  Calendar,
  DollarSign,
  Plus,
  RefreshCw,
  GitFork,
  Activity,
  ChevronRight,
  ListOrdered,
} from "@/components/ui/icons";
import { CreateWorkCenterModal } from "@/components/manufacturing/create-work-center-modal";
import { MrpExecuteModal } from "@/components/manufacturing/mrp-execute-modal";

interface WorkCenter {
  _id: string;
  code: string;
  name: string;
  type: string;
  hourlyLaborCost: number;
  hourlyMachineCost: number;
  capacityHoursPerDay: number;
  efficiencyRatingPercent: number;
  isActive: boolean;
}

interface KitItem {
  _id: string;
  type: string;
  name?: string;
  parentItemId?: {
    _id: string;
    sku: string;
    name: string;
    salesPrice?: number;
    purchasePrice?: number;
    uom?: string;
  };
  components?: Array<any>;
  routingOperations?: Array<any>;
}

export default function ManufacturingPage() {
  const [activeTab, setActiveTab] = useState<"mrp" | "bom" | "routing" | "workcenters">("mrp");
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [kits, setKits] = useState<KitItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isWorkCenterModalOpen, setIsWorkCenterModalOpen] = useState(false);
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);

  // Tab 1: MRP Run state
  const [selectedMrpItemId, setSelectedMrpItemId] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("10");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [mrpLoading, setMrpLoading] = useState(false);
  const [mrpResult, setMrpResult] = useState<any | null>(null);
  const [mrpError, setMrpError] = useState<string | null>(null);

  // Tab 2: BOM Exploder state
  const [selectedBomKitId, setSelectedBomKitId] = useState("");
  const [bomExplosion, setBomExplosion] = useState<any | null>(null);
  const [bomLoading, setBomLoading] = useState(false);

  // Tab 3: Routing Operations state
  const [selectedRoutingKitId, setSelectedRoutingKitId] = useState("");
  const [routingData, setRoutingData] = useState<any | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  const fetchWorkCenters = async () => {
    try {
      const res = await fetch("/api/manufacturing/work-centers");
      const data = await res.json();
      if (res.ok) {
        setWorkCenters(data.workCenters || []);
      }
    } catch (e) {
      console.error("Failed to fetch work centers", e);
    }
  };

  const fetchKits = async () => {
    try {
      const res = await fetch("/api/kits");
      const data = await res.json();
      if (res.ok) {
        const list: KitItem[] = data.kits || [];
        setKits(list);
        if (list.length > 0) {
          if (!selectedMrpItemId && list[0].parentItemId?._id) {
            setSelectedMrpItemId(list[0].parentItemId._id);
          }
          if (!selectedBomKitId && list[0].parentItemId?._id) {
            setSelectedBomKitId(list[0].parentItemId._id);
          }
          if (!selectedRoutingKitId && list[0]._id) {
            setSelectedRoutingKitId(list[0]._id);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch kits", e);
    }
  };

  useEffect(() => {
    Promise.all([fetchWorkCenters(), fetchKits()]).finally(() => setLoading(false));
  }, []);

  // Run MRP Calculation
  const handleRunMrp = async () => {
    if (!selectedMrpItemId) {
      setMrpError("Please select a target assembly or kit item.");
      return;
    }
    setMrpLoading(true);
    setMrpError(null);
    try {
      const res = await fetch("/api/manufacturing/mrp/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetItemId: selectedMrpItemId,
          targetQuantity: parseFloat(targetQuantity) || 1,
          targetCompletionDate: targetDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to calculate MRP");
      }
      setMrpResult(data);
    } catch (err: any) {
      setMrpError(err.message || "Failed to execute MRP calculation");
    } finally {
      setMrpLoading(false);
    }
  };

  // Explode BOM
  const handleExplodeBom = async (itemId: string) => {
    if (!itemId) return;
    setBomLoading(true);
    try {
      const res = await fetch(`/api/manufacturing/bom/explode/${itemId}?quantity=1`);
      const data = await res.json();
      if (res.ok) {
        setBomExplosion(data);
      }
    } catch (e) {
      console.error("Failed to explode BOM", e);
    } finally {
      setBomLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBomKitId) {
      handleExplodeBom(selectedBomKitId);
    }
  }, [selectedBomKitId]);

  // Fetch Routing
  const handleFetchRouting = async (kitId: string) => {
    if (!kitId) return;
    setRoutingLoading(true);
    try {
      const res = await fetch(`/api/manufacturing/routing/${kitId}`);
      const data = await res.json();
      if (res.ok) {
        setRoutingData(data);
      }
    } catch (e) {
      console.error("Failed to load routing", e);
    } finally {
      setRoutingLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRoutingKitId) {
      handleFetchRouting(selectedRoutingKitId);
    }
  }, [selectedRoutingKitId]);

  const totalCapacityHours = workCenters.reduce((sum, wc) => sum + (wc.capacityHoursPerDay || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Factory className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Manufacturing & MRP</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Material Requirements Planning (MRP II), Recursive BOM Explosion, Lead-Time Back-Scheduling & Routing
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsWorkCenterModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Work Center</span>
          </button>
          <button
            onClick={() => setActiveTab("mrp")}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow-sm flex items-center gap-2"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Plan Production Run</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Shop-Floor Work Centers</span>
            <Factory className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{workCenters.length}</div>
          <span className="text-[11px] text-slate-500">Active machine / labor cells</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Daily Total Capacity</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{totalCapacityHours} hrs/day</div>
          <span className="text-[11px] text-slate-500">Available across all lines</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Manufactured Assemblies</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{kits.length}</div>
          <span className="text-[11px] text-slate-500">Multi-level BOM definitions</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">MRP Engine Status</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">Active</div>
          <span className="text-[11px] text-slate-500">Net requirement back-scheduling</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveTab("mrp")}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "mrp"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <PlayCircle className="w-4 h-4" />
          <span>1. MRP Planning & Net Requirements</span>
        </button>

        <button
          onClick={() => setActiveTab("bom")}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "bom"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <GitFork className="w-4 h-4" />
          <span>2. Indented Multi-Level BOM Exploder</span>
        </button>

        <button
          onClick={() => setActiveTab("routing")}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "routing"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          <span>3. Shop-Floor Operations Routing</span>
        </button>

        <button
          onClick={() => setActiveTab("workcenters")}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "workcenters"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Factory className="w-4 h-4" />
          <span>4. Work Centers & Machine Rates</span>
        </button>
      </div>

      {/* TAB 1: MRP ENGINE */}
      {activeTab === "mrp" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-indigo-400" />
              <span>Configure MRP Calculation Parameters</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Target Finished Assembly / Kit
                </label>
                <select
                  value={selectedMrpItemId}
                  onChange={(e) => setSelectedMrpItemId(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select assembly to build...</option>
                  {kits.map((k) => (
                    <option key={k._id} value={k.parentItemId?._id || k._id}>
                      {k.parentItemId ? `${k.parentItemId.sku} — ${k.parentItemId.name}` : k.name || k._id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Target Run Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Required Delivery Date</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {mrpError && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{mrpError}</span>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={handleRunMrp}
                disabled={mrpLoading}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 rounded-lg transition shadow-md flex items-center gap-2"
              >
                {mrpLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Exploding BOM & Calculating Net Requirements...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Run MRP Calculation Engine</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results display */}
          {mrpResult && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Summary Bar */}
              <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">{mrpResult.summary?.targetAssembly}</h4>
                  <p className="text-xs text-slate-400">
                    Net Shortages: <span className="text-rose-400 font-semibold">{mrpResult.summary?.totalShortages} items</span> •{" "}
                    Planned Work Orders: <span className="text-amber-400 font-semibold">{mrpResult.summary?.plannedWorkOrdersCount}</span> •{" "}
                    Planned Purchase Requisitions: <span className="text-blue-400 font-semibold">{mrpResult.summary?.plannedPurchaseOrdersCount}</span>
                  </p>
                </div>

                <button
                  onClick={() => setIsExecuteModalOpen(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition shadow-sm flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Review & Release Production Schedule</span>
                </button>
              </div>

              {/* Net Requirements / Shortages Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-rose-400" />
                    <span>Net Material Deficits & Shortages</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Component / SKU</th>
                        <th className="px-4 py-3 text-right">Gross Needed</th>
                        <th className="px-4 py-3 text-right">On Hand</th>
                        <th className="px-4 py-3 text-right">On Order</th>
                        <th className="px-4 py-3 text-right">Net Deficit</th>
                        <th className="px-4 py-3">Source Type</th>
                        <th className="px-4 py-3">Action Required</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(!mrpResult.shortages || mrpResult.shortages.length === 0) ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-slate-500 text-xs">
                            No net material shortages found. All components exist in inventory!
                          </td>
                        </tr>
                      ) : (
                        mrpResult.shortages.map((s: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-slate-200">
                              <span className="font-semibold text-indigo-300 font-mono">{s.sku}</span>
                              <div className="text-[10px] text-slate-400">{s.name}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-300">{s.grossRequired}</td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-400">{s.onHandStock}</td>
                            <td className="px-4 py-3 text-right font-mono text-blue-400">{s.onOrderStock}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">{s.netDeficit}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                                  s.isManufactured
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                }`}
                              >
                                {s.isManufactured ? "MANUFACTURED" : "PURCHASED"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-xs text-slate-200">
                              {s.isManufactured ? (
                                <span className="text-amber-400">Generate Work Order</span>
                              ) : (
                                <span className="text-blue-400">Raise Purchase Requisition</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Back-scheduled Work Orders and POs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Planned Work Orders */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      Planned Work Orders ({mrpResult.plannedWorkOrders?.length || 0})
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {mrpResult.plannedWorkOrders?.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No manufacturing work orders required.</p>
                    ) : (
                      mrpResult.plannedWorkOrders?.map((wo: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-amber-300 font-mono">{wo.sku}</span>
                            <span className="font-bold text-slate-100">{wo.quantity} units</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{wo.name}</div>
                          <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                            <span>Start: {wo.startDate ? new Date(wo.startDate).toLocaleDateString() : "-"}</span>
                            <span className="text-emerald-400">Due: {wo.dueDate ? new Date(wo.dueDate).toLocaleDateString() : "-"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Planned Purchase Orders */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      Planned Purchase Requisitions ({mrpResult.plannedPurchaseOrders?.length || 0})
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {mrpResult.plannedPurchaseOrders?.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No purchase orders required.</p>
                    ) : (
                      mrpResult.plannedPurchaseOrders?.map((po: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-blue-300 font-mono">{po.sku}</span>
                            <span className="font-bold text-slate-100">{po.quantity} units</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{po.name}</div>
                          <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                            <span>PO Release: {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : "-"}</span>
                            <span className="text-blue-400">Need Date: {po.requiredDate ? new Date(po.requiredDate).toLocaleDateString() : "-"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BOM EXPLODER */}
      {activeTab === "bom" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex-1 max-w-md w-full">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Select Assembly to View Multi-Level BOM Structure
              </label>
              <select
                value={selectedBomKitId}
                onChange={(e) => setSelectedBomKitId(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                {kits.map((k) => (
                  <option key={k._id} value={k.parentItemId?._id || k._id}>
                    {k.parentItemId ? `${k.parentItemId.sku} — ${k.parentItemId.name}` : k.name || k._id}
                  </option>
                ))}
              </select>
            </div>

            {bomExplosion && (
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Total Component Cost</span>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    ${(bomExplosion.totalCost || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Exploded Components</span>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {bomExplosion.components?.length || 0} items
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Indented BOM Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Indented Multi-Level Bill of Materials
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Level & SKU</th>
                    <th className="px-4 py-3">Component Description</th>
                    <th className="px-4 py-3 text-right">Net Qty</th>
                    <th className="px-4 py-3 text-right">Scrap %</th>
                    <th className="px-4 py-3 text-right">Gross Qty</th>
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-right">Ext Cost</th>
                    <th className="px-4 py-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {bomLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">
                        Exploding BOM hierarchy...
                      </td>
                    </tr>
                  ) : !bomExplosion?.components || bomExplosion.components.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">
                        No BOM components found for this item.
                      </td>
                    </tr>
                  ) : (
                    bomExplosion.components.map((comp: any, idx: number) => {
                      const indentClass =
                        comp.level === 0
                          ? "pl-4"
                          : comp.level === 1
                          ? "pl-8 text-indigo-300"
                          : comp.level === 2
                          ? "pl-12 text-blue-300"
                          : "pl-16 text-slate-400";

                      return (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className={`px-4 py-3 ${indentClass}`}>
                            <div className="flex items-center gap-1.5">
                              {comp.level > 0 && <span className="text-slate-600 font-sans">↳ Level {comp.level}:</span>}
                              <span className="font-bold">{comp.sku}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-sans">{comp.name}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{comp.quantity}</td>
                          <td className="px-4 py-3 text-right text-amber-400 font-semibold">{comp.scrapFactorPercent || 0}%</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-100">{comp.grossQuantity?.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-slate-400">${(comp.unitCost || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-bold">${(comp.extendedCost || 0).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 text-[10px] rounded font-semibold font-sans ${
                                comp.isManufactured
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {comp.isManufactured ? "SUB-ASSEMBLY" : "RAW MATERIAL"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROUTING OPERATIONS */}
      {activeTab === "routing" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex-1 max-w-md w-full">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Select Kit / Product for Routing Operations
              </label>
              <select
                value={selectedRoutingKitId}
                onChange={(e) => setSelectedRoutingKitId(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                {kits.map((k) => (
                  <option key={k._id} value={k._id}>
                    {k.parentItemId ? `${k.parentItemId.sku} — ${k.parentItemId.name}` : k.name || k._id}
                  </option>
                ))}
              </select>
            </div>

            {routingData && (
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Total Routing Cost / Unit</span>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    ${(routingData.totalRoutingCostPerUnit || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Operation Steps</span>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {routingData.operations?.length || 0} stages
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Operations List */}
          <div className="space-y-3">
            {routingLoading ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                Loading routing operations...
              </div>
            ) : !routingData?.operations || routingData.operations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                No shop-floor routing operations configured for this kit yet.
              </div>
            ) : (
              routingData.operations.map((op: any, i: number) => (
                <div
                  key={i}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 text-sm">
                      {op.sequence}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">{op.operationName}</h4>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <Factory className="w-3.5 h-3.5 text-blue-400" />
                        <span>Work Center: {op.workCenterId?.name || op.workCenterId?.code || "Standard Cell"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">Setup Time</span>
                      <span className="text-slate-300 font-semibold">{op.setupTimeMinutes || 0} mins</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">Run Time / Unit</span>
                      <span className="text-slate-300 font-semibold">{op.runTimeMinutesPerUnit || 0} mins</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">Labor Cost</span>
                      <span className="text-slate-300">${(op.laborCostPerUnit || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 block font-sans">Step Total</span>
                      <span className="text-emerald-400 font-bold">${(op.totalCostPerUnit || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WORK CENTERS */}
      {activeTab === "workcenters" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Registered Shop-Floor Work Centers ({workCenters.length})
            </h3>
            <button
              onClick={() => setIsWorkCenterModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Station</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workCenters.map((wc) => (
              <div
                key={wc._id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                      {wc.code}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-100 mt-2">{wc.name}</h4>
                    <p className="text-xs text-slate-400">{wc.type.replace(/_/g, " ")}</p>
                  </div>
                  <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                    <Factory className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">Labor Rate</span>
                    <span className="text-slate-200 font-semibold">${wc.hourlyLaborCost.toFixed(2)}/hr</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">Machine Rate</span>
                    <span className="text-slate-200 font-semibold">${wc.hourlyMachineCost.toFixed(2)}/hr</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">Capacity</span>
                    <span className="text-emerald-400 font-semibold">{wc.capacityHoursPerDay} hrs/day</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">Efficiency</span>
                    <span className="text-indigo-400 font-semibold">{wc.efficiencyRatingPercent}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateWorkCenterModal
        isOpen={isWorkCenterModalOpen}
        onClose={() => setIsWorkCenterModalOpen(false)}
        onSuccess={() => fetchWorkCenters()}
      />

      <MrpExecuteModal
        isOpen={isExecuteModalOpen}
        onClose={() => setIsExecuteModalOpen(false)}
        planResult={mrpResult}
        onSuccess={() => {
          setIsExecuteModalOpen(false);
          handleRunMrp();
        }}
      />
    </div>
  );
}

