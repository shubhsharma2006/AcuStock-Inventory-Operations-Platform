"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Layers,
  Sparkles,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Play,
  Box,
  MapPin,
  Barcode,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { GenerateWaveModal } from "@/components/warehouse/generate-wave-modal";
import { MobilePickerRunner } from "@/components/warehouse/mobile-picker-runner";
import { PutWallStation } from "@/components/warehouse/put-wall-station";

interface WaveRecord {
  _id: string;
  waveNumber: string;
  waveType: string;
  status: string;
  createdAt: string;
  salesOrderIds?: Array<any>;
  pickItems?: Array<any>;
  metrics: {
    totalLines: number;
    pickedLines: number;
    totalUnits: number;
    pickedUnits: number;
    startedAt?: string;
    completedAt?: string;
  };
  assignedPicker?: {
    _id: string;
    name: string;
    email?: string;
  };
  putWall?: {
    wallId: string;
    totalCubbies: number;
    cubbies: Array<any>;
  };
}

export default function PickingWavesPage() {
  const [waves, setWaves] = useState<WaveRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [activeRunnerWave, setActiveRunnerWave] = useState<WaveRecord | null>(null);
  const [activePutWallWave, setActivePutWallWave] = useState<WaveRecord | null>(null);

  const fetchWaves = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<any>("/picking-waves");
      if (res?.waves) {
        setWaves(res.waves);
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load picking waves:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWaves();
  }, []);

  const handleReleaseWave = async (waveId: string) => {
    try {
      const res = await apiFetch<any>(`/picking-waves/${waveId}/release`, {
        method: "POST",
      });
      if (res.success) {
        fetchWaves();
      }
    } catch (err: any) {
      alert(err.message || "Failed to release wave");
    }
  };

  const filteredWaves = useMemo(() => {
    return waves.filter((w) => {
      const q = searchQuery.toLowerCase();
      const numMatch = (w.waveNumber || "").toLowerCase().includes(q);
      const statusMatch = statusFilter === "ALL" || w.status === statusFilter;
      return numMatch && statusMatch;
    });
  }, [waves, searchQuery, statusFilter]);

  // Aggregate Metrics
  const activeWavesCount = waves.filter(
    (w) => w.status === "RELEASED" || w.status === "IN_PROGRESS" || w.status === "SORTING"
  ).length;
  const totalUnitsInFlight = waves
    .filter((w) => w.status !== "COMPLETED" && w.status !== "CANCELLED")
    .reduce((acc, curr) => acc + (curr.metrics?.totalUnits || 0), 0);
  const totalUnitsPicked = waves.reduce(
    (acc, curr) => acc + (curr.metrics?.pickedUnits || 0),
    0
  );
  const completedWavesCount = waves.filter((w) => w.status === "COMPLETED").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-primary" />
            Wave, Batch & Cluster Picking Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consolidate multi-order fulfillment with S-Shape bin traversal and Put-Wall order sorting
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Auto-Generate Wave
          </button>
          <button
            onClick={fetchWaves}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Active Picking Waves
          </span>
          <div className="text-2xl font-bold font-mono text-primary mt-1">
            {activeWavesCount}
          </div>
          <span className="text-[11px] text-muted-foreground">In-progress on warehouse floor</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Units In Flight
          </span>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {totalUnitsInFlight.toLocaleString()}
          </div>
          <span className="text-[11px] text-amber-600/80">Pending floor pick & sort</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Total Units Picked
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {totalUnitsPicked.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-600/80">Verified into totes</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Completed Waves
          </span>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            {completedWavesCount}
          </div>
          <span className="text-[11px] text-muted-foreground">Dispatched to packing dock</span>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Wave # (e.g. WAVE-2026-0001)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none text-foreground"
          >
            <option value="ALL">All Statuses</option>
            <option value="PLANNED">PLANNED</option>
            <option value="RELEASED">RELEASED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="PICKED">PICKED</option>
            <option value="SORTING">SORTING</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </div>
      </div>

      {/* Picking Waves Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase font-medium text-muted-foreground">
              <tr>
                <th className="py-3 px-4">Wave Number</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4">Pick Progress</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Floor & Wall Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading picking waves...
                  </td>
                </tr>
              ) : filteredWaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                    No picking waves found. Click &quot;Auto-Generate Wave&quot; above to cluster open orders.
                  </td>
                </tr>
              ) : (
                filteredWaves.map((wave) => {
                  const totalUnits = wave.metrics?.totalUnits || 0;
                  const pickedUnits = wave.metrics?.pickedUnits || 0;
                  const pct = totalUnits > 0 ? Math.round((pickedUnits / totalUnits) * 100) : 0;

                  return (
                    <tr key={wave._id} className="hover:bg-muted/30 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        {wave.waveNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {wave.waveType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground">
                        {new Date(wave.createdAt).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold">
                        {wave.salesOrderIds?.length || wave.putWall?.cubbies?.length || 0} orders
                      </td>
                      <td className="py-3.5 px-4 w-52">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono">
                            <span className="text-muted-foreground">
                              {pickedUnits}/{totalUnits} units
                            </span>
                            <span className="font-semibold text-foreground">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            wave.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : wave.status === "SORTING" || wave.status === "PICKED"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                              : wave.status === "IN_PROGRESS"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              : wave.status === "RELEASED"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {wave.status === "COMPLETED" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {wave.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {wave.status === "PLANNED" && (
                            <button
                              onClick={() => handleReleaseWave(wave._id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition"
                            >
                              Release
                            </button>
                          )}

                          {wave.status !== "COMPLETED" && (
                            <button
                              onClick={() => setActiveRunnerWave(wave)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-primary/10 hover:bg-primary/20 text-primary transition flex items-center gap-1"
                              title="Open S-Shape Traversal Floor Runner"
                            >
                              <Play className="w-3 h-3" />
                              Pick
                            </button>
                          )}

                          <button
                            onClick={() => setActivePutWallWave(wave)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-muted hover:bg-muted/80 text-foreground transition flex items-center gap-1"
                            title="Open Put-Wall Sorting Station"
                          >
                            <Box className="w-3 h-3 text-purple-500" />
                            Put-Wall
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Wave Modal */}
      {showGenerateModal && (
        <GenerateWaveModal
          onClose={() => setShowGenerateModal(false)}
          onSuccess={() => {
            setShowGenerateModal(false);
            fetchWaves();
          }}
        />
      )}

      {/* S-Shape Traversal Runner Modal */}
      {activeRunnerWave && (
        <MobilePickerRunner
          waveId={activeRunnerWave._id}
          waveNumber={activeRunnerWave.waveNumber}
          onClose={() => setActiveRunnerWave(null)}
          onWaveComplete={() => {
            setActiveRunnerWave(null);
            fetchWaves();
          }}
        />
      )}

      {/* Put-Wall Sorting Station Modal */}
      {activePutWallWave && (
        <PutWallStation
          waveId={activePutWallWave._id}
          waveNumber={activePutWallWave.waveNumber}
          onClose={() => setActivePutWallWave(null)}
        />
      )}
    </div>
  );
}

