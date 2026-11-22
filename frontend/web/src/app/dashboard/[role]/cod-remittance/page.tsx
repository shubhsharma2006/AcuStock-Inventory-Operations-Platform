'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface UnremittedShipment {
  _id: string;
  reference: string;
  awb: string;
  customerName: string;
  phone: string;
  city: string;
  carrierType: string;
  codAmount: number;
  deliveredAt: string;
  daysSinceDelivery: number;
  agingCategory: 'ON_TIME' | 'AGING' | 'OVERDUE';
}

interface RemittanceBatch {
  _id: string;
  remittanceNumber: string;
  carrierName: string;
  bankDetails: {
    utrNumber: string;
    bankName: string;
    accountNumber?: string;
    transferDate: string;
  };
  cycle: 'STANDARD_T7' | 'EARLY_T1' | 'EARLY_T2';
  financialSummary: {
    totalOrders: number;
    grossCodCollected: number;
    totalFreightDeducted: number;
    totalEarlyCodFees: number;
    netRemittedAmount: number;
    discrepancyCount: number;
  };
  status: 'PROCESSING' | 'REMITTED' | 'RECONCILED' | 'DISCREPANCY_FLAGGED';
  remarks?: string;
  createdAt: string;
}

interface CodMetrics {
  totalRemittedAmount: number;
  inTransitCodAmount: number;
  overdueCodAmount: number;
  unremittedCount: number;
  totalEarlyCodFeesPaid: number;
  activeDiscrepanciesCount: number;
  totalBatchesCount: number;
}

