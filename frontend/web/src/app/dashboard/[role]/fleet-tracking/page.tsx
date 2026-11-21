'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { LiveTrackingMap } from '@/components/live-tracking-map';
import { PorterDispatchModal } from '@/components/porter-dispatch-modal';
import { ProofOfDeliveryModal } from '@/components/proof-of-delivery-modal';

interface ActiveShipment {
  _id: string;
  reference: string;
  status: 'PENDING' | 'DISPATCHED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  customerName: string;
  phone?: string;
  city?: string;
  carrierType: 'PORTER' | 'DELHIVERY' | 'BLUEDART' | 'IN_HOUSE' | 'SELF_PICKUP';
  courier?: string;
  awb?: string;
  currentLocation?: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
    updatedAt?: string;
  };
  porterDetails?: {
    tripId?: string;
    driverName?: string;
    driverPhone?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    estimatedFare?: number;
    pickupOtp?: string;
    deliveryOtp?: string;
  };
  podDetails?: {
    deliveredAt?: string;
    signature?: string;
    recipientName?: string;
  };
}

const CARRIER_ICONS: Record<string, string> = {
  PORTER: '⚡',
  DELHIVERY: '📦',
  BLUEDART: '✈️',
  IN_HOUSE: '🚚',
  SELF_PICKUP: '🏬',
};

