"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Portal } from "@/components/ui/portal";
import type { Role } from "@/lib/acustock";

interface OffboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: {
    _id: string;
    name?: string;
    email?: string;
    role: Role;
  } | null;
  onSuccess: () => void;
}

interface OffboardingImpact {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    assignedWarehouseId?: string;
  };
  warehouses: Array<{ _id: string; name: string; code: string }>;
  pendingTransfersCount: number;
  pendingPOsCount: number;
  eligibleCustodians: Array<{ _id: string; name: string; email: string; role: Role }>;
}

export function OffboardingModal({ isOpen, onClose, targetUser, onSuccess }: OffboardingModalProps) {
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [impactData, setImpactData] = useState<OffboardingImpact | null>(null);
  const [selectedCustodian, setSelectedCustodian] = useState<string>("");
  const [reason, setReason] = useState<string>("RESIGNATION");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !targetUser) return;

    let cancelled = false;
    async function fetchImpact() {
      try {
        setLoadingImpact(true);
        setError(null);
        const res = await apiFetch<{
          success: boolean;
          impact: OffboardingImpact;
        }>(`/superadmin/users/${targetUser!._id}/offboarding-impact`);
        if (!cancelled && res.success) {
          setImpactData(res.impact);
          if (res.impact.eligibleCustodians.length > 0) {
            setSelectedCustodian(res.impact.eligibleCustodians[0]._id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load offboarding impact");
        }
      } finally {
        if (!cancelled) setLoadingImpact(false);
      }
    }

    fetchImpact();
    return () => {
      cancelled = true;
    };
  }, [isOpen, targetUser]);

  if (!isOpen || !targetUser) return null;

  async function handleConfirmOffboard() {
    try {
      setSubmitting(true);
      setError(null);
      await apiFetch<{ success: boolean; message: string }>(
        `/superadmin/users/${targetUser!._id}/offboard`,
        {
          method: "POST",
          body: JSON.stringify({
            reassignToUserId: selectedCustodian || null,
            reason,
          }),
        }
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to offboard user");
    } finally {
      setSubmitting(false);
    }
  }

  const hasDependencies =
    (impactData?.warehouses.length || 0) > 0 ||
    (impactData?.pendingTransfersCount || 0) > 0 ||
    (impactData?.pendingPOsCount || 0) > 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-xl rounded-2xl border border-rose-500/30 bg-slate-900/95 p-6 shadow-2xl shadow-rose-950/30 backdrop-blur-xl max-h-[90vh] overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={submitting}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Employee Offboarding & Access Revocation</h2>
              <p className="text-xs text-slate-400">
                Safely offboard employee, reassign pending workflows, and instantly revoke sessions
              </p>
            </div>
          </div>

          {loadingImpact ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <svg className="h-8 w-8 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-xs text-slate-400">Calculating workload impact and open assignments...</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {/* Target User Banner */}
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div>
                  <p className="font-semibold text-white">{targetUser.name || "Unnamed User"}</p>
                  <p className="text-xs text-slate-400 font-mono">{targetUser.email}</p>
                </div>
                <span className="rounded-md bg-rose-500/10 px-2.5 py-1 text-xs font-mono font-medium text-rose-300 border border-rose-500/20">
                  {targetUser.role}
                </span>
              </div>

              {/* Impact Metrics Breakdown */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Workload & Custody Impact Analysis
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="flex items-center gap-2.5 rounded-lg border border-slate-800/60 bg-slate-900/60 p-2.5">
                    <svg className="h-4 w-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <div>
                      <p className="text-slate-400">Warehouses</p>
                      <p className="font-bold text-white text-sm">
                        {impactData?.warehouses.length || 0} Managed
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 rounded-lg border border-slate-800/60 bg-slate-900/60 p-2.5">
                    <svg className="h-4 w-4 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <div>
                      <p className="text-slate-400">Open Transfers</p>
                      <p className="font-bold text-white text-sm">
                        {impactData?.pendingTransfersCount || 0} Pending
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 rounded-lg border border-slate-800/60 bg-slate-900/60 p-2.5">
                    <svg className="h-4 w-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <div>
                      <p className="text-slate-400">Purchase Orders</p>
                      <p className="font-bold text-white text-sm">
                        {impactData?.pendingPOsCount || 0} In-Flight
                      </p>
                    </div>
                  </div>
                </div>

                {hasDependencies && (
                  <p className="mt-3 text-xs text-amber-400/90 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Active assignments detected. Select a successor to maintain continuous operations.
                  </p>
                )}
              </div>

              {/* Successor Reassignment Selector */}
              {hasDependencies && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Reassign Open Custody To
                  </label>
                  <select
                    value={selectedCustodian}
                    onChange={(e) => setSelectedCustodian(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                  >
                    {impactData?.eligibleCustodians.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.role}) — {c.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Offboarding Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Departure Classification
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="RESIGNATION">Voluntary Resignation</option>
                  <option value="TERMINATION">Involuntary Termination</option>
                  <option value="CONTRACT_COMPLETED">Contract / Seasonal Completion</option>
                  <option value="ROLE_RESTRUCTURE">Organization Role Restructuring</option>
                  <option value="SECURITY_SUSPENSION">Emergency Security Revocation</option>
                </select>
              </div>

              {/* Regulatory Notice */}
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Permanent Access Killswitch</span>
                </div>
                <p className="text-rose-200/80 leading-relaxed">
                  Upon confirmation, all active web sessions and mobile scanner tokens will be invalidated immediately. Historical stock ledger documents and serial audit entries are preserved for regulatory compliance.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmOffboard}
              disabled={submitting || loadingImpact}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 hover:from-rose-500 hover:to-rose-600 active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Revoking Access...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                  </svg>
                  <span>Execute Offboard & Revoke</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
