"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { BarcodeLabelModal } from "@/components/barcode/barcode-label-modal";

type StepStatus = "PENDING" | "COMPLETED";

type OnboardingStep = {
  id: string;
  number: number;
  title: string;
  description: string;
  actionText: string;
  actionHref?: string;
  isModalTrigger?: boolean;
  isAutoDetected?: boolean;
};

const STEPS_CONFIG: OnboardingStep[] = [
  {
    id: "step_company",
    number: 1,
    title: "Organization Profile & GST",
    description: "Configure your operating entity, legal business name, and GST/Tax ID.",
    actionText: "Configure Profile",
    actionHref: "/dashboard/admin/settings",
  },
  {
    id: "step_warehouse",
    number: 2,
    title: "Primary Warehouse Hub",
    description: "Establish your main fulfillment center and regional branch hubs.",
    actionText: "Set Up Hubs",
    actionHref: "/dashboard/admin/warehouses",
  },
  {
    id: "step_catalog",
    number: 3,
    title: "Define Product Catalog",
    description: "Add items with tracking policy (Standard, Serialized, or FEFO Batch).",
    actionText: "Add First Product",
    actionHref: "/dashboard/admin/products",
  },
  {
    id: "step_stock_in",
    number: 4,
    title: "Initial Stock Ingestion",
    description: "Record your first Stock IN intake and sign the immutable audit ledger.",
    actionText: "Intake Stock",
    actionHref: "/dashboard/admin/stock-in",
  },
  {
    id: "step_barcode",
    number: 5,
    title: "Dual Barcode & Scan Verification",
    description: "Generate 1D Code 128 / 2D QR labels and verify camera scan capability.",
    actionText: "Print Label Test",
    isModalTrigger: true,
  },
];

interface OnboardingWizardProps {
  productCount?: number;
  warehouseCount?: number;
  totalInCount?: number;
}

export function OnboardingWizard({
  productCount = 0,
  warehouseCount = 0,
  totalInCount = 0,
}: OnboardingWizardProps) {
  const { user } = useSession();
  const tenantKey = user?.tenantId ? `acustock_onboarding_${user.tenantId}` : "acustock_onboarding_default";

  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);

  // Load persistence
  useEffect(() => {
    setIsMounted(true);
    try {
      const stored = localStorage.getItem(tenantKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.completed) setCompletedSteps(parsed.completed);
        if (parsed.dismissed !== undefined) setIsDismissed(parsed.dismissed);
      }
    } catch {
      // localStorage unavailable or corrupted
    }
  }, [tenantKey]);

  // Auto-detect step completion from live metrics
  useEffect(() => {
    setCompletedSteps((prev) => {
      const updated = { ...prev };
      let changed = false;

      if (warehouseCount > 0 && !updated["step_warehouse"]) {
        updated["step_warehouse"] = true;
        changed = true;
      }
      if (productCount > 0 && !updated["step_catalog"]) {
        updated["step_catalog"] = true;
        changed = true;
      }
      if (totalInCount > 0 && !updated["step_stock_in"]) {
        updated["step_stock_in"] = true;
        changed = true;
      }

      if (changed) {
        try {
          localStorage.setItem(tenantKey, JSON.stringify({ completed: updated, dismissed: isDismissed }));
        } catch {}
        return updated;
      }
      return prev;
    });
  }, [warehouseCount, productCount, totalInCount, tenantKey, isDismissed]);

  function toggleStep(id: string) {
    setCompletedSteps((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(tenantKey, JSON.stringify({ completed: updated, dismissed: isDismissed }));
      } catch {}
      return updated;
    });
  }

  function handleDismiss(dismiss: boolean) {
    setIsDismissed(dismiss);
    try {
      localStorage.setItem(tenantKey, JSON.stringify({ completed: completedSteps, dismissed: dismiss }));
    } catch {}
  }

  const completedCount = useMemo(() => {
    return STEPS_CONFIG.filter((s) => completedSteps[s.id]).length;
  }, [completedSteps]);

  const percent = Math.round((completedCount / STEPS_CONFIG.length) * 100);

  if (!isMounted) return null;

  // Minimal collapsed state
  if (isDismissed) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-amber-200">
          <span>🚀 SaaS Setup Checklist:</span>
          <span className="font-semibold">{completedCount} of {STEPS_CONFIG.length} Completed ({percent}%)</span>
        </div>
        <button
          onClick={() => handleDismiss(false)}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-semibold text-amber-300 hover:bg-amber-500/20 transition"
        >
          Resume Setup
        </button>
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
      {/* Background Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 border border-amber-400/20">
              SaaS Quickstart Wizard
            </span>
            <span className="text-xs text-slate-400">
              Enterprise Go-Live Checklist
            </span>
          </div>
          <h3 className="mt-1 text-lg font-bold text-white">
            Get Your Warehouse Production-Ready ({percent}% Complete)
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-xs font-mono font-bold text-emerald-400">
              {completedCount} / {STEPS_CONFIG.length} Steps Finished
            </div>
            <div className="mt-1 h-2 w-32 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => handleDismiss(true)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            Hide Wizard
          </button>
        </div>
      </div>

      {/* Steps Grid */}
      <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS_CONFIG.map((step) => {
          const isDone = Boolean(completedSteps[step.id]);

          return (
            <div
              key={step.id}
              className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                isDone
                  ? "border-emerald-500/30 bg-emerald-500/5 shadow-sm shadow-emerald-500/5"
                  : "border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-950/90"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isDone
                        ? "bg-emerald-500 text-slate-950"
                        : "border border-white/20 bg-white/5 text-slate-400"
                    }`}
                  >
                    {isDone ? "✓" : step.number}
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleStep(step.id)}
                    className="text-[10px] text-slate-400 hover:text-white"
                    title={isDone ? "Mark as Incomplete" : "Mark as Completed"}
                  >
                    {isDone ? "Done" : "Mark"}
                  </button>
                </div>

                <h4 className="mt-3 text-sm font-semibold text-white">
                  {step.title}
                </h4>
                <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                  {step.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5">
                {step.isModalTrigger ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBarcodeModalOpen(true);
                      toggleStep(step.id);
                    }}
                    style={!isDone ? { color: "#020617" } : undefined}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-center text-xs font-bold transition ${
                      isDone
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : "border border-amber-400/40 bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-sm"
                    }`}
                  >
                    {isDone ? "Re-test Label" : step.actionText}
                  </button>
                ) : (
                  <Link
                    href={step.actionHref || "#"}
                    style={!isDone ? { color: "#020617" } : undefined}
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-center text-xs font-bold transition ${
                      isDone
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : "border border-amber-400/40 bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-sm"
                    }`}
                  >
                    {isDone ? "Review" : step.actionText}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barcode Test Modal */}
      <BarcodeLabelModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        product={{
          _id: "demo_unit_01",
          sku: "ACU-DEMO-001",
          name: "Demo Barcode Verification Unit",
          serialNumber: "SN-DEMO-2026-99",
        }}
      />
    </section>
  );
}
