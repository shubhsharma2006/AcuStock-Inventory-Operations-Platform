'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface DiscrepancyItem {
  _id: string;
  discrepancyId: string;
  reference: string;
  awb: string;
  carrierName: string;
  declared: {
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    volumetricWeightKg: number;
  };
  carrierBilled: {
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    volumetricWeightKg: number;
    scannedAtHub: string;
  };
  discrepancy: {
    excessWeightKg: number;
    excessAmount: number;
    notifiedAt: string;
    autoDebitCutoffAt: string;
  };
  status: 'NEW' | 'DISPUTE_FILED' | 'ACCEPTED_BY_MERCHANT' | 'RESOLVED_IN_FAVOR_OF_MERCHANT' | 'REJECTED_BY_CARRIER' | 'AUTO_DEBITED';
  hoursRemaining: number;
  isUrgent: boolean;
  disputeEvidence?: {
    scalePhotoUrl?: string;
    dimensionsPhotoUrl?: string;
    merchantRemarks?: string;
    carrierDisputeId?: string;
    filedAt?: string;
  };
}

interface DiscrepancyMetrics {
  activeCount: number;
  totalExcessAmount: number;
  disputedAmount: number;
  savedAmount: number;
  urgentCutoffCount: number;
  totalEvaluatedCount: number;
}