export default function FleetTrackingControlTowerPage() {
  const queryClient = useQueryClient();
  const [selectedCarrierFilter, setSelectedCarrierFilter] = useState<string>('ALL');
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [porterModalShipment, setPorterModalShipment] = useState<ActiveShipment | null>(null);
  const [podModalShipment, setPodModalShipment] = useState<ActiveShipment | null>(null);
  const [simulatingGps, setSimulatingGps] = useState<boolean>(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Fetch active fleet
  const { data, isLoading, refetch } = useQuery<{ success: boolean; shipments: ActiveShipment[] }>({
    queryKey: ['active-fleet-tracking'],
    queryFn: () => apiFetch<{ success: boolean; shipments: ActiveShipment[] }>('/tracking/fleet/active'),
    refetchInterval: 15_000, // Poll every 15s for live GPS telemetry
  });

  const shipments = data?.shipments || [];

  const filteredShipments = shipments.filter((s) => {
    if (selectedCarrierFilter === 'ALL') return true;
    return s.carrierType === selectedCarrierFilter;
  });

  const activeShipment =
    filteredShipments.find((s) => s._id === selectedShipmentId) ||
    filteredShipments[0] ||
    shipments[0];

  // GPS Telemetry Simulator Mutation: Moves current driver 0.005 deg closer to destination
  const simulateTelemetryMutation = useMutation({
    mutationFn: async (shipment: ActiveShipment) => {
      const currentLat = shipment.currentLocation?.lat || 28.6139;
      const currentLng = shipment.currentLocation?.lng || 77.2090;
      // Step slightly towards Noida / Southeast
      const nextLat = currentLat - 0.0035;
      const nextLng = currentLng + 0.0048;
      const randomSpeed = Math.floor(Math.random() * 25) + 30; // 30-55 km/h
      const randomHeading = (Math.floor(Math.random() * 30) + 110) % 360;

      return apiFetch(`/tracking/${shipment._id}/telemetry`, {
        method: 'POST',
        body: JSON.stringify({
          lat: nextLat,
          lng: nextLng,
          speed: randomSpeed,
          heading: randomHeading,
          etaMinutes: 12,
          distanceRemainingKm: 6.8
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-fleet-tracking'] });
    }
  });

  const handleSimulateMovement = async () => {
    if (!activeShipment) return;
    setSimulatingGps(true);
    try {
      await simulateTelemetryMutation.mutateAsync(activeShipment);
    } finally {
      setSimulatingGps(false);
    }
  };

  const copyCustomerTrackingLink = (reference: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/tracking/${reference}`;
    navigator.clipboard.writeText(url);
    setCopiedRef(reference);
    setTimeout(() => setCopiedRef(null), 2500);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-950 font-sans text-slate-100 overflow-hidden">
      {/* Top Cockpit Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-slate-900/90 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl border border-amber-500/30 text-amber-400">
            📡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black uppercase tracking-wider text-white">
                Live Fleet & Porter Control Tower
              </h1>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                TELEMETRY ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time GPS Tracking, On-Demand Porter Dispatch & Verified Electronic Proof of Delivery
            </p>
          </div>
        </div>

        {/* Global Control Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSimulateMovement}
            disabled={simulatingGps || !activeShipment}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition shadow-lg disabled:opacity-50"
          >
            <span>🛰️</span>
            <span>{simulatingGps ? 'Broadcasting GPS…' : 'Simulate GPS Telemetry Ping'}</span>
          </button>

          <button
            onClick={() => refetch()}
            className="rounded-xl border border-white/10 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
            title="Refresh Fleet Telemetry"
          >
            🔄
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-white/5 bg-slate-900/40 px-6 py-2.5 text-xs">
        <div className="flex items-center gap-3 border-r border-white/5 pr-4">
          <span className="text-2xl">🚚</span>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Active Fleet On-Road</div>
            <div className="text-base font-black text-white">{shipments.length} Vehicles</div>
          </div>
        </div>
        <div className="flex items-center gap-3 border-r border-white/5 pr-4">
          <span className="text-2xl">⚡</span>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Porter On-Demand Trips</div>
            <div className="text-base font-black text-amber-400">
              {shipments.filter((s) => s.carrierType === 'PORTER').length} Dispatched
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 border-r border-white/5 pr-4">
          <span className="text-2xl">⏱️</span>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Average Dispatch Velocity</div>
            <div className="text-base font-black text-cyan-400">
              {activeShipment?.currentLocation?.speed || 38} km/h
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">SLA On-Time Completion</div>
            <div className="text-base font-black text-emerald-400">99.2%</div>
          </div>
        </div>
      </div>

      {/* Main Split Cockpit */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Dispatch Column (List of Active Vehicles & Deliveries) */}
        <div className="flex w-full md:w-[420px] flex-col border-r border-white/10 bg-slate-900/60">
          {/* Carrier Filter Tabs */}
          <div className="flex border-b border-white/10 bg-slate-950 p-2 gap-1.5 overflow-x-auto text-xs">
            {['ALL', 'PORTER', 'IN_HOUSE', 'DELHIVERY'].map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCarrierFilter(c)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 font-bold transition text-[11px] ${
                  selectedCarrierFilter === c
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {c === 'ALL' ? 'All Carriers' : c}
              </button>
            ))}
          </div>

          {/* Vehicle List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
                Acquiring vehicle satellite signals…
              </div>
            ) : filteredShipments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No active deliveries matching filter.
              </div>
            ) : (
              filteredShipments.map((s) => {
                const isSelected = activeShipment?._id === s._id;
                const isDelivered = s.status === 'DELIVERED';

                return (
                  <div
                    key={s._id}
                    onClick={() => setSelectedShipmentId(s._id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      isSelected
                        ? 'border-amber-400/80 bg-slate-800/90 shadow-xl'
                        : 'border-white/5 bg-slate-900/40 hover:border-white/15 hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Top Row: Ref & Carrier badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{CARRIER_ICONS[s.carrierType] || '🚚'}</span>
                        <span className="font-mono text-xs font-black text-white">{s.reference}</span>
                      </div>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          isDelivered
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : s.status === 'OUT_FOR_DELIVERY'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Middle Row: Customer and Location */}
                    <div className="mt-2 text-xs text-slate-300">
                      <div className="font-semibold text-white truncate">{s.customerName}</div>
                      <div className="text-[11px] text-slate-400">{s.city || 'Destination Site'}</div>
                    </div>

                    {/* Porter/Driver Meta */}
                    {s.porterDetails?.driverName && (
                      <div className="mt-2 rounded-lg bg-slate-950/80 p-2 text-[11px] font-mono border border-white/5">
                        <div className="flex justify-between text-slate-300">
                          <span>Pilot: <b className="text-white">{s.porterDetails.driverName}</b></span>
                          <span className="text-amber-400 font-bold">{s.porterDetails.vehicleNumber}</span>
                        </div>
                        {s.porterDetails.deliveryOtp && (
                          <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-1 text-[10px]">
                            <span className="text-slate-400">Delivery OTP:</span>
                            <span className="font-bold text-emerald-400 tracking-wider">
                              {s.porterDetails.deliveryOtp}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-3 flex items-center gap-1.5 pt-1 border-t border-white/5">
                      {s.carrierType !== 'PORTER' && s.status !== 'DELIVERED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPorterModalShipment(s);
                          }}
                          className="flex-1 rounded-lg bg-amber-500/10 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition text-center"
                        >
                          ⚡ Book Porter
                        </button>
                      )}

                      {!isDelivered ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPodModalShipment(s);
                          }}
                          className="flex-1 rounded-lg bg-emerald-500/10 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 transition text-center"
                        >
                          ✍️ Verify POD
                        </button>
                      ) : (
                        <div className="flex-1 text-[10px] font-bold text-emerald-400 text-center py-1">
                          ✓ Delivery Verified
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyCustomerTrackingLink(s.reference);
                        }}
                        className="rounded-lg bg-slate-800 p-1.5 text-[10px] text-slate-300 hover:text-white transition"
                        title="Copy Customer Tracking Link"
                      >
                        {copiedRef === s.reference ? '✓ Copied' : '🔗 Link'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Cockpit Column (Live Map & Radar Telemetry View) */}
        <div className="flex-1 flex flex-col p-4 overflow-y-auto">
          {activeShipment ? (
            <div className="space-y-4">
              {/* Detailed Active Vehicle Telemetry Banner */}
              <div className="flex flex-wrap items-center justify-between rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-2xl shadow-lg border border-white/20">
                    {CARRIER_ICONS[activeShipment.carrierType] || '🚚'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-amber-400">
                        {activeShipment.reference}
                      </span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 uppercase">
                        {activeShipment.carrierType}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-white mt-0.5">
                      To: {activeShipment.customerName} ({activeShipment.city})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">Current Velocity</div>
                    <div className="text-sm font-mono font-bold text-emerald-400">
                      {activeShipment.currentLocation?.speed || 42} km/h
                    </div>
                  </div>

                  <button
                    onClick={() => copyCustomerTrackingLink(activeShipment.reference)}
                    className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition shadow-lg flex items-center gap-1.5"
                  >
                    <span>🔗</span>
                    <span>{copiedRef === activeShipment.reference ? 'Link Copied!' : 'Customer Tracking URL'}</span>
                  </button>
                </div>
              </div>

              {/* Live Vector Radar & Google Maps Container */}
              <div className="h-[480px] w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <LiveTrackingMap
                  coordinates={{
                    lat: activeShipment.currentLocation?.lat || 28.6139,
                    lng: activeShipment.currentLocation?.lng || 77.2090
                  }}
                  carrierName={activeShipment.carrierType}
                  driverName={activeShipment.porterDetails?.driverName || 'Fleet Pilot'}
                  vehicleNumber={activeShipment.porterDetails?.vehicleNumber || 'DL-01-EA-4921'}
                  speed={activeShipment.currentLocation?.speed || 38}
                  heading={activeShipment.currentLocation?.heading || 120}
                  status={activeShipment.status}
                  eta="14 mins"
                  origin={{ lat: 28.6289, lng: 77.1950, label: 'Main Central Hub' }}
                  destination={{ lat: 28.5355, lng: 77.3910, label: activeShipment.city || 'Delivery Site' }}
                  className="h-full w-full"
                />
              </div>

              {/* Delivery Milestones & POD Summary */}
              {activeShipment.podDetails?.signature && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
                    <span>✓</span> Verified Proof of Delivery (e-POD)
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400">Recipient: </span>
                      <span className="font-semibold text-white">{activeShipment.podDetails.recipientName}</span>
                    </div>
                    {activeShipment.podDetails.deliveredAt && (
                      <div className="text-slate-400">
                        Delivered on: {new Date(activeShipment.podDetails.deliveredAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  {activeShipment.podDetails.signature && (
                    <div className="mt-3">
                      <div className="text-[10px] text-slate-400 uppercase">Customer Signature</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeShipment.podDetails.signature}
                        alt="Customer Signature"
                        className="mt-1 h-16 rounded-lg bg-slate-950 p-2 border border-white/10"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500 text-xs">
              Select an active vehicle to view live trajectory telemetry.
            </div>
          )}
        </div>
      </div>

      {/* On-Demand Porter Dispatch Modal */}
      {porterModalShipment && (
        <PorterDispatchModal
          shipmentId={porterModalShipment._id}
          shipmentRef={porterModalShipment.reference}
          customerName={porterModalShipment.customerName}
          destinationCity={porterModalShipment.city}
          onClose={() => setPorterModalShipment(null)}
          onDispatched={() => {
            queryClient.invalidateQueries({ queryKey: ['active-fleet-tracking'] });
          }}
        />
      )}

      {/* Proof of Delivery (e-POD) Modal */}
      {podModalShipment && (
        <ProofOfDeliveryModal
          shipmentId={podModalShipment._id}
          shipmentRef={podModalShipment.reference}
          customerName={podModalShipment.customerName}
          customerPhone={podModalShipment.phone}
          expectedOtp={podModalShipment.porterDetails?.deliveryOtp}
          onClose={() => setPodModalShipment(null)}
          onCompleted={() => {
            queryClient.invalidateQueries({ queryKey: ['active-fleet-tracking'] });
          }}
        />
      )}
    </div>
  );
}