export default function CodRemittancePage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'UNREMITTED' | 'BATCHES' | 'UPLOAD_ADVICE'>('UNREMITTED');
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // Upload Advice State
  const [adviceCarrier, setAdviceCarrier] = useState('Delhivery Express');
  const [adviceUtr, setAdviceUtr] = useState('HDFC000881920391');
  const [adviceBank, setAdviceBank] = useState('HDFC Bank');
  const [adviceCycle, setAdviceCycle] = useState<'STANDARD_T7' | 'EARLY_T1' | 'EARLY_T2'>('STANDARD_T7');
  const [adviceAwb, setAdviceAwb] = useState('DEL-99210034');
  const [adviceAmount, setAdviceAmount] = useState('2450');
  const [adviceFreight, setAdviceFreight] = useState('65');

  // 1. Fetch Summary Metrics
  const { data: metricsData } = useQuery<{ success: boolean; metrics: CodMetrics }>({
    queryKey: ['cod-metrics'],
    queryFn: () => apiFetch('/cod-remittance/dashboard'),
    refetchInterval: 30_000
  });

  // 2. Fetch Unremitted Shipments
  const { data: unremittedData, isLoading: loadingUnremitted, refetch: refetchUnremitted } = useQuery<{
    success: boolean;
    unremitted: UnremittedShipment[];
    totalPendingAmount: number;
    overdueAmount: number;
  }>({
    queryKey: ['cod-unremitted'],
    queryFn: () => apiFetch('/cod-remittance/unremitted'),
    enabled: activeTab === 'UNREMITTED',
    refetchInterval: 30_000
  });

  // 3. Fetch Remittance Batches
  const { data: batchesData, isLoading: loadingBatches, refetch: refetchBatches } = useQuery<{
    success: boolean;
    remittances: RemittanceBatch[];
    total: number;
  }>({
    queryKey: ['cod-batches'],
    queryFn: () => apiFetch('/cod-remittance/remittances'),
    enabled: activeTab === 'BATCHES',
    refetchInterval: 30_000
  });

  // 4. Early COD Mutation
  const earlyCodMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/cod-remittance/request-early-cod', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(data.message || 'Early COD payout scheduled successfully!');
      setSelectedShipmentIds([]);
      queryClient.invalidateQueries({ queryKey: ['cod-unremitted'] });
      queryClient.invalidateQueries({ queryKey: ['cod-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['cod-batches'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to request early COD payout');
    }
  });

  // 5. Upload Advice Mutation
  const uploadAdviceMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/cod-remittance/upload-advice', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(`Remittance advice processed! Batch: ${data.remittance.remittanceNumber} | Net Deposited: ₹${data.remittance.financialSummary.netRemittedAmount}`);
      queryClient.invalidateQueries({ queryKey: ['cod-batches'] });
      queryClient.invalidateQueries({ queryKey: ['cod-metrics'] });
      setActiveTab('BATCHES');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to process remittance advice');
    }
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedShipmentIds(unremittedData?.unremitted.map(s => s._id) || []);
    } else {
      setSelectedShipmentIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedShipmentIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleRequestEarlyCod = () => {
    if (selectedShipmentIds.length === 0) return;
    earlyCodMutation.mutate({
      shipmentIds: selectedShipmentIds,
      cycle: 'EARLY_T1'
    });
  };

  const handleAdviceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadAdviceMutation.mutate({
      carrierName: adviceCarrier,
      utrNumber: adviceUtr.trim(),
      bankName: adviceBank,
      cycle: adviceCycle,
      rows: [
        {
          awb: adviceAwb.trim(),
          collectedAmount: Number(adviceAmount),
          freightCharge: Number(adviceFreight)
        }
      ]
    });
  };

  const metrics = metricsData?.metrics || {
    totalRemittedAmount: 0,
    inTransitCodAmount: 0,
    overdueCodAmount: 0,
    unremittedCount: 0,
    totalEarlyCodFeesPaid: 0,
    activeDiscrepanciesCount: 0,
    totalBatchesCount: 0
  };

  const unremittedItems = unremittedData?.unremitted || [];
  const filteredUnremitted = unremittedItems.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.reference.toLowerCase().includes(q) || s.awb.toLowerCase().includes(q) || s.customerName.toLowerCase().includes(q);
  });

  const selectedTotal = unremittedItems
    .filter(s => selectedShipmentIds.includes(s._id))
    .reduce((sum, s) => sum + s.codAmount, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>💰</span> Automated COD Remittance & Instant Settlement Portal
            </h1>
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/30">
              T+1 Cashflow Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reconcile carrier cash-on-delivery collections, audit bank UTR deposits, and liquidate in-transit cash in 24 hours.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl border border-white/10 bg-slate-900 p-1">
          <button
            onClick={() => setActiveTab('UNREMITTED')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'UNREMITTED'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🚚 In-Transit Cash ({metrics.unremittedCount})
          </button>
          <button
            onClick={() => setActiveTab('BATCHES')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'BATCHES'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🏦 Remittance Batches & UTRs
          </button>
          <button
            onClick={() => setActiveTab('UPLOAD_ADVICE')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'UPLOAD_ADVICE'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📥 Reconcile Advice
          </button>
        </div>
      </div>

      {/* ── Notification Banner ──────────────────────────────────────────── */}
      {notificationBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
          <span className="flex items-center gap-2 font-medium">
            <span>✅</span> {notificationBanner}
          </span>
          <button onClick={() => setNotificationBanner(null)} className="text-emerald-400 hover:text-emerald-200">
            ✕
          </button>
        </div>
      )}

      {/* ── Top Financial KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Remitted */}
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
            Remitted to Bank Account
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-300">
              ₹{metrics.totalRemittedAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Across {metrics.totalBatchesCount} verified UTR batches
          </p>
        </div>

        {/* In-Transit COD Cash */}
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
            In-Transit COD Cash
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-300">
              ₹{metrics.inTransitCodAmount.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-slate-400">({metrics.unremittedCount} orders)</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Delivered & collected by couriers
          </p>
        </div>

        {/* Overdue (>7d) at Risk */}
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400">
            Overdue Remittance (&gt; 7 Days)
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-rose-300">
              ₹{metrics.overdueCodAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Held past contractual settlement
          </p>
        </div>

        {/* Active Discrepancies */}
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
            Shortage / Deductions Flagged
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-indigo-300">
              {metrics.activeDiscrepanciesCount}
            </span>
            <span className="text-xs text-slate-400">claims</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Under courier reconciliation review
          </p>
        </div>
      </div>

      {/* ── TAB 1: IN-TRANSIT CASH & EARLY COD LIQUIDATION ─────────────────── */}
      {activeTab === 'UNREMITTED' && (
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <input
                type="text"
                placeholder="Search delivered COD parcels by AWB, Reference, or Customer…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {selectedShipmentIds.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="text-xs font-mono">
                  Selected <b className="text-white">{selectedShipmentIds.length} orders</b> (
                  <b className="text-emerald-400">₹{selectedTotal.toLocaleString('en-IN')}</b>)
                </div>
                <button
                  onClick={handleRequestEarlyCod}
                  disabled={earlyCodMutation.isPending}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:brightness-110 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {earlyCodMutation.isPending ? 'Liquidating…' : '⚡ Request Early COD Payout (T+1) ❯'}
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-950/60 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4 w-10">
                      <input
                        type="checkbox"
                        onChange={handleSelectAll}
                        checked={selectedShipmentIds.length > 0 && selectedShipmentIds.length === filteredUnremitted.length}
                        className="rounded border-white/20 bg-slate-950 text-emerald-500"
                      />
                    </th>
                    <th className="py-3.5 px-4">AWB & Order Reference</th>
                    <th className="py-3.5 px-4">Recipient & City</th>
                    <th className="py-3.5 px-4">Carrier</th>
                    <th className="py-3.5 px-4">COD Amount Collected</th>
                    <th className="py-3.5 px-4">Days Since Delivery</th>
                    <th className="py-3.5 px-4 text-right">Aging Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-sans">
                  {loadingUnremitted ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                        Auditing unremitted courier cash accounts…
                      </td>
                    </tr>
                  ) : filteredUnremitted.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <span className="text-2xl block mb-2">🎉</span>
                        All delivered COD funds have been remitted to your bank account!
                      </td>
                    </tr>
                  ) : (
                    filteredUnremitted.map((s) => {
                      const isSelected = selectedShipmentIds.includes(s._id);
                      const isOverdue = s.agingCategory === 'OVERDUE';

                      return (
                        <tr
                          key={s._id}
                          className={`hover:bg-white/[0.02] transition ${isSelected ? 'bg-emerald-500/5' : ''}`}
                        >
                          <td className="py-3.5 px-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(s._id)}
                              className="rounded border-white/20 bg-slate-950 text-emerald-500"
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-white">{s.awb}</div>
                            <div className="font-mono text-[11px] text-slate-400">{s.reference}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{s.customerName}</div>
                            <div className="text-[11px] text-slate-500">{s.city}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300 border border-white/5">
                              {s.carrierType}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-sm font-black font-mono text-emerald-400">
                              ₹{s.codAmount.toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs">
                            <b className={isOverdue ? 'text-rose-400' : 'text-slate-300'}>
                              {s.daysSinceDelivery} Days
                            </b>
                            <div className="text-[10px] text-slate-500">
                              {new Date(s.deliveredAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold border ${
                                isOverdue
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                                  : s.agingCategory === 'AGING'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 border-white/5'
                              }`}
                            >
                              {s.agingCategory === 'OVERDUE' ? '🚨 OVERDUE (>7D)' : s.agingCategory}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: REMITTANCE BATCHES & UTR DEPOSITS ─────────────────────── */}
      {activeTab === 'BATCHES' && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-slate-950/60 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Batch # / UTR Number</th>
                  <th className="py-3.5 px-4">Carrier & Bank</th>
                  <th className="py-3.5 px-4">Cycle</th>
                  <th className="py-3.5 px-4">Orders Reconciled</th>
                  <th className="py-3.5 px-4">Gross Collected</th>
                  <th className="py-3.5 px-4">Freight Deductions</th>
                  <th className="py-3.5 px-4">Net Deposited</th>
                  <th className="py-3.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {loadingBatches ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                      Loading bank deposit records…
                    </td>
                  </tr>
                ) : batchesData?.remittances && batchesData.remittances.length > 0 ? (
                  batchesData.remittances.map((b) => (
                    <tr key={b._id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white">{b.remittanceNumber}</div>
                        <div className="font-mono text-[11px] text-amber-400">{b.bankDetails.utrNumber}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-white font-medium">{b.carrierName}</div>
                        <div className="text-[11px] text-slate-400">{b.bankDetails.bankName}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                          {b.cycle}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-white">
                        {b.financialSummary.totalOrders} parcels
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        ₹{b.financialSummary.grossCodCollected.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-rose-400">
                        -₹{b.financialSummary.totalFreightDeducted.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-sm font-black text-emerald-400">
                        ₹{b.financialSummary.netRemittedAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold border ${
                            b.status === 'RECONCILED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No remittance batches found. Use the Reconcile Advice tab to ingest courier settlement reports.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: UPLOAD & RECONCILE REMITTANCE ADVICE ───────────────────── */}
      {activeTab === 'UPLOAD_ADVICE' && (
        <div className="max-w-xl mx-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
          <div className="border-b border-white/10 pb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📥</span> Ingest Courier Remittance Advice Report
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Paste or submit courier bank transfer details to automatically reconcile delivered COD orders and flag shortage discrepancies.
            </p>
          </div>

          <form onSubmit={handleAdviceSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">Carrier Name</label>
                <select
                  value={adviceCarrier}
                  onChange={(e) => setAdviceCarrier(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="Delhivery Express">Delhivery Express</option>
                  <option value="Blue Dart Express">Blue Dart Express</option>
                  <option value="Bigship Logistics">Bigship Logistics</option>
                  <option value="DTDC Cargo">DTDC Cargo</option>
                  <option value="Xpressbees">Xpressbees</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">Bank UTR Number</label>
                <input
                  type="text"
                  value={adviceUtr}
                  onChange={(e) => setAdviceUtr(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono uppercase"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">Bank Name</label>
                <input
                  type="text"
                  value={adviceBank}
                  onChange={(e) => setAdviceBank(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">Settlement Cycle</label>
                <select
                  value={adviceCycle}
                  onChange={(e) => setAdviceCycle(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="STANDARD_T7">Standard Cycle (T+7)</option>
                  <option value="EARLY_T1">Early FastPay (T+1 - 1.5% fee)</option>
                  <option value="EARLY_T2">Early FastPay (T+2 - 1.0% fee)</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-3">
              <span className="text-[10px] uppercase font-bold text-amber-400">Order Line Reconciliation Entry</span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase">AWB Number</label>
                  <input
                    type="text"
                    value={adviceAwb}
                    onChange={(e) => setAdviceAwb(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase">COD Amount (₹)</label>
                  <input
                    type="number"
                    value={adviceAmount}
                    onChange={(e) => setAdviceAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase">Freight Deduct (₹)</label>
                  <input
                    type="number"
                    value={adviceFreight}
                    onChange={(e) => setAdviceFreight(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadAdviceMutation.isPending}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {uploadAdviceMutation.isPending ? 'Reconciling UTR Batch…' : 'Reconcile Remittance Batch ❯'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
