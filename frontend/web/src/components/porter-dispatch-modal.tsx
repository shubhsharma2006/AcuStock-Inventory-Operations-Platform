'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface PorterVehicleOption {
  type: string;
  label: string;
  capacity: string;
  icon: string;
  baseFare: number;
  perKmRate: number;
  eta: string;
}

const PORTER_VEHICLES: PorterVehicleOption[] = [
  { type: '2_WHEELER', label: '2-Wheeler Express', capacity: 'Up to 20 kg', icon: '🛵', baseFare: 45, perKmRate: 12, eta: '6 mins' },
  { type: '3_WHEELER', label: '3-Wheeler Auto', capacity: 'Up to 500 kg', icon: '🛺', baseFare: 160, perKmRate: 18, eta: '12 mins' },
  { type: 'TATA_ACE', label: 'Tata Ace (Chota Hathi)', capacity: 'Up to 750 kg', icon: '🚚', baseFare: 220, perKmRate: 22, eta: '14 mins' },
  { type: '8FT_PICKUP', label: '8ft 1-Ton Pickup', capacity: 'Up to 1000 kg', icon: '🚛', baseFare: 320, perKmRate: 26, eta: '18 mins' },
];

interface PorterDispatchModalProps {
  shipmentId: string;
  shipmentRef: string;
  customerName?: string;
  destinationCity?: string;
  onClose: () => void;
  onDispatched: (data: any) => void;
}

export function PorterDispatchModal({
  shipmentId,
  shipmentRef,
  customerName = 'Customer',
  destinationCity = 'New Delhi',
  onClose,
  onDispatched,
}: PorterDispatchModalProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<PorterVehicleOption>(PORTER_VEHICLES[2]); // Default Tata Ace
  const [distanceKm, setDistanceKm] = useState<number>(14.2);
  const [pickupNotes, setPickupNotes] = useState<string>('Pick up from Dock 02. Handle pallets with care.');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<any | null>(null);

  const estimatedFare = Math.round(selectedVehicle.baseFare + distanceKm * selectedVehicle.perKmRate);

  const handleBookPorter = async () => {
    try {
      setLoading(true);
      setError(null);

      const payload = {
        vehicleType: selectedVehicle.type,
        pickupNotes,
        estimatedFare
      };

      const res = await apiFetch<any>(`/tracking/${shipmentId}/dispatch-porter`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setDispatchResult(res);
      onDispatched(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch Porter vehicle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl border border-amber-500/30">
              ⚡
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                On-Demand Porter Dispatch
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">INSTANT</span>
              </h2>
              <p className="text-xs text-slate-400">
                Shipment <span className="font-mono text-amber-400">{shipmentRef}</span> • Drop to {customerName} ({destinationCity})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* If Dispatched Success */}
        {dispatchResult ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
              <span className="text-3xl">🎉</span>
              <h3 className="mt-2 text-sm font-bold text-white">Porter Pilot Dispatched Successfully!</h3>
              <p className="text-xs text-emerald-400">Driver is en-route to Warehouse Dock</p>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-400">Trip ID</span>
                <span className="font-bold text-white">{dispatchResult.porterDetails?.tripId}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">Driver Pilot</span>
                <span className="font-bold text-white">{dispatchResult.porterDetails?.driverName} ({dispatchResult.porterDetails?.driverPhone})</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">Vehicle Number</span>
                <span className="font-bold text-amber-400">{dispatchResult.porterDetails?.vehicleNumber}</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-amber-500/10 px-2 rounded-lg border border-amber-500/20">
                <div>
                  <div className="text-[10px] text-amber-300 uppercase">Pickup OTP (For Warehouse)</div>
                  <div className="text-base font-black text-amber-400">{dispatchResult.porterDetails?.pickupOtp}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-300 uppercase">Delivery OTP (For Customer)</div>
                  <div className="text-base font-black text-emerald-400">{dispatchResult.porterDetails?.deliveryOtp}</div>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 transition shadow-lg"
            >
              Close & View in Live Fleet Tower
            </button>
          </div>
        ) : (
          /* Form Selection */
          <div className="mt-5 space-y-4">
            {/* Vehicle Selection Grid */}
            <div>
              <label className="text-xs font-bold text-slate-300 mb-2 block uppercase tracking-wider">
                Select Vehicle Type
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {PORTER_VEHICLES.map((v) => {
                  const isSelected = selectedVehicle.type === v.type;
                  return (
                    <button
                      key={v.type}
                      type="button"
                      onClick={() => setSelectedVehicle(v)}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-lg'
                          : 'border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="text-2xl">{v.icon}</span>
                      <div className="min-w-0">
                        <div className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                          {v.label}
                        </div>
                        <div className="text-[10px] text-slate-400">{v.capacity}</div>
                        <div className="mt-1 text-[10px] font-mono font-semibold text-emerald-400">ETA {v.eta}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Distance and Estimated Fare Card */}
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950 p-3.5">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Route Distance</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="number"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-16 rounded border border-white/10 bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-white text-center"
                    step="0.5"
                  />
                  <span className="text-xs text-slate-400">km</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Estimated Fare</span>
                <div className="text-xl font-mono font-black text-emerald-400">₹{estimatedFare}</div>
              </div>
            </div>

            {/* Warehouse Gate Notes */}
            <div>
              <label className="text-xs font-bold text-slate-300 mb-1.5 block">
                Warehouse Pickup Instructions
              </label>
              <input
                type="text"
                value={pickupNotes}
                onChange={(e) => setPickupNotes(e.target.value)}
                placeholder="e.g. Loading bay 3, forklift assistance required"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {/* CTA */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBookPorter}
                disabled={loading}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition shadow-xl disabled:opacity-50"
              >
                {loading ? 'Confirming Dispatch…' : `Confirm Porter Booking (₹${estimatedFare})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
