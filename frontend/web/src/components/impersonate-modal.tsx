"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Portal } from "@/components/ui/portal";
import type { Role } from "@/lib/acustock";

interface ImpersonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: {
    _id: string;
    name?: string;
    email?: string;
    role: Role;
  } | null;
}

export function ImpersonateModal({ isOpen, onClose, targetUser }: ImpersonateModalProps) {
  const [mode, setMode] = useState<"READ_ONLY" | "FULL">("READ_ONLY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !targetUser) return null;

  async function handleStart() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<{
        success: boolean;
        token: string;
        mode: string;
      }>(`/superadmin/impersonate/${targetUser!._id}`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });

      if (res.success) {
        const roleHome =
          targetUser!.role === "MANAGER"
            ? "/dashboard/manager"
            : targetUser!.role === "USER"
            ? "/dashboard/user"
            : "/dashboard/admin";
        window.location.href = roleHome;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start shadow session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl shadow-purple-950/20 backdrop-blur-xl">
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={loading}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Start Shadow Session</h2>
              <p className="text-xs text-slate-400">
                Impersonate and view AcuStock through another user's role and scope
              </p>
            </div>
          </div>

          {/* Target User Summary Card */}
          <div className="my-5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{targetUser.name || "Unnamed User"}</p>
                <p className="text-xs text-slate-400 font-mono">{targetUser.email || "No email"}</p>
              </div>
              <span className="rounded-md bg-purple-500/20 px-2.5 py-1 text-xs font-mono font-medium text-purple-300 border border-purple-500/30">
                {targetUser.role}
              </span>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Select Session Mode
            </label>

            <div
              onClick={() => setMode("READ_ONLY")}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                mode === "READ_ONLY"
                  ? "border-sky-500/60 bg-sky-950/30 ring-1 ring-sky-500/40"
                  : "border-slate-800 bg-slate-950/30 hover:border-slate-700"
              }`}
            >
              <div className={`mt-0.5 rounded-lg p-2 ${mode === "READ_ONLY" ? "bg-sky-500/20 text-sky-400" : "bg-slate-800 text-slate-400"}`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Watch Mode (Read-Only Simulation)</p>
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                    Recommended
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Safely inspect live dashboards, warehouse inventory, order statuses, and permissions. All data modifications (POST, PUT, DELETE) are automatically blocked.
                </p>
              </div>
            </div>

            <div
              onClick={() => setMode("FULL")}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                mode === "FULL"
                  ? "border-amber-500/60 bg-amber-950/30 ring-1 ring-amber-500/40"
                  : "border-slate-800 bg-slate-950/30 hover:border-slate-700"
              }`}
            >
              <div className={`mt-0.5 rounded-lg p-2 ${mode === "FULL" ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-400"}`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Full Operational Delegation</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Full ability to create, update, or approve stock and orders on behalf of this user. All operations are permanently tagged under your SuperAdmin audit log.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/30 hover:from-purple-500 hover:to-indigo-500 active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Initializing Shadow Session...</span>
                </>
              ) : (
                <>
                  <span>Begin Shadow Session</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
