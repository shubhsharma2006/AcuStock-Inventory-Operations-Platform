"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { STORY_CHAPTERS } from "@/components/ThreeLandingScene";

// Dynamically import Three.js scene to avoid any SSR canvas issues
const ThreeLandingScene = dynamic(
  () => import("@/components/ThreeLandingScene"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[520px] w-full items-center justify-center rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-8 text-cyan-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <span className="font-mono text-xs uppercase tracking-widest">
            Initializing 3D Neural Scene & AcuBot Core...
          </span>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(1); // Start at Act II: Awakening
  const [activeAction, setActiveAction] = useState<string | null>("scan");
  const [simulatedLogs, setSimulatedLogs] = useState<string[]>([
    "STOCK_IN: 50 units [SKU-X400] sealed into Bin A-14 • Serial auto-indexed",
    "WARRANTY_BIND: Serial #SN-98211 supplier warranty valid 24M",
    "LEDGER_RECONCILE: Zero variance against physical pallet scan",
  ]);

  const activeChapter = STORY_CHAPTERS[currentChapterIndex] || STORY_CHAPTERS[0];

  const triggerSimulation = () => {
    const serial = `SN-${Math.floor(100000 + Math.random() * 900000)}`;
    const newLog = `DISPATCH: Serial #${serial} released to Bay 2 • Manifest PDF authenticated`;
    setSimulatedLogs((prev) => [newLog, ...prev.slice(0, 3)]);
    setActiveAction("scan");
  };

  return (
    <div className="relative min-h-screen bg-[#050c18] text-slate-100 overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200 font-sans">
      {/* Background ambient lighting effects */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] h-[700px] w-[700px] rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[20%] h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-25" />
      </div>

      {/* Top Floating Cyber Nav */}
      <header className="sticky top-4 z-50 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-cyan-500 shadow-md shadow-amber-500/20">
              <span className="font-mono text-lg font-black text-slate-950">A</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-white">
                  Acu<span className="text-cyan-400">Stock</span>
                </span>
                <span className="rounded-full bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-300">
                  v3.0 3D
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Autonomous Enterprise Inventory</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <a href="#storyline" className="transition hover:text-cyan-300">
              The Storyline
            </a>
            <a href="#features" className="transition hover:text-cyan-300">
              Sensory Grid
            </a>
            <a href="#ledger" className="transition hover:text-cyan-300">
              Immutable Ledger
            </a>
            <a href="#roles" className="transition hover:text-cyan-300">
              Role Portals
            </a>
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard/admin"
              className="rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:opacity-95"
            >
              Launch Dashboard →
            </Link>
          </div>
        </nav>
      </header>

      {/* Main Hero & 3D Interactive Character Experience */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-center">
          {/* Left Column: 3D Three.js Character Canvas */}
          <div className="relative h-[560px] sm:h-[620px] w-full">
            <ThreeLandingScene
              currentChapterIndex={currentChapterIndex}
              onChapterSelect={setCurrentChapterIndex}
              activeAction={activeAction}
              onActionTriggered={(act) => setActiveAction(act)}
            />
          </div>

          {/* Right Column: Dynamic Storyline Chronicle Card */}
          <div className="flex flex-col justify-between rounded-3xl border border-white/10 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl">
            <div>
              {/* Chapter Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                {activeChapter.badge}
              </div>

              {/* Title & Subtitle */}
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {activeChapter.title}
              </h1>
              <p className="mt-2 text-sm font-medium text-amber-300/90 font-mono">
                {activeChapter.subtitle}
              </p>

              {/* Narrative Story Description */}
              <p className="mt-5 text-sm leading-relaxed text-slate-300">
                {activeChapter.narrative}
              </p>

              {/* Impact KPI Grid for current chapter */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                {activeChapter.stats.map((st) => (
                  <div
                    key={st.label}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-center"
                  >
                    <div className="text-lg font-bold font-mono text-white sm:text-xl">
                      {st.value}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
                      {st.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chapter Stepper Quick Links */}
            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3">
                Select Storyline Act:
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STORY_CHAPTERS.map((chap, idx) => (
                  <button
                    key={chap.id}
                    type="button"
                    onClick={() => setCurrentChapterIndex(idx)}
                    className={`flex flex-col items-start rounded-xl p-2.5 text-left transition border ${
                      idx === currentChapterIndex
                        ? "border-cyan-400/60 bg-cyan-500/15 text-white shadow-md shadow-cyan-500/10"
                        : "border-white/5 bg-slate-950/40 text-slate-400 hover:border-white/10 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-[10px] font-mono text-cyan-400 font-bold">
                      ACT 0{chap.id}
                    </span>
                    <span className="text-xs font-semibold truncate w-full mt-0.5">
                      {chap.title}
                    </span>
                  </button>
                ))}
              </div>

              {/* Primary Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard/admin"
                  className="flex-1 min-w-[180px] rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-blue-400"
                >
                  Enter Live Control Console →
                </Link>
                <button
                  type="button"
                  onClick={triggerSimulation}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  ⚡ Simulate Scan
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Sensory Ledger Ticker */}
      <section className="relative z-10 border-y border-white/10 bg-slate-950/80 py-4 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE SENSORY STREAM:</span>
            </div>
            <div className="flex-1 min-w-[280px]">
              <div className="rounded-xl bg-slate-900/90 border border-white/10 px-4 py-2 font-mono text-xs text-slate-300 truncate">
                {simulatedLogs[0]}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Tenant Isolation: <strong className="text-emerald-400">Strict</strong></span>
              <span>Ledger Drift: <strong className="text-cyan-400">0.00%</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* Deep Dive: The 4 Acts of AcuStock Storyline */}
      <section id="storyline" className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
            The Chronicle of Modern Warehousing
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            From Spreadsheet Catastrophe to Autonomous Precision
          </h2>
          <p className="mt-4 text-sm text-slate-400 sm:text-base">
            Follow the journey of how AcuStock replaced fragile legacy systems with an unyielding 
            cryptographic sensory mesh and real-time robotic reconciliation.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STORY_CHAPTERS.map((chapter) => (
            <div
              key={chapter.id}
              className={`group relative flex flex-col justify-between rounded-3xl border p-6 backdrop-blur-xl transition-all hover:-translate-y-1 ${
                chapter.id === activeChapter.id
                  ? "border-cyan-400/50 bg-slate-900/80 shadow-xl shadow-cyan-500/10"
                  : "border-white/10 bg-slate-900/40 hover:border-white/20"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-cyan-400">
                    ACT 0{chapter.id}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    {chapter.stats[0]?.label}
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-bold text-white group-hover:text-cyan-300 transition">
                  {chapter.title}
                </h3>
                <p className="mt-2 text-xs font-medium text-amber-300/80">
                  {chapter.subtitle}
                </p>
                <p className="mt-4 text-xs leading-relaxed text-slate-300">
                  {chapter.narrative}
                </p>
              </div>

              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="text-[11px] font-mono text-slate-400">
                  Key Metric: <strong className="text-white">{chapter.stats[0]?.value}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentChapterIndex(chapter.id - 1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                >
                  View 3D Simulation →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Grid: The Sensory Grid & Modules */}
      <section id="features" className="relative z-10 border-t border-white/10 bg-slate-950/60 py-20 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono uppercase tracking-[0.25em] text-cyan-400">
              Battle-Tested Architecture
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">
              Engineered for Zero Stock Discrepancy
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-xl">
                📦
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Immutable Stock Ledgers</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Every transaction (Stock IN, Stock OUT, Transfer, Return) produces an immutable ledger
                record. No historical edit can overwrite truth.
              </p>
              <div className="mt-4 font-mono text-[11px] text-cyan-300">
                ✓ Full Double-Entry Accounting
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-400/20 text-amber-300 text-xl">
                🛡️
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Serial & Warranty Guard</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Granular serial number tracking with dual warranty clocks: supplier purchase warranty
                and customer seller warranty.
              </p>
              <div className="mt-4 font-mono text-[11px] text-amber-300">
                ✓ Auto-Expiring Alert Triggers
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-xl">
                🚀
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Order & Logistics Pipeline</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Purchase orders, sales invoices, and multi-stage shipment dispatch with cryptographically
                generated authenticated PDF receipts.
              </p>
              <div className="mt-4 font-mono text-[11px] text-emerald-300">
                ✓ Authenticated PDF Engine
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Role-Based Portal Access */}
      <section id="roles" className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-mono uppercase tracking-[0.25em] text-amber-400">
            Multi-Tenant RBAC Governance
          </span>
          <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">
            Choose Your Operational Surface
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            AcuStock isolates capabilities with strict server-side permissions for every seat.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {/* Admin Role Card */}
          <div className="relative rounded-3xl border border-amber-400/30 bg-slate-900/60 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 text-[10px] font-mono font-bold text-amber-300 uppercase">
                Executive
              </span>
              <span className="text-xl">👑</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-white">ADMIN Console</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Full organizational control: billing, audit trails, company directories, security
              permissions, and inventory policies.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/admin"
                className="block w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 py-2.5 text-center text-xs font-bold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
              >
                Access Admin Portal →
              </Link>
            </div>
          </div>

          {/* Manager Role Card */}
          <div className="relative rounded-3xl border border-cyan-400/30 bg-slate-900/60 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-1 text-[10px] font-mono font-bold text-cyan-300 uppercase">
                Operations
              </span>
              <span className="text-xl">⚡</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-white">MANAGER Console</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Warehouse operations: Stock IN/OUT, supplier purchase orders, customer sales orders,
              transfers, and logistics fulfillment.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/manager"
                className="block w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2.5 text-center text-xs font-bold text-slate-950 transition hover:from-cyan-300 hover:to-blue-400"
              >
                Access Manager Portal →
              </Link>
            </div>
          </div>

          {/* User Role Card */}
          <div className="relative rounded-3xl border border-emerald-400/30 bg-slate-900/60 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 text-[10px] font-mono font-bold text-emerald-300 uppercase">
                Floor Specialist
              </span>
              <span className="text-xl">🔍</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-white">USER Console</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Floor scanning: barcode / serial lookup, stock balance verification, warranty status checks,
              and receipt validation.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/user"
                className="block w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-2.5 text-center text-xs font-bold text-slate-950 transition hover:from-emerald-300 hover:to-teal-400"
              >
                Access User Portal →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950/90 py-12 text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-slate-950 font-bold font-mono">
                A
              </div>
              <span className="text-sm font-bold text-white">
                AcuStock 3D • Next-Gen Autonomous Inventory
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="hover:text-cyan-300 transition">
                Sign In
              </Link>
              <Link href="/dashboard" className="hover:text-cyan-300 transition">
                Direct Dashboard
              </Link>
              <a href="#storyline" className="hover:text-cyan-300 transition">
                Storyline
              </a>
              <span className="text-slate-500">© 2026 AcuStock Inc. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
