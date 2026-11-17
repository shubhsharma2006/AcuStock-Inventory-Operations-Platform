"use client";

import React, { useState } from "react";
import { X, PlayCircle, PackageCheck, ShoppingCart, Calendar, AlertCircle, CheckCircle2 } from "@/components/ui/icons";

interface MrpPlanResult {
  plannedWorkOrders: Array<{
    itemId: string;
    sku: string;
    name: string;
    quantity: number;
    startDate: string;
    dueDate: string;
    leadTimeDays: number;
  }>;
  plannedPurchaseOrders: Array<{
    itemId: string;
    sku: string;
    name: string;
    quantity: number;
    orderDate: string;
    requiredDate: string;
    leadTimeDays: number;
  }>;
}

interface MrpExecuteModalProps {
  isOpen: boolean;
  onClose: () => void;
  planResult: MrpPlanResult | null;
  onSuccess: (result: any) => void;
}

export function MrpExecuteModal({ isOpen, onClose, planResult, onSuccess }: MrpExecuteModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !planResult) return null;

  const totalWO = planResult.plannedWorkOrders?.length || 0;
  const totalPO = planResult.plannedPurchaseOrders?.length || 0;

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/manufacturing/mrp/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedWorkOrders: planResult.plannedWorkOrders,
          plannedPurchaseOrders: planResult.plannedPurchaseOrders,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to execute MRP orders");
      }

      setSuccessMsg(
        `Successfully generated ${data.createdWorkOrders?.length || 0} Work Orders and ${
          data.createdPurchaseRequisitions?.length || 0
        } Purchase Requisitions!`
      );
      onSuccess(data);
    } catch (err: any) {
      setError(err.message || "Execution failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <PlayCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Confirm & Release Production Schedule</h2>
              <p className="text-xs text-slate-400">
                Generate official Work Orders and Purchase Requisitions directly from MRP netting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Work Orders to release */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <PackageCheck className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Planned Work Orders ({totalWO})
              </h3>
            </div>
            {totalWO === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                No manufacturing work orders required for this run.
              </p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Assembly / SKU</th>
                      <th className="px-3 py-2 text-right">Batch Qty</th>
                      <th className="px-3 py-2">Start Date</th>
                      <th className="px-3 py-2">Need By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {planResult.plannedWorkOrders.map((wo, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-200">
                          <div className="font-semibold text-amber-300 font-sans">{wo.sku}</div>
                          <div className="text-[10px] text-slate-400 font-sans truncate max-w-[200px]">{wo.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-100">{wo.quantity} units</td>
                        <td className="px-3 py-2 text-slate-400">{wo.startDate ? new Date(wo.startDate).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2 text-emerald-400">{wo.dueDate ? new Date(wo.dueDate).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Purchase Orders to trigger */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <ShoppingCart className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Planned Purchase Requisitions ({totalPO})
              </h3>
            </div>
            {totalPO === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                Sufficient raw material on hand. No purchase orders needed.
              </p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Raw Material / SKU</th>
                      <th className="px-3 py-2 text-right">Order Qty</th>
                      <th className="px-3 py-2">PO Release Date</th>
                      <th className="px-3 py-2">Delivery Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {planResult.plannedPurchaseOrders.map((po, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-200">
                          <div className="font-semibold text-blue-300 font-sans">{po.sku}</div>
                          <div className="text-[10px] text-slate-400 font-sans truncate max-w-[200px]">{po.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-100">{po.quantity} units</td>
                        <td className="px-3 py-2 text-slate-400">{po.orderDate ? new Date(po.orderDate).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2 text-blue-400">{po.requiredDate ? new Date(po.requiredDate).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/40">
          <div className="text-xs text-slate-400">
            Total Releases: <span className="text-slate-100 font-semibold">{totalWO + totalPO} documents</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={loading || (totalWO === 0 && totalPO === 0)}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 rounded-lg transition shadow-sm flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Releasing Orders...</span>
                </>
              ) : (
                <span>Release Orders to Shop Floor</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

