'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface NdrShipment {
  _id: string;
  reference: string;
  awb?: string;
  customerName: string;
  phone: string;
  city: string;
  carrierType: string;
  deliveryType: string;
  codAmount: number;
  productName: string;
  quantity: number;
  ndrDetails: {
    reason: string;
    rawReason?: string;
    attemptCount: number;
    hoursRemaining: number;
    urgency: 'CRITICAL' | 'WARNING' | 'NORMAL';
    ndrStatus?: string;
    action?: string;
    preferredTimeSlot?: string;
    customerComments?: string;
  };
}

interface NdrMetrics {
  activeNdrsCount: number;
  criticalCutoffCount: number;
  customerRespondedCount: number;
  rtoInitiatedCount: number;
  codAtRiskAmount: number;
  responseRatePercentage: number;
  rtoSavedPercentage: number;
}

export default function NdrManagementPage() {
  const queryClient = useQueryClient();

  const [carrierFilter, setCarrierFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution Modal State
  const [selectedShipment, setSelectedShipment] = useState<NdrShipment | null>(null);
  const [actionType, setActionType] = useState<'REATTEMPT' | 'UPDATE_DETAILS' | 'HOLD_HUB' | 'RTO_IMMEDIATE'>('REATTEMPT');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('MORNING_9_TO_12');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [alternateAddress, setAlternateAddress] = useState('');
  const [remarks, setRemarks] = useState('');
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // 1. Fetch Metrics
  const { data: metricsData } = useQuery<{ success: boolean; metrics: NdrMetrics }>({
    queryKey: ['ndr-metrics'],
    queryFn: () => apiFetch('/ndr/dashboard'),
    refetchInterval: 30_000
  });

  // 2. Fetch NDR Shipments
  const { data: shipmentsData, isLoading, refetch } = useQuery<{ success: boolean; shipments: NdrShipment[] }>({
    queryKey: ['ndr-shipments', carrierFilter, reasonFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (carrierFilter) params.append('carrier', carrierFilter);
      if (reasonFilter) params.append('reason', reasonFilter);
      return apiFetch(`/ndr/shipments?${params.toString()}`);
    },
    refetchInterval: 30_000
  });

  // 3. Resolve Mutation
  const resolveMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/ndr/resolve', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(data.message || 'NDR action successfully dispatched to carrier.');
      setSelectedShipment(null);
      queryClient.invalidateQueries({ queryKey: ['ndr-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ndr-metrics'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to dispatch NDR instruction');
    }
  });

  const handleOpenResolve = (shipment: NdrShipment, defaultAction: 'REATTEMPT' | 'RTO_IMMEDIATE' = 'REATTEMPT') => {
    setSelectedShipment(shipment);
    setActionType(defaultAction);
    setAlternatePhone(shipment.phone || '');
    setAlternateAddress('');
    setPreferredDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    setPreferredTimeSlot('MORNING_9_TO_12');
    setRemarks(shipment.ndrDetails.customerComments || '');
  };

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipment) return;

    resolveMutation.mutate({
      shipmentId: selectedShipment._id,
      action: actionType,
      preferredDate: actionType === 'REATTEMPT' ? preferredDate : undefined,
      preferredTimeSlot: actionType === 'REATTEMPT' ? preferredTimeSlot : undefined,
      alternatePhone: alternatePhone.trim() || undefined,
      alternateAddress: alternateAddress.trim() || undefined,
      remarks: remarks.trim()
    });
  };

  const metrics = metricsData?.metrics || {
    activeNdrsCount: 0,
    criticalCutoffCount: 0,
    customerRespondedCount: 0,
    rtoInitiatedCount: 0,
    codAtRiskAmount: 0,
    responseRatePercentage: 100,
    rtoSavedPercentage: 100
  };

  const allShipments = shipmentsData?.shipments || [];
  const filteredShipments = allShipments.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.reference.toLowerCase().includes(q) ||
      (s.awb && s.awb.toLowerCase().includes(q)) ||
      s.customerName.toLowerCase().includes(q) ||
      s.phone.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>🚨</span> NDR Control Tower & Re-Attempt Engine
            </h1>
            <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-rose-400 border border-rose-500/30">
              Bigship Aggregator Mode
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time failed delivery detection, multi-channel customer re-attempts, and automated RTO prevention.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-amber-400 transition"
        >
          <span>🔄</span> Refresh Telemetry
        </button>
      </div>

      {/* ── Notification Banner ─────────────────────────────────────────── */}
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
        {/* Active NDRs */}
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400">
            Active Undelivered Parcels
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{metrics.activeNdrsCount}</span>
            <span className="text-xs text-slate-400">exceptions</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Requiring buyer or ops intervention
          </p>
        </div>

        {/* Critical Cutoff */}
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
            Urgent Cutoff (&lt; 24h)
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-300">{metrics.criticalCutoffCount}</span>
            <span className="text-xs text-slate-400">near RTO</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            At risk of courier forced return
          </p>
        </div>

        {/* Customer Response Rate */}
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
            Customer Response Rate
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-indigo-300">
              {metrics.responseRatePercentage}%
            </span>
            <span className="text-xs text-slate-400">via tracking link</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {metrics.customerRespondedCount} buyer self-reschedules
          </p>
        </div>

        {/* COD at Risk */}
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 shadow-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
            COD Cash Flow at Risk
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-300">
              ₹{metrics.codAtRiskAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Salvage rate: {metrics.rtoSavedPercentage}%
          </p>
        </div>
      </div>

      {/* ── Search & Filter Controls ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <input
            type="text"
            placeholder="Search by AWB, Reference, or Recipient Phone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />

          <select
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="">All Carriers</option>
            <option value="BIGSHIP">Bigship</option>
            <option value="DELHIVERY">Delhivery</option>
            <option value="BLUEDART">Blue Dart</option>
            <option value="DTDC">DTDC</option>
            <option value="PORTER">Porter</option>
            <option value="SHIPROCKET">Shiprocket</option>
          </select>

          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="">All Failure Reasons</option>
            <option value="CUSTOMER_UNAVAILABLE">Customer Unavailable</option>
            <option value="INCORRECT_ADDRESS">Address / Landmark Incomplete</option>
            <option value="CUSTOMER_REFUSED">Customer Refused</option>
            <option value="COD_NOT_READY">COD Cash Not Ready</option>
            <option value="PHONE_UNREACHABLE">Phone Unreachable</option>
            <option value="ENTRY_RESTRICTED">Entry Restricted</option>
            <option value="CUSTOMER_RESCHEDULE_REQUESTED">Buyer Reschedule Request</option>
          </select>
        </div>

        <span className="text-xs font-mono text-slate-400">
          Showing <b>{filteredShipments.length}</b> undelivered packages
        </span>
      </div>

      {/* ── NDR Data Table ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/60 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4">Consignment / AWB</th>
                <th className="py-3.5 px-4">Recipient & City</th>
                <th className="py-3.5 px-4">Carrier & Mode</th>
                <th className="py-3.5 px-4">NDR Reason & Attempts</th>
                <th className="py-3.5 px-4">RTO Cutoff Countdown</th>
                <th className="py-3.5 px-4">Buyer Response</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    Acquiring real-time carrier NDR telemetry…
                  </td>
                </tr>
              ) : filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <span className="text-2xl block mb-2">🎉</span>
                    No pending delivery exceptions found. All parcels on schedule!
                  </td>
                </tr>
              ) : (
                filteredShipments.map((s) => {
                  const urgency = s.ndrDetails.urgency;
                  const hasCustomerChoice = Boolean(s.ndrDetails.customerComments || s.ndrDetails.action);

                  return (
                    <tr key={s._id} className="hover:bg-white/[0.02] transition">
                      {/* Consignment & AWB */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white">{s.reference}</div>
                        {s.awb ? (
                          <div className="font-mono text-[11px] text-amber-300">{s.awb}</div>
                        ) : (
                          <span className="text-[10px] text-slate-500">Pending AWB</span>
                        )}
                        <a
                          href={`/tracking/${encodeURIComponent(s.reference)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                        >
                          <span>🔗</span> View Microsite ❯
                        </a>
                      </td>

                      {/* Recipient */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{s.customerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{s.phone}</div>
                        <div className="text-[11px] text-slate-500">{s.city}</div>
                      </td>

                      {/* Carrier & Mode */}
                      <td className="py-3.5 px-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300 border border-white/5">
                          {s.carrierType}
                        </span>
                        <div className="mt-1 font-mono text-[11px]">
                          {s.deliveryType === 'COD' ? (
                            <span className="text-amber-400 font-bold">COD: ₹{s.codAmount}</span>
                          ) : (
                            <span className="text-emerald-400 font-medium">Prepaid</span>
                          )}
                        </div>
                      </td>

                      {/* Reason & Attempts */}
                      <td className="py-3.5 px-4">
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                          {s.ndrDetails.reason.replace(/_/g, ' ')}
                        </span>
                        <div className="mt-1 text-[11px] text-slate-400">
                          Attempt <b className="text-white">#{s.ndrDetails.attemptCount}</b>
                        </div>
                      </td>

                      {/* Cutoff Timer */}
                      <td className="py-3.5 px-4">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono font-bold ${
                            urgency === 'CRITICAL'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                              : urgency === 'WARNING'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border border-white/10'
                          }`}
                        >
                          <span>⏱</span>
                          <span>{s.ndrDetails.hoursRemaining}h remaining</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">before carrier RTO</div>
                      </td>

                      {/* Buyer Response */}
                      <td className="py-3.5 px-4">
                        {hasCustomerChoice ? (
                          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-2 text-[11px]">
                            <span className="font-bold text-indigo-300 block">
                              Choice: {s.ndrDetails.action?.replace(/_/g, ' ') || 'Preference Received'}
                            </span>
                            {s.ndrDetails.customerComments && (
                              <p className="text-slate-300 italic mt-0.5 line-clamp-2">
                                &quot;{s.ndrDetails.customerComments}&quot;
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">No buyer response yet</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenResolve(s, 'REATTEMPT')}
                          className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition shadow"
                        >
                          Reattempt ❯
                        </button>
                        <button
                          onClick={() => handleOpenResolve(s, 'RTO_IMMEDIATE')}
                          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500 hover:text-white transition"
                        >
                          Force RTO
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Resolution Modal ────────────────────────────────────────────── */}
      {selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                  DISPATCH CARRIER INSTRUCTION
                </span>
                <h3 className="text-base font-bold text-white">
                  Resolve NDR for {selectedShipment.reference} ({selectedShipment.awb || 'No AWB'})
                </h3>
              </div>
              <button
                onClick={() => setSelectedShipment(null)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Resolution Action
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setActionType('REATTEMPT')}
                    className={`rounded-xl p-2.5 text-center font-bold transition border ${
                      actionType === 'REATTEMPT'
                        ? 'border-indigo-400 bg-indigo-600 text-white shadow-lg'
                        : 'border-white/10 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    🚀 Schedule Re-attempt
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionType('RTO_IMMEDIATE')}
                    className={`rounded-xl p-2.5 text-center font-bold transition border ${
                      actionType === 'RTO_IMMEDIATE'
                        ? 'border-rose-400 bg-rose-600 text-white shadow-lg'
                        : 'border-white/10 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    ↩️ Return to Origin (RTO)
                  </button>
                </div>
              </div>

              {actionType === 'REATTEMPT' && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/50 p-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase">
                        Re-attempt Date
                      </label>
                      <input
                        type="date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase">
                        Delivery Slot
                      </label>
                      <select
                        value={preferredTimeSlot}
                        onChange={(e) => setPreferredTimeSlot(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                      >
                        <option value="MORNING_9_TO_12">Morning (9 AM – 12 PM)</option>
                        <option value="AFTERNOON_12_TO_4">Afternoon (12 PM – 4 PM)</option>
                        <option value="EVENING_4_TO_8">Evening (4 PM – 8 PM)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase">
                      Updated Contact Phone (Optional)
                    </label>
                    <input
                      type="text"
                      value={alternatePhone}
                      onChange={(e) => setAlternatePhone(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase">
                      Landmark / Address Correction (Optional)
                    </label>
                    <input
                      type="text"
                      value={alternateAddress}
                      onChange={(e) => setAlternateAddress(e.target.value)}
                      placeholder="e.g. Opposite Metro Pillar 142, Sector 62"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Operations Notes & Special Dispatch Instructions
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Spoke to customer, confirmed they will be at home"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedShipment(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolveMutation.isPending}
                  className={`rounded-xl px-5 py-2 text-xs font-bold text-white transition ${
                    actionType === 'RTO_IMMEDIATE'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {resolveMutation.isPending ? 'Syncing with Carrier…' : 'Push Instruction to Courier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
