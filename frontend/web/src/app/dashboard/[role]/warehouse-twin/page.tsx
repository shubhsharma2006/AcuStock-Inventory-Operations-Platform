'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { BinNode, Waypoint3D } from '@/components/warehouse-3d/Warehouse3DScene';
import { BinDetailDrawer } from '@/components/warehouse-3d/BinDetailDrawer';
import { PickPathNavigator, type RouteMetrics } from '@/components/warehouse-3d/PickPathNavigator';
import { SlottingModal } from '@/components/warehouse-3d/SlottingModal';

// Dynamically import Three.js 3D Canvas with ssr: false to avoid canvas hydration issues
const LazyWarehouse3DScene = dynamic(
  () => import('@/components/warehouse-3d/Warehouse3DScene').then(mod => mod.Warehouse3DScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[550px] w-full items-center justify-center rounded-2xl border border-white/5 bg-slate-950/80 p-8 text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <span className="font-mono text-xs uppercase tracking-widest text-slate-400">
            Initializing High-Bay 3D Spatial Mesh...
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

  const currentWarehouse = warehouses.find(w => w._id === selectedWarehouseId);

  return (
    <div className="space-y-4 font-sans text-slate-100">
      {/* Top Header & Command Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏬</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Tier-1 Visual WMS
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            3D Spatial Digital Twin & Pick-Path Router
          </h1>
          <p className="text-xs text-slate-400">
            Real-time rack capacity heatmaps, S-Shape 2-Opt shortest picker routing, and AI velocity slotting.
          </p>
        </div>

        {/* Facility Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Warehouse Dropdown */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => {
              setSelectedWarehouseId(e.target.value);
              setSelectedBin(null);
              handleClearRoute();
            }}
            className="rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white outline-none focus:border-cyan-500 transition"
          >
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                📍 {w.name} ({w.code})
              </option>
            ))}
          </select>

          {/* Visualization Mode Toggle */}
          <div className="flex items-center rounded-xl border border-white/10 bg-slate-950 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('occupancy')}
              className={`rounded-lg px-3 py-1.5 transition font-semibold ${
                viewMode === 'occupancy' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Occupancy %
            </button>
            <button
              type="button"
              onClick={() => setViewMode('velocity')}
              className={`rounded-lg px-3 py-1.5 transition font-semibold ${
                viewMode === 'velocity' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              ABC Velocity
            </button>
          </div>

          {/* Route Optimization Button */}
          <button
            type="button"
            disabled={routingLoading}
            onClick={() => handleOptimizeRoute()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition disabled:opacity-50"
          >
            <span>🧭</span>
            <span>{routingLoading ? 'Calculating...' : 'Run Pick Path'}</span>
          </button>

          {/* AI Slotting Button */}
          <button
            type="button"
            onClick={() => setSlottingOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 transition"
          >
            <span>🧠</span>
            <span>AI Slotting Optimizer</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      {twinData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Storage Bins</span>
            <span className="text-xl font-bold text-white font-mono">{twinData.stats.totalBins}</span>
            <span className="text-[10px] text-slate-500 block">4 Industrial Rack Aisles</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Occupied / Stored</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">
              {twinData.stats.occupiedBins} <span className="text-xs text-slate-400 font-sans">({twinData.stats.totalStockUnits} units)</span>
            </span>
            <span className="text-[10px] text-slate-500 block">{twinData.stats.vacantBins} Vacant Bins</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Space Utilization</span>
            <span className="text-xl font-bold text-cyan-400 font-mono">{twinData.stats.utilizationRate}%</span>
            <span className="text-[10px] text-slate-500 block">Cubic Capacity</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Picker Path Engine</span>
            <span className="text-xl font-bold text-amber-300 font-mono">
              {routeMetrics ? `-${routeMetrics.percentSavings}% Walk` : 'Ready'}
            </span>
            <span className="text-[10px] text-slate-500 block">S-Shape + 2-Opt TSP</span>
          </div>
        </div>
      )}

      {/* Main 3D Viewport with Floating Overlays */}
      <div className="relative h-[620px] w-full rounded-3xl border border-white/10 bg-slate-950 overflow-hidden shadow-2xl">
        {loadingTwin ? (
          <div className="flex h-full w-full items-center justify-center text-cyan-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : (
          <LazyWarehouse3DScene
            bins={twinData?.bins || []}
            viewMode={viewMode}
            highlightedBinId={selectedBin?._id}
            pathWaypoints={pathWaypoints}
            onSelectBin={(bin) => setSelectedBin(bin)}
            className="h-full w-full"
          />
        )}

        {/* Floating Side Panels (Bin Detail Drawer or Route Navigator) */}
        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-3 max-h-[540px]">
          {selectedBin && (
            <BinDetailDrawer
              bin={selectedBin}
              onClose={() => setSelectedBin(null)}
              onOptimizeForBin={(binId) => handleOptimizeRoute(binId)}
            />
          )}

          {routeMetrics && !selectedBin && (
            <PickPathNavigator
              metrics={routeMetrics}
              onClear={handleClearRoute}
              onSelectStop={(stop) => {
                const found = (twinData?.bins || []).find(b => b.code === stop.code);
                if (found) setSelectedBin(found);
              }}
            />
          )}
        </div>
      </div>

      {/* Slotting Optimization Modal */}
      {selectedWarehouseId && (
        <SlottingModal
          warehouseId={selectedWarehouseId}
          warehouseName={currentWarehouse?.name || 'Warehouse'}
          isOpen={slottingOpen}
          onClose={() => setSlottingOpen(false)}
          onMovesApplied={() => refetchTwin()}
        />
      )}
    </div>
  );
}
