"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/acustock";

interface ImpersonationBannerProps {
  user: AuthUser;
  onExit?: () => void;
}

export function ImpersonationBanner({ user, onExit }: ImpersonationBannerProps) {
  const [exiting, setExiting] = useState(false);

  if (!user.isImpersonated) return null;

  const isReadOnly = user.impersonationMode === "READ_ONLY";

  async function handleExit() {
    try {
      setExiting(true);
      await apiFetch<{ success: boolean }>("/superadmin/impersonate/exit", {
        method: "POST",
      });
      try {
        if (onExit) onExit();
      } catch (_) {}
      window.location.href = "/dashboard/super-admin/super-control";
    } catch (err) {
      console.error("Failed to exit impersonation:", err);
      window.location.href = "/dashboard/super-admin/super-control";
    } finally {
      setExiting(false);
    }
  }

  return (
    <aside
      aria-label="Active Impersonation Mode Banner"
      className="sticky top-0 z-[9999] w-full border-b border-amber-500/40 bg-gradient-to-r from-amber-950/90 via-slate-950/95 to-amber-950/90 px-4 py-2.5 backdrop-blur-md shadow-lg shadow-amber-950/30 transition-all duration-300"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-amber-300 border border-amber-500/30 font-semibold tracking-wide uppercase text-[11px]">
            <svg className="h-3.5 w-3.5 animate-pulse text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Shadow Session</span>
          </div>

          <div className="flex items-center gap-1 text-slate-200">
            <span>Viewing as</span>
            <span className="font-bold text-white underline decoration-amber-400/50 underline-offset-2">
              {user.name || user.email}
            </span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700">
              {user.role}
            </span>
          </div>

          {isReadOnly ? (
            <span className="hidden md:inline-flex items-center gap-1 rounded bg-sky-950/60 px-2 py-0.5 text-[11px] font-medium text-sky-300 border border-sky-800/60">
              <svg className="h-3 w-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Watch Mode (Read-Only)
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center gap-1 rounded bg-amber-950/60 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-800/60">
              Full Operational Delegation
            </span>
          )}

          <span className="hidden lg:inline text-[11px] text-slate-400">
            • Audit trail logged under SuperAdmin
          </span>
        </div>

        <button
          onClick={handleExit}
          disabled={exiting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-md transition hover:from-amber-400 hover:to-amber-500 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {exiting ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Restoring...</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Exit Impersonation</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
