"use client";

import React, { useState } from "react";
import { X, Factory, DollarSign, Clock, AlertCircle } from "@/components/ui/icons";

interface CreateWorkCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateWorkCenterModal({ isOpen, onClose, onSuccess }: CreateWorkCenterModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("ASSEMBLY");
  const [hourlyLaborCost, setHourlyLaborCost] = useState("35.00");
  const [hourlyMachineCost, setHourlyMachineCost] = useState("20.00");
  const [capacityHoursPerDay, setCapacityHoursPerDay] = useState("8");
  const [efficiencyRatingPercent, setEfficiencyRatingPercent] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) {
      setError("Please specify both a Work Center Code and Name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/manufacturing/work-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          type,
          hourlyLaborCost: parseFloat(hourlyLaborCost) || 0,
          hourlyMachineCost: parseFloat(hourlyMachineCost) || 0,
          capacityHoursPerDay: parseFloat(capacityHoursPerDay) || 8,
          efficiencyRatingPercent: parseFloat(efficiencyRatingPercent) || 100,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to create work center");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create work center");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Add Shop-Floor Work Center</h2>
              <p className="text-xs text-slate-400">Configure machine, labor costing and standard daily capacity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Work Center Code *</label>
              <input
                type="text"
                placeholder="e.g. WC-ASSY-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Station Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="ASSEMBLY">Final Assembly</option>
                <option value="FABRICATION">Fabrication & Welding</option>
                <option value="CNC_MACHINING">CNC Machining</option>
                <option value="PACKAGING">Packaging & Crating</option>
                <option value="QUALITY_INSPECTION">Quality & Testing</option>
                <option value="OTHER">Other Station</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Station Name *</label>
            <input
              type="text"
              placeholder="e.g. Main SMT & Electronics Assembly Line"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Hourly Labor Rate ($/hr)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={hourlyLaborCost}
                onChange={(e) => setHourlyLaborCost(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Hourly Machine Rate ($/hr)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={hourlyMachineCost}
                onChange={(e) => setHourlyMachineCost(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Daily Capacity (Hours/Day)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="24"
                value={capacityHoursPerDay}
                onChange={(e) => setCapacityHoursPerDay(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Efficiency Rating (%)</label>
              <input
                type="number"
                step="1"
                min="10"
                max="200"
                value={efficiencyRatingPercent}
                onChange={(e) => setEfficiencyRatingPercent(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 rounded-lg transition shadow-sm flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Register Work Center</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

