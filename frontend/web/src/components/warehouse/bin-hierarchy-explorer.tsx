"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type LocationNode = {
  _id: string;
  type: "ZONE" | "AISLE" | "RACK" | "SHELF" | "BIN";
  code: string;
  label?: string;
  parentId?: string | null;
  path?: string;
  depth: number;
  capacity?: {
    maxUnits?: number;
    maxWeight?: number;
    maxVolume?: number;
  };
  isActive: boolean;
  isPickable: boolean;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: string;
  };
  temperatureZone?: "AMBIENT" | "COLD" | "FROZEN" | "HAZMAT";
  children?: LocationNode[];
};

interface BinHierarchyExplorerProps {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  onClose: () => void;
}

export function BinHierarchyExplorer({
  warehouseId,
  warehouseName,
  warehouseCode,
  onClose,
}: BinHierarchyExplorerProps) {
  const queryClient = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<LocationNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [bulkConfig, setBulkConfig] = useState({
    zoneCount: 2,
    aislesPerZone: 2,
    racksPerAisle: 3,
    shelvesPerRack: 4,
    binsPerShelf: 4,
    prefix: warehouseCode || "WH1",
  });
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Fetch hierarchical location tree
  const { data: treeData, isLoading, refetch } = useQuery<{ success: boolean; tree: LocationNode[] }>({
    queryKey: ["warehouse-locations-tree", warehouseId],
    queryFn: () => apiFetch<{ success: boolean; tree: LocationNode[] }>(`/locations/${warehouseId}/tree`),
  });

  const tree = treeData?.tree || [];

  // Toggle node expansion
  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Bulk creation mutation
  const bulkMutation = useMutation({
    mutationFn: (config: typeof bulkConfig) =>
      apiFetch(`/locations/${warehouseId}/bulk`, {
        method: "POST",
        body: JSON.stringify(config),
      }),
    onSuccess: (data: any) => {
      setBulkFeedback(`Successfully generated ${data.createdCount || "hierarchy"} locations!`);
      queryClient.invalidateQueries({ queryKey: ["warehouse-locations-tree", warehouseId] });
      setTimeout(() => {
        setBulkFeedback(null);
        setShowBulkModal(false);
      }, 1500);
    },
    onError: (err: any) => {
      setBulkFeedback(`Failed: ${err.message || "Bulk generation error"}`);
    },
  });

  // Calculate total counts
  const countStats = (nodes: LocationNode[]) => {
    let zones = 0, aisles = 0, racks = 0, shelves = 0, bins = 0;
    const traverse = (nodeList: LocationNode[]) => {
      nodeList.forEach((n) => {
        if (n.type === "ZONE") zones++;
        if (n.type === "AISLE") aisles++;
        if (n.type === "RACK") racks++;
        if (n.type === "SHELF") shelves++;
        if (n.type === "BIN") bins++;
        if (n.children && n.children.length > 0) traverse(n.children);
      });
    };
    traverse(nodes);
    return { zones, aisles, racks, shelves, bins, total: zones + aisles + racks + shelves + bins };
  };

  const stats = countStats(tree);

  const getTypeIcon = (type: LocationNode["type"]) => {
    switch (type) {
      case "ZONE": return "🌐";
      case "AISLE": return "🛣️";
      case "RACK": return "🗄️";
      case "SHELF": return "📚";
      case "BIN": return "📦";
      default: return "📍";
    }
  };

  const getTemperatureBadge = (zone?: LocationNode["temperatureZone"]) => {
    switch (zone) {
      case "COLD": return <span className="rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold">COLD 2-8°C</span>;
      case "FROZEN": return <span className="rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold">FROZEN -20°C</span>;
      case "HAZMAT": return <span className="rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold">⚠️ HAZMAT</span>;
      case "AMBIENT":
      default:
        return <span className="rounded-md bg-slate-500/15 text-slate-400 border border-slate-500/30 px-2 py-0.5 text-[10px]">AMBIENT</span>;
    }
  };

  // Render tree node recursively
  const renderTreeNode = (node: LocationNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = !!expandedNodes[node._id];
    const isSelected = selectedNode?._id === node._id;

    return (
      <div key={node._id} className="select-none text-xs">
        <div
          onClick={() => setSelectedNode(node)}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-3 rounded-lg cursor-pointer transition ${
            isSelected
              ? "bg-indigo-600/30 text-white border border-indigo-500/40"
              : "hover:bg-white/5 text-slate-300"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNode(node._id);
                }}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white"
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="w-4 inline-block text-center text-slate-600">•</span>
            )}
            <span>{getTypeIcon(node.type)}</span>
            <span className="font-mono font-semibold text-white">{node.code}</span>
            {node.label && <span className="text-slate-400 text-[11px]">({node.label})</span>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase bg-white/5 px-1.5 py-0.5 rounded text-slate-400">
              {node.type}
            </span>
            {node.isPickable && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                PICK
              </span>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-white/5 ml-4">
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-5xl rounded-3xl border border-white/20 bg-slate-900 p-6 sm:p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.2em] text-indigo-400 font-semibold">SAP EWM Topology</span>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
                6-Level Bin Hierarchy
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
              🏢 {warehouseName} <span className="text-slate-400 text-sm font-mono">({warehouseCode})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Storage locations, pick-faces, racks, and bin capacity telemetry for warehouse automation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="rounded-xl border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600/30 px-3.5 py-2 text-xs font-semibold text-indigo-300 transition"
            >
              ⚡ Bulk Generate Racks
            </button>
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-semibold text-slate-300 transition"
            >
              🖨️ Print Labels
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Hierarchy Stats HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 my-4">
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-500">Zones</div>
            <div className="text-sm font-bold text-white mt-0.5">{stats.zones}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-500">Aisles</div>
            <div className="text-sm font-bold text-white mt-0.5">{stats.aisles}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-500">Racks</div>
            <div className="text-sm font-bold text-indigo-400 mt-0.5">{stats.racks}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-500">Shelves</div>
            <div className="text-sm font-bold text-white mt-0.5">{stats.shelves}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-500">Bins (Pick-Faces)</div>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">{stats.bins}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-500">Total Nodes</div>
            <div className="text-sm font-bold text-cyan-400 mt-0.5">{stats.total}</div>
          </div>
        </div>

        {/* Main Content: Split Pane (Tree View on Left, Node Details on Right) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-hidden">
          {/* Tree Explorer (Col 7) */}
          <div className="md:col-span-7 rounded-2xl border border-white/10 bg-slate-950/50 p-4 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Topology Hierarchy Tree</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    const mark = (nodes: LocationNode[]) => {
                      nodes.forEach((n) => {
                        all[n._id] = true;
                        if (n.children) mark(n.children);
                      });
                    };
                    mark(tree);
                    setExpandedNodes(all);
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  Expand All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setExpandedNodes({})}
                  className="text-[11px] text-slate-400 hover:text-slate-300"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-20 text-center text-slate-500 text-xs">Loading warehouse topology...</div>
            ) : tree.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="text-2xl">🏗️</div>
                <div className="text-xs font-semibold text-white">No Storage Bins Configured Yet</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Generate standard aisles, racks, and shelves using our bulk pattern wizard.
                </p>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition"
                >
                  ⚡ Bulk Generate Racks Now
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">{tree.map((node) => renderTreeNode(node, 0))}</div>
            )}
          </div>

          {/* Node Inspector Panel (Col 5) */}
          <div className="md:col-span-5 rounded-2xl border border-white/10 bg-slate-950/70 p-5 overflow-y-auto custom-scrollbar flex flex-col justify-between">
            {selectedNode ? (
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getTypeIcon(selectedNode.type)}</span>
                    <div>
                      <h3 className="text-lg font-bold text-white font-mono">{selectedNode.code}</h3>
                      <div className="text-xs text-slate-400">{selectedNode.label || "No custom label assigned"}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between border-b border-white/5 pb-1.5">
                    <span className="text-slate-500">Location Type:</span>
                    <span className="font-bold text-indigo-300">{selectedNode.type}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1.5">
                    <span className="text-slate-500">Materialized Path:</span>
                    <span className="text-slate-300 truncate max-w-[180px]" title={selectedNode.path || ""}>
                      {selectedNode.path || `/${selectedNode.code.toLowerCase()}`}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1.5">
                    <span className="text-slate-500">Pickable Face:</span>
                    <span className={selectedNode.isPickable ? "text-emerald-400 font-bold" : "text-slate-400"}>
                      {selectedNode.isPickable ? "YES (Active Picking)" : "NO (Bulk Reserve Only)"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1.5">
                    <span className="text-slate-500">Climate Zone:</span>
                    <div>{getTemperatureBadge(selectedNode.temperatureZone)}</div>
                  </div>
                </div>

                {/* Capacity Telemetry */}
                <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    SAP EWM Capacity Limits
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="text-[10px] text-slate-500">Max Units</div>
                      <div className="font-bold text-white">{selectedNode.capacity?.maxUnits || "Unlimited"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Max Weight</div>
                      <div className="font-bold text-white">{selectedNode.capacity?.maxWeight ? `${selectedNode.capacity.maxWeight} kg` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Max Volume</div>
                      <div className="font-bold text-white">{selectedNode.capacity?.maxVolume ? `${selectedNode.capacity.maxVolume} m³` : "—"}</div>
                    </div>
                  </div>
                </div>

                {/* Printable Barcode Card */}
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 space-y-1.5 text-center">
                  <div className="text-[10px] uppercase font-bold text-indigo-300">Scanner Code 128 Token</div>
                  <div className="bg-white p-2 rounded-lg font-mono text-xs text-black font-bold tracking-widest">
                    *{selectedNode.code}*
                  </div>
                  <div className="text-[10px] text-slate-400">Ready for laser/camera scan direct lookup</div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 text-xs space-y-2">
                <div className="text-2xl">👈</div>
                <div>Select any Zone, Aisle, Rack, or Bin to inspect physical attributes and capacity limits.</div>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-white/10 px-5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
              >
                Close Topology Explorer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Racking Pattern Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl border border-indigo-500/30 bg-slate-950 p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-base">⚡ Bulk Racking Generation Wizard</h3>
                <div className="text-xs text-slate-400 font-mono">Generates hierarchical bins automatically</div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Prefix / Code Base</label>
                <input
                  type="text"
                  value={bulkConfig.prefix}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, prefix: e.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white font-mono outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Number of Zones</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={bulkConfig.zoneCount}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, zoneCount: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Aisles per Zone</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bulkConfig.aislesPerZone}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, aislesPerZone: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Racks per Aisle</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bulkConfig.racksPerAisle}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, racksPerAisle: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Shelves per Rack</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bulkConfig.shelvesPerRack}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, shelvesPerRack: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Bins per Shelf</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={bulkConfig.binsPerShelf}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, binsPerShelf: parseInt(e.target.value) || 1 })}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
                />
              </div>

              <div className="rounded-xl border border-white/5 bg-slate-900/60 p-2.5 text-slate-400">
                Calculated Provision:{" "}
                <strong className="text-emerald-400">
                  {bulkConfig.zoneCount * bulkConfig.aislesPerZone * bulkConfig.racksPerAisle * bulkConfig.shelvesPerRack * bulkConfig.binsPerShelf}
                </strong>{" "}
                pickable bins.
              </div>

              {bulkFeedback && (
                <div className={`p-2.5 rounded-xl text-xs font-semibold ${
                  bulkFeedback.startsWith("Success") ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                }`}>
                  {bulkFeedback}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => bulkMutation.mutate(bulkConfig)}
                disabled={bulkMutation.isPending}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-bold text-white transition disabled:opacity-50"
              >
                {bulkMutation.isPending ? "Generating..." : "Generate Racks Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Sticker Matrix Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-950 p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-base">🖨️ Printable Bin & Rack Sticker Sheet</h3>
                <div className="text-xs text-slate-400">Avery / Zebra standard 4x2 inch thermal labels</div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl text-black space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {(tree.length > 0 ? tree.slice(0, 4) : [{ code: `${warehouseCode}-Z01-A01-R01-B01`, label: "Sample Bin" }]).map((item, idx) => (
                  <div key={idx} className="border-2 border-dashed border-slate-300 p-3 rounded-lg flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{warehouseName}</div>
                    <div className="font-mono text-sm font-extrabold my-1">{item.code}</div>
                    <div className="font-mono text-xs bg-slate-100 px-3 py-1 rounded tracking-widest">
                      *{item.code}*
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1">AcuStock WMS Location Marker</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
              >
                🖨️ Send to Thermal Label Printer
              </button>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