export default function WeightDiscrepanciesPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dispute Filing Modal State
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<DiscrepancyItem | null>(null);
  const [scalePhotoUrl, setScalePhotoUrl] = useState('');
  const [dimensionsPhotoUrl, setDimensionsPhotoUrl] = useState('');
  const [merchantRemarks, setMerchantRemarks] = useState('');
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // 1. Fetch Summary Metrics
  const { data: metricsData } = useQuery<{ success: boolean; metrics: DiscrepancyMetrics }>({
    queryKey: ['discrepancy-metrics'],
    queryFn: () => apiFetch('/weight-discrepancies/dashboard'),
    refetchInterval: 30_000
  });

  // 2. Fetch Discrepancies List
  const { data: listData, isLoading, refetch } = useQuery<{ success: boolean; discrepancies: DiscrepancyItem[] }>({
    queryKey: ['weight-discrepancies', statusFilter, carrierFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (carrierFilter) params.append('carrier', carrierFilter);
      return apiFetch(`/weight-discrepancies?${params.toString()}`);
    },
    refetchInterval: 30_000
  });

  // 3. File Dispute Mutation
  const disputeMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/weight-discrepancies/dispute', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(`Dispute filed successfully! Carrier dispute token: ${data.data.carrierDisputeId}`);
      setSelectedDiscrepancy(null);
      queryClient.invalidateQueries({ queryKey: ['weight-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['discrepancy-metrics'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to file dispute');
    }
  });

  // 4. Accept Discrepancy Mutation
  const acceptMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/weight-discrepancies/accept', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setNotificationBanner('Weight discrepancy accepted and marked resolved.');
      queryClient.invalidateQueries({ queryKey: ['weight-discrepancies'] });
      queryClient.invalidateQueries({ queryKey: ['discrepancy-metrics'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to accept discrepancy');
    }
  });

  const handleOpenDispute = (item: DiscrepancyItem) => {
    setSelectedDiscrepancy(item);
    setScalePhotoUrl('https://cdn.acustock.com/proofs/scale_sample.jpg');
    setDimensionsPhotoUrl('https://cdn.acustock.com/proofs/box_measure.jpg');
    setMerchantRemarks(`Item verified on certified warehouse digital scale. Package dimensions ${item.declared.lengthCm}x${item.declared.widthCm}x${item.declared.heightCm} cm.`);
  };

  const handleDisputeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDiscrepancy) return;

    disputeMutation.mutate({
      discrepancyId: selectedDiscrepancy.discrepancyId,
      scalePhotoUrl,
      dimensionsPhotoUrl,
      merchantRemarks
    });
  };

  const handleAccept = (item: DiscrepancyItem) => {
    if (confirm(`Accept courier weight discrepancy for AWB ${item.awb}? Excess fee ₹${item.discrepancy.excessAmount} will be debited.`)) {
      acceptMutation.mutate({
        discrepancyId: item.discrepancyId,
        reason: 'Merchant accepted carrier scan'
      });
    }
  };

  const metrics = metricsData?.metrics || {
    activeCount: 0,
    totalExcessAmount: 0,
    disputedAmount: 0,
    savedAmount: 0,
    urgentCutoffCount: 0,
    totalEvaluatedCount: 0
  };

  const items = listData?.discrepancies || [];
  const filteredItems = items.filter(i => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return i.reference.toLowerCase().includes(q) || i.awb.toLowerCase().includes(q) || i.carrierName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>⚖️</span> Weight Discrepancy & Dispute Management Portal
            </h1>
            <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-indigo-400 border border-indigo-500/30">
              Courier DWS Sorter Audit
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reconcile warehouse scale weights against carrier billed weights and contest unjustified freight surcharges before auto-debit windows expire.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-amber-400 transition"
        >
          <span>🔄</span> Refresh Scans
        </button>
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

      {/* ── Top KPI Stat Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Discrepancies */}
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400">
            Pending Weight Flags
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{metrics.activeCount}</span>
            <span className="text-xs text-slate-400">parcels</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Excess claimed: ₹{metrics.totalExcessAmount.toLocaleString('en-IN')}
          </p>
        </div>

        {/* Auto-Debit Urgent Cutoff */}
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
            Urgent Cutoff (&lt; 24h)
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-300">{metrics.urgentCutoffCount}</span>
            <span className="text-xs text-slate-400">expiring</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Auto-debits unless disputed today
          </p>
        </div>

        {/* Amount Under Dispute */}
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
            Under Active Contest
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-indigo-300">
              ₹{metrics.disputedAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Awaiting courier audit review
          </p>
        </div>

        {/* Amount Saved / Won back */}
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
            Refunded / Saved Amount
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-300">
              ₹{metrics.savedAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Successfully won in merchant favor
          </p>
        </div>
      </div>

      {/* ── Filter & Search Bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <input
            type="text"
            placeholder="Search by AWB, Consignment, or Carrier…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="">All Statuses</option>
            <option value="NEW">New (Action Required)</option>
            <option value="DISPUTE_FILED">Dispute Filed</option>
            <option value="ACCEPTED_BY_MERCHANT">Accepted by Merchant</option>
            <option value="RESOLVED_IN_FAVOR_OF_MERCHANT">Won (Refunded)</option>
            <option value="AUTO_DEBITED">Auto-Debited</option>
          </select>

          <select
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="">All Carriers</option>
            <option value="Delhivery">Delhivery</option>
            <option value="Blue Dart">Blue Dart</option>
            <option value="DTDC">DTDC</option>
            <option value="Bigship">Bigship</option>
            <option value="Xpressbees">Xpressbees</option>
          </select>
        </div>

        <span className="text-xs font-mono text-slate-400">
          Showing <b>{filteredItems.length}</b> weight discrepancy claims
        </span>
      </div>

      {/* ── Discrepancies Data Table ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4">AWB & Consignment</th>
                <th className="py-3.5 px-4">Carrier & Hub Scanner</th>
                <th className="py-3.5 px-4">Declared vs Billed Weight</th>
                <th className="py-3.5 px-4">Dimensions (L×W×H)</th>
                <th className="py-3.5 px-4">Excess Amount Claimed</th>
                <th className="py-3.5 px-4">Auto-Debit Countdown</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    Auditing courier DWS scan logs…
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <span className="text-2xl block mb-2">🎉</span>
                    No pending weight discrepancies found. All declared weights match carrier DWS scans!
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isNew = item.status === 'NEW';
                  const isDisputed = item.status === 'DISPUTE_FILED';

                  return (
                    <tr key={item._id} className="hover:bg-white/[0.02] transition">
                      {/* AWB & Reference */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white">{item.awb}</div>
                        <div className="font-mono text-[11px] text-slate-400">{item.reference}</div>
                        <a
                          href={`/tracking/${encodeURIComponent(item.reference)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                        >
                          <span>🔗</span> View Microsite ❯
                        </a>
                      </td>

                      {/* Carrier */}
                      <td className="py-3.5 px-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300 border border-white/5">
                          {item.carrierName}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {item.carrierBilled.scannedAtHub}
                        </div>
                      </td>

                      {/* Declared vs Billed */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono">{item.declared.weightKg} kg</span>
                          <span className="text-slate-600">➔</span>
                          <span className="text-white font-mono font-bold">{item.carrierBilled.weightKg} kg</span>
                        </div>
                        <span className="inline-block mt-0.5 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-rose-300 border border-rose-500/30">
                          +{item.discrepancy.excessWeightKg} kg excess
                        </span>
                      </td>

                      {/* Dimensions */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-slate-400">
                          Decl: {item.declared.lengthCm}×{item.declared.widthCm}×{item.declared.heightCm} cm
                        </div>
                        <div className="text-white font-bold">
                          DWS: {item.carrierBilled.lengthCm}×{item.carrierBilled.widthCm}×{item.carrierBilled.heightCm} cm
                        </div>
                      </td>

                      {/* Excess Amount */}
                      <td className="py-3.5 px-4">
                        <div className="text-base font-black font-mono text-rose-400">
                          ₹{item.discrepancy.excessAmount}
                        </div>
                        <span className="text-[10px] text-slate-500">Freight Adjustment</span>
                      </td>

                      {/* Auto-Debit Countdown */}
                      <td className="py-3.5 px-4">
                        {isNew ? (
                          <div>
                            <div
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono font-bold ${
                                item.isUrgent
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              <span>⏱</span>
                              <span>{item.hoursRemaining}h remaining</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">until auto-debit</div>
                          </div>
                        ) : isDisputed ? (
                          <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-300 border border-indigo-500/30">
                            🛡️ DISPUTED ({item.disputeEvidence?.carrierDisputeId || 'Awaiting Review'})
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {isNew && (
                          <>
                            <button
                              onClick={() => handleOpenDispute(item)}
                              className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition shadow"
                            >
                              🛡️ Contest / Dispute ❯
                            </button>
                            <button
                              onClick={() => handleAccept(item)}
                              className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
                            >
                              Accept
                            </button>
                          </>
                        )}
                        {isDisputed && (
                          <span className="text-[11px] text-indigo-400 font-mono">Carrier Review Active</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dispute Evidence Modal ────────────────────────────────────────── */}
      {selectedDiscrepancy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">
                  CARRIER WEIGHT DISPUTE FORM
                </span>
                <h3 className="text-base font-bold text-white">
                  Contest AWB {selectedDiscrepancy.awb} ({selectedDiscrepancy.carrierName})
                </h3>
              </div>
              <button
                onClick={() => setSelectedDiscrepancy(null)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDisputeSubmit} className="space-y-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-slate-950 p-3 flex justify-between items-center text-[11px] font-mono">
                <div>
                  <span className="text-slate-400">Declared:</span> <b className="text-white">{selectedDiscrepancy.declared.weightKg} kg</b>
                </div>
                <div>
                  <span className="text-slate-400">Carrier Scan:</span> <b className="text-rose-400">{selectedDiscrepancy.carrierBilled.weightKg} kg</b>
                </div>
                <div>
                  <span className="text-slate-400">Contested Amount:</span> <b className="text-emerald-400">₹{selectedDiscrepancy.discrepancy.excessAmount}</b>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Scale Proof Image URL (Parcel on Weighing Scale)
                </label>
                <input
                  type="text"
                  value={scalePhotoUrl}
                  onChange={(e) => setScalePhotoUrl(e.target.value)}
                  placeholder="https://cdn.acustock.com/proofs/scale_image.jpg"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Measuring Tape / Dimensions Proof URL
                </label>
                <input
                  type="text"
                  value={dimensionsPhotoUrl}
                  onChange={(e) => setDimensionsPhotoUrl(e.target.value)}
                  placeholder="https://cdn.acustock.com/proofs/measure_tape.jpg"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Merchant Justification & Calibration Notes
                </label>
                <textarea
                  rows={3}
                  value={merchantRemarks}
                  onChange={(e) => setMerchantRemarks(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedDiscrepancy(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disputeMutation.isPending}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {disputeMutation.isPending ? 'Submitting Dispute to Carrier…' : 'Submit Dispute & Lock Auto-Debit ❯'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
