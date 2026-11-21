'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { BinNode, Waypoint3D } from '@/components/warehouse-3d/Warehouse3DScene';
import { BinDetailDrawer } from '@/components/warehouse-3d/BinDetailDrawer';
import { PickPathNavigator, type RouteMetrics } from '@/components/warehouse-3d/PickPathNavigator';
import { SlottingModal } from '@/components/warehouse-3d/SlottingModal';

// Dynamically import Three.js 3D Canvas with ssr: false
const LazyWarehouse3DScene = dynamic(
  () => import('@/components/warehouse-3d/Warehouse3DScene').then(mod => mod.Warehouse3DScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[620px] w-full items-center justify-center bg-slate-950 text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-cyan-400 border-t-transparent" />
          <span className="font-mono text-xs uppercase tracking-widest text-slate-400">
            Initializing High-Bay 3D Spatial Racking Mesh...
          </span>
        </div>
      </div>
    )
  }
);

interface WarehouseOption {
  _id: string;
  name: string;
  code: string;
}

export default function WarehouseTwinPage() {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'occupancy' | 'velocity'>('occupancy');
  const [selectedBin, setSelectedBin] = useState<BinNode | null>(null);
  const [pathWaypoints, setPathWaypoints] = useState<Waypoint3D[]>([]);
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const [slottingOpen, setSlottingOpen] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [isSimPlaying, setIsSimPlaying] = useState(true);
  const [hudLeftOpen, setHudLeftOpen] = useState(true);

  // 1. Fetch active warehouses
  const { data: warehouses = [] } = useQuery<WarehouseOption[]>({
    queryKey: ['warehouses-list'],
    queryFn: () => apiFetch<WarehouseOption[]>('/warehouses')
  });

  // Select first warehouse by default
  useEffect(() => {
    if (warehouses.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0]._id);
    }
  }, [warehouses, selectedWarehouseId]);

  // 2. Fetch 3D Digital Twin layout for selected warehouse
  const { data: twinData, isLoading: loadingTwin, refetch: refetchTwin } = useQuery<{
    warehouse: any;
    stats: {
      totalBins: number;
      occupiedBins: number;
      vacantBins: number;
      utilizationRate: number;
      totalStockUnits: number;
    };
    bins: BinNode[];
  }>({
    queryKey: ['digital-twin', selectedWarehouseId],
    queryFn: () => apiFetch<any>(`/warehouses/${selectedWarehouseId}/digital-twin`),
    enabled: Boolean(selectedWarehouseId)
  });

  // 3. Optimize sample route across sample active bins
  const handleOptimizeRoute = async (targetBinId?: string) => {
    if (!selectedWarehouseId) return;
    setRoutingLoading(true);
    try {
      const payload: any = {};
      if (targetBinId) {
        payload.binIds = [targetBinId];
      }
      const res = await apiFetch<any>(`/warehouses/${selectedWarehouseId}/optimize-pick-path`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setRouteMetrics(res);
      setPathWaypoints(res.waypoints3D || []);
      setIsSimPlaying(true);
    } catch (err) {
      console.error('Failed to calculate route:', err);
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleClearRoute = () => {
    setRouteMetrics(null);
    setPathWaypoints([]);
  };

  // 4. Seed enterprise demo inventory
  const handleSeedDemoInventory = async () => {
    if (!selectedWarehouseId) return;
    setSeedingLoading(true);
    try {
      await apiFetch<any>(`/warehouses/${selectedWarehouseId}/seed-demo-inventory`, {
        method: 'POST'
      });
      await refetchTwin();
    } catch (err) {
      console.error('Failed to seed demo inventory:', err);
    } finally {
      setSeedingLoading(false);
    }
  };

  const currentWarehouse = warehouses.find(w => w._id === selectedWarehouseId);
  const stats = twinData?.stats || {
    totalBins: 384,
    occupiedBins: 261,
    vacantBins: 123,
    utilizationRate: 68,
    totalStockUnits: 18450
  };

  return (
    <div className="relative h-[calc(100vh-4.25rem)] w-full overflow-hidden bg-slate-950 font-sans text-slate-100 flex flex-col">
      {/* Top Floating Command Bar */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/90 px-5 py-3 backdrop-blur-md">
        {/* Left Facility & Status Badge */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-lg">
            🏬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight text-sm">
                3D Spatial Warehouse Twin
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Tier-1 CAD/WMS Command Cockpit · S-Shape 2-Opt Pick Router
            </p>
          </div>
        </div>

        {/* Center Facility Dropdown & Heatmap Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Warehouse Dropdown */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => {
              setSelectedWarehouseId(e.target.value);
              setSelectedBin(null);
              handleClearRoute();
            }}
            className="rounded-xl border border-white/10 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-cyan-500 transition"
          >
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                📍 {w.name} ({w.code})
              </option>
            ))}
          </select>

          {/* Visualization Mode Segmented Switcher */}
          <div className="flex items-center rounded-xl border border-white/10 bg-slate-900 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('occupancy')}
              className={`rounded-lg px-3 py-1 transition font-semibold ${
                viewMode === 'occupancy' ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Occupancy %
            </button>
            <button
              type="button"
              onClick={() => setViewMode('velocity')}
              className={`rounded-lg px-3 py-1 transition font-semibold ${
                viewMode === 'velocity' ? 'bg-amber-400 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              ABC Velocity
            </button>
          </div>
        </div>

        {/* Right Action Toolbar */}
        <div className="flex items-center gap-2">
          {/* Seed Demo Stock Button */}
          <button
            type="button"
            onClick={handleSeedDemoInventory}
            disabled={seedingLoading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
          >
            {seedingLoading ? '📦 Seeding...' : '📦 Refresh Stock'}
          </button>

          {/* Run Pick Path Route */}
          <button
            type="button"
            onClick={() => handleOptimizeRoute()}
            disabled={routingLoading}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition shadow-lg shadow-cyan-500/5 disabled:opacity-50"
          >
            {routingLoading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                Calculating...
              </>
            ) : (
              <>
                <span>▶</span> Run Pick Path
              </>
            )}
          </button>

          {/* AI Slotting Optimizer */}
          <button
            type="button"
            onClick={() => setSlottingOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:brightness-110 transition shadow-lg shadow-amber-500/20"
          >
            <span>⚡</span> AI Slotting
          </button>
        </div>
      </div>

      {/* Main 3D Viewport Area with Full Bleed */}
      <div className="relative flex-1 w-full h-full">
        {/* Three.js 3D Canvas */}
        <LazyWarehouse3DScene
          bins={twinData?.bins || []}
          viewMode={viewMode}
          highlightedBinId={selectedBin?._id}
          pathWaypoints={pathWaypoints}
          onSelectBin={(bin) => setSelectedBin(bin)}
          isPlaying={isSimPlaying}
          className="w-full h-full"
        />

        {/* Floating Left Telemetry HUD Widget */}
        <div className={`absolute top-4 left-4 z-10 transition-all duration-300 ${hudLeftOpen ? 'w-64' : 'w-10'}`}>
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <span>📊</span> Facility Telemetry
              </span>
              <button
                type="button"
                onClick={() => setHudLeftOpen(!hudLeftOpen)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                {hudLeftOpen ? '◀' : '▶'}
              </button>
            </div>

            {hudLeftOpen && (
              <div className="space-y-3.5 text-xs">
                {/* Circular Utilization Metric */}
                <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-900/60 p-3">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-950 border-2 border-cyan-500/40">
                    <span className="text-sm font-black text-white">{stats.utilizationRate}%</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400">
                      Cubic Utilization
                    </span>
                    <span className="text-xs text-slate-200">
                      {stats.occupiedBins} / {stats.totalBins} Active Bins
                    </span>
                  </div>
                </div>

                {/* Storage Metrics Matrix */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2">
                    <span className="block text-[10px] text-slate-400">Total Bins</span>
                    <span className="text-sm font-bold text-white">{stats.totalBins}</span>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2">
                    <span className="block text-[10px] text-slate-400">Stock Units</span>
                    <span className="text-sm font-bold text-emerald-400">
                      {stats.totalStockUnits.toLocaleString()}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2">
                    <span className="block text-[10px] text-slate-400">Occupied</span>
                    <span className="text-sm font-bold text-cyan-300">{stats.occupiedBins}</span>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-2">
                    <span className="block text-[10px] text-slate-400">Vacant</span>
                    <span className="text-sm font-bold text-slate-400">{stats.vacantBins}</span>
                  </div>
                </div>

                {/* Aisle Utilization Breakdown */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Aisle Congestion
                  </span>
                  {[
                    { aisle: 'Aisle 01', pct: 84, color: 'bg-rose-500' },
                    { aisle: 'Aisle 02', pct: 65, color: 'bg-amber-500' },
                    { aisle: 'Aisle 03', pct: 45, color: 'bg-cyan-500' },
                    { aisle: 'Aisle 04', pct: 28, color: 'bg-emerald-500' }
                  ].map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">{a.aisle}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-900">
                          <div className={`h-full rounded-full ${a.color}`} style={{ width: `${a.pct}%` }} />
                        </div>
                        <span className="font-mono text-slate-300 w-7 text-right">{a.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Docked CAD Inspector Panel (Zero overlap with AcuBot Copilot) */}
        {selectedBin && (
          <div className="absolute top-4 right-4 z-10 max-h-[calc(100vh-140px)] overflow-y-auto">
            <BinDetailDrawer
              bin={selectedBin}
              onClose={() => setSelectedBin(null)}
              onOptimizeForBin={(binId) => handleOptimizeRoute(binId)}
            />
          </div>
        )}

        {/* Bottom Floating Pick-Path Timeline Scrubber (When route calculated) */}
        {routeMetrics && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-2xl w-full px-4">
            <div className="rounded-2xl border border-cyan-500/40 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSimPlaying(!isSimPlaying)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 transition"
                  title={isSimPlaying ? 'Pause Simulation' : 'Play Simulation'}
                >
                  {isSimPlaying ? '❚❚' : '▶'}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">AMR Pick Route Active</span>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-500/30 text-[10px]">
                      -{routeMetrics.percentSavings}% DISTANCE SAVED
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Total: {routeMetrics.totalDistanceMeters}m · {routeMetrics.orderedStops.length} stops
                  </span>
                </div>
              </div>

              {/* Step Sequence Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-xs py-1">
                {routeMetrics.orderedStops.slice(0, 5).map((stop) => (
                  <span
                    key={stop.stepNumber}
                    onClick={() => {
                      const found = twinData?.bins.find(b => b._id === stop.id);
                      if (found) setSelectedBin(found);
                    }}
                    className="cursor-pointer rounded-lg border border-white/10 bg-slate-900 px-2 py-1 font-mono text-[10px] text-cyan-300 hover:border-cyan-400 transition shrink-0"
                  >
                    #{stop.stepNumber} {stop.code}
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={handleClearRoute}
                className="rounded-xl border border-white/10 bg-slate-900 px-2.5 py-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Slotting Optimization Modal */}
      <SlottingModal
        isOpen={slottingOpen}
        onClose={() => setSlottingOpen(false)}
        warehouseId={selectedWarehouseId}
        warehouseName={currentWarehouse?.name || 'Main Warehouse'}
        onMovesApplied={() => refetchTwin()}
      />
    </div>
  );
}
