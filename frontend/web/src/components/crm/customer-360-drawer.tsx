"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface Customer360DrawerProps {
  companyId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function Customer360Drawer({
  companyId,
  isOpen,
  onClose,
  onUpdate
}: Customer360DrawerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  // Credit Override Form State
  const [editingCredit, setEditingCredit] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState<number>(0);
  const [creditBlockedInput, setCreditBlockedInput] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [savingCredit, setSavingCredit] = useState(false);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    loadCustomer360();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, companyId]);

  async function loadCustomer360() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<any>(`/crm/companies/${companyId}/customer-360`);
      if (res?.success && res.customer360) {
        setData(res.customer360);
        setCreditLimitInput(res.customer360.company?.creditLimit || 0);
        setCreditBlockedInput(Boolean(res.customer360.company?.isCreditBlocked));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load Customer 360 profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCredit() {
    try {
      setSavingCredit(true);
      const res = await apiFetch<any>(`/crm/companies/${companyId}/credit-override`, {
        method: "POST",
        body: JSON.stringify({
          creditLimit: creditLimitInput,
          isCreditBlocked: creditBlockedInput,
          reason: overrideReason
        })
      });

      if (res?.success) {
        setEditingCredit(false);
        setOverrideReason("");
        await loadCustomer360();
        if (onUpdate) onUpdate();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update credit settings");
    } finally {
      setSavingCredit(false);
    }
  }

  if (!isOpen) return null;

  const company = data?.company;
  const metrics = data?.metrics;
  const timeline = data?.timeline || [];

  const creditLimit = metrics?.creditLimit || 0;
  const outstanding = metrics?.outstandingBalance || 0;
  const utilization = metrics?.creditUtilizationPct || 0;
  const isBlocked = metrics?.isCreditBlocked || false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-xl h-full bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col text-white animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center justify-center text-xl font-bold">
              🏢
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold truncate max-w-xs">{company?.name || "Customer 360"}</h2>
                {isBlocked && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                    Blocked ⚠️
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                Unified Ledger · Credit Health · Commercial History
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="m-4 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 p-12 text-center text-slate-400 animate-pulse">
            Loading customer intelligence...
          </div>
        ) : !data ? (
          <div className="flex-1 p-12 text-center text-slate-400">Customer profile not found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Credit Safety Gauge Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Credit Health & Limit Check
                </span>
                <button
                  type="button"
                  onClick={() => setEditingCredit(!editingCredit)}
                  className="text-xs text-amber-300 hover:underline cursor-pointer"
                >
                  {editingCredit ? "Cancel" : "⚙️ Manage Limit"}
                </button>
              </div>

              {/* Visual Credit Gauge */}
              <div>
                <div className="flex justify-between items-baseline mb-1.5 text-xs">
                  <span className="text-slate-400">
                    Outstanding: <span className="font-mono font-bold text-white">₹{outstanding.toLocaleString()}</span>
                  </span>
                  <span className="text-slate-400">
                    Limit: <span className="font-mono font-bold text-amber-300">₹{creditLimit.toLocaleString()}</span>
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      utilization >= 100
                        ? "bg-rose-500"
                        : utilization >= 75
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>

                <div className="flex justify-between items-center mt-2 text-[11px]">
                  <span className={`font-semibold ${utilization >= 100 ? "text-rose-400" : utilization >= 75 ? "text-amber-400" : "text-emerald-400"}`}>
                    {utilization}% Utilized {utilization >= 100 ? "(Exceeded)" : "(Healthy)"}
                  </span>
                  <span className="text-slate-500">
                    Available: ₹{(metrics?.availableCredit || 0).toLocaleString()} · Net {company?.creditDays || 30}
                  </span>
                </div>
              </div>

              {/* Editing Controls */}
              {editingCredit && (
                <div className="pt-3 border-t border-white/10 space-y-3 text-xs animate-in fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Credit Limit (₹)</label>
                      <input
                        type="number"
                        value={creditLimitInput}
                        onChange={(e) => setCreditLimitInput(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Manual Account Freeze</label>
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id="freezeAccountCheckbox"
                          checked={creditBlockedInput}
                          onChange={(e) => setCreditBlockedInput(e.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-slate-900 text-rose-500 focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="freezeAccountCheckbox" className="text-rose-300 font-semibold cursor-pointer">
                          Freeze Dispatches
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Authorization Note</label>
                    <input
                      type="text"
                      placeholder="e.g. Approved by CFO for Q4 bulk order..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-400"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveCredit}
                    disabled={savingCredit}
                    className="w-full py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    {savingCredit ? "Saving..." : "Apply Credit Policy"}
                  </button>
                </div>
              )}
            </div>

            {/* Lifetime Revenue & Deal Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lifetime Revenue</span>
                <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                  ₹{(metrics?.lifetimeRevenue || 0).toLocaleString()}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Won Orders</span>
                <div className="text-base font-bold text-sky-400 font-mono mt-1">
                  {metrics?.wonDealsCount || 0}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active Deals</span>
                <div className="text-base font-bold text-amber-300 font-mono mt-1">
                  {metrics?.activeDealsCount || 0}
                </div>
              </div>
            </div>

            {/* Company Contact & GST Profile */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-2 text-xs">
              <div className="font-bold text-slate-300 border-b border-white/10 pb-2">
                Registered Business Details
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>
                  <span className="text-slate-500">GSTIN:</span>{" "}
                  <span className="font-mono text-slate-200">{company?.taxId || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">PAN:</span>{" "}
                  <span className="font-mono text-slate-200">{company?.pan || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Email:</span>{" "}
                  <span className="text-slate-200 truncate">{company?.email || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Phone:</span>{" "}
                  <span className="text-slate-200">{company?.phone || "—"}</span>
                </div>
              </div>
              <div className="text-slate-500 pt-1">
                Address: <span className="text-slate-200">{company?.address?.street}, {company?.address?.city}, {company?.address?.state}</span>
              </div>
            </div>

            {/* Unified Commercial Ledger Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Transaction & Order Timeline
                </span>
                <span className="text-[11px] text-slate-500">{timeline.length} records</span>
              </div>

              {timeline.length === 0 ? (
                <div className="p-6 rounded-2xl border border-white/5 bg-slate-950/30 text-center text-xs text-slate-500">
                  No previous transactions recorded.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {timeline.map((event: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-white/10 bg-slate-950/40 flex items-center justify-between text-xs hover:border-amber-400/30 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm">
                          {event.type === "QUOTE" ? "📜" : event.type === "SALES_ORDER" ? "📦" : "💼"}
                        </span>
                        <div>
                          <div className="font-semibold text-white">{event.title}</div>
                          <div className="text-[10px] text-slate-400">{new Date(event.date).toLocaleDateString()} · {event.stage || event.status || "Active"}</div>
                        </div>
                      </div>

                      <div className="text-right font-mono font-bold text-amber-300">
                        ₹{(event.value || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
