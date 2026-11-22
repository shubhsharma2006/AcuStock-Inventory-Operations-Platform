'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface PtlQuote {
  id: string;
  carrierName: string;
  type: string;
  billableWeightKg: number;
  transitDays: number;
  baseFreight: number;
  docketCharge: number;
  loadingCharges: number;
  fuelSurcharge: number;
  gstAmount: number;
  totalAmount: number;
  rating: number;
}

interface FtlOption {
  id: string;
  carrierName: string;
  vehicleType: string;
  vehicleName: string;
  type: string;
  maxPayloadKg: number;
  maxPallets: number;
  transitDays: number;
  baseFreight: number;
  tollCharges: number;
  gstAmount: number;
  totalAmount: number;
  idealFor: string;
}

interface FreightBookingItem {
  _id: string;
  bookingNumber: string;
  type: 'PTL' | 'FTL';
  origin: { city: string; state: string; pincode: string };
  destination: { city: string; state: string; pincode: string };
  cargoDetails: { grossWeightKg: number; palletCount: number; declaredValue: number };
  vehicleDetails: { vehicleType: string; vehicleNumber: string; driverName: string };
  carrier: { name: string; lrNumber: string; trackingAwb: string };
  ewayBill?: { ewbNumber?: string; validUpto?: string; status?: string };
  pricing: { totalAmount: number };
  status: string;
  createdAt: string;
}

export default function HeavyFreightPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'CALCULATOR' | 'EWAY_BILL' | 'BOOKINGS'>('CALCULATOR');
  const [loadType, setLoadType] = useState<'PTL' | 'FTL'>('PTL');

  // Freight Calculator Inputs
  const [originPincode, setOriginPincode] = useState('400001'); // Mumbai
  const [destPincode, setDestPincode] = useState('560001');   // Bangalore
  const [grossWeightKg, setGrossWeightKg] = useState('1200');
  const [palletCount, setPalletCount] = useState('4');
  const [declaredValue, setDeclaredValue] = useState('150000');
  const [isOverDimensional, setIsOverDimensional] = useState(false);

  // Standalone E-Way Bill Form State
  const [ewbDocNo, setEwbDocNo] = useState('INV-2026-B2B-091');
  const [ewbFromGstin, setEwbFromGstin] = useState('27AAAAA0000A1Z5');
  const [ewbToGstin, setEwbToGstin] = useState('29BBBBB0000B1Z8');
  const [ewbFromPincode, setEwbFromPincode] = useState('400001');
  const [ewbToPincode, setEwbToPincode] = useState('560001');
  const [ewbVehicleNo, setEwbVehicleNo] = useState('MH-12-DE-4321');
  const [ewbValue, setEwbValue] = useState('185000');
  const [ewbDistance, setEwbDistance] = useState('980');
  const [generatedEwb, setGeneratedEwb] = useState<any>(null);

  // Booking Modal State
  const [selectedQuote, setSelectedQuote] = useState<PtlQuote | FtlOption | null>(null);
  const [bookingVehicleNo, setBookingVehicleNo] = useState('MH-12-AB-9921');
  const [bookingOriginAddress, setBookingOriginAddress] = useState('Bhiwandi Central Logistics Park, Unit 4, Mumbai');
  const [bookingDestAddress, setBookingDestAddress] = useState('Whitefield Industrial Zone, Phase 2, Bangalore');
  const [bookingBanner, setBookingBanner] = useState<string | null>(null);

  // 1. Fetch Rate Quotes Mutation
  const ratesMutation = useMutation({
    mutationFn: (body: any) => apiFetch<{
      success: boolean;
      distanceKm: number;
      transitZone: string;
      grossWeightKg: number;
      isEWayBillRequired: boolean;
      ptlQuotes: PtlQuote[];
      ftlOptions: FtlOption[];
    }>('/freight/rates', { method: 'POST', body: JSON.stringify(body) })
  });

  // 2. Fetch Existing Bookings
  const { data: bookingsData } = useQuery<{ success: boolean; bookings: FreightBookingItem[] }>({
    queryKey: ['freight-bookings'],
    queryFn: () => apiFetch('/freight/bookings'),
    enabled: activeTab === 'BOOKINGS'
  });

  // 3. Book Cargo Mutation
  const bookMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/freight/book', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setBookingBanner(`Freight cargo booked successfully! Lorry Receipt: ${data.booking.carrier.lrNumber} | E-Way Bill: ${data.booking.ewayBill?.ewbNumber || 'Attached'}`);
      setSelectedQuote(null);
      queryClient.invalidateQueries({ queryKey: ['freight-bookings'] });
      setActiveTab('BOOKINGS');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to book freight cargo');
    }
  });

  // 4. Standalone E-Way Bill Mutation
  const ewbMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/freight/eway-bill/generate', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setGeneratedEwb(data);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to generate E-Way Bill');
    }
  });

  const handleCalculateRates = (e: React.FormEvent) => {
    e.preventDefault();
    ratesMutation.mutate({
      originPincode,
      destPincode,
      grossWeightKg: Number(grossWeightKg),
      palletCount: Number(palletCount),
      declaredValue: Number(declaredValue)
    });
  };

  const handleOpenBookModal = (quote: PtlQuote | FtlOption) => {
    setSelectedQuote(quote);
    setBookingVehicleNo('MH-12-AB-9921');
  };

  const handleConfirmBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuote) return;

    const isFtl = 'vehicleType' in selectedQuote;

    bookMutation.mutate({
      type: isFtl ? 'FTL' : 'PTL',
      origin: {
        address: bookingOriginAddress,
        pincode: originPincode,
        city: 'Mumbai',
        state: 'Maharashtra',
        gstin: '27AAAAA0000A1Z5'
      },
      destination: {
        address: bookingDestAddress,
        pincode: destPincode,
        city: 'Bangalore',
        state: 'Karnataka',
        gstin: '29BBBBB0000B1Z8'
      },
      cargoDetails: {
        grossWeightKg: Number(grossWeightKg),
        palletCount: Number(palletCount),
        declaredValue: Number(declaredValue),
        isOverDimensional
      },
      vehicleDetails: {
        vehicleType: isFtl ? (selectedQuote as FtlOption).vehicleType : 'PTL_SHARED_CARGO',
        vehicleNumber: bookingVehicleNo
      },
      pricing: {
        baseFreight: selectedQuote.baseFreight,
        docketCharge: 'docketCharge' in selectedQuote ? selectedQuote.docketCharge : 0,
        fuelSurcharge: 'fuelSurcharge' in selectedQuote ? selectedQuote.fuelSurcharge : 0,
        gstAmount: selectedQuote.gstAmount,
        totalAmount: selectedQuote.totalAmount
      },
      carrier: {
        name: selectedQuote.carrierName
      },
      generateEwb: true
    });
  };

  const handleGenerateStandaloneEwb = (e: React.FormEvent) => {
    e.preventDefault();
    ewbMutation.mutate({
      docNo: ewbDocNo,
      fromGstin: ewbFromGstin,
      toGstin: ewbToGstin,
      fromPincode: ewbFromPincode,
      toPincode: ewbToPincode,
      totalValue: Number(ewbValue),
      distanceKm: Number(ewbDistance),
      vehicleNumber: ewbVehicleNo,
      isOverDimensional
    });
  };

  const rateResults = ratesMutation.data;
  const isEwbMandatory = Number(declaredValue) >= 50000;

  return (
    <div className="space-y-6">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>🚛</span> B2B Heavy Freight, PTL/FTL & Indian GST E-Way Bill Portal
            </h1>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-400 border border-amber-500/30">
              Commercial Cargo Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Part Truck Load (PTL) quintal freight, Full Truck Load (FTL) commercial fleets, and automated GST E-Way Bill generation.
          </p>
        </div>

        {/* Tab Navigation Buttons */}
        <div className="flex rounded-xl border border-white/10 bg-slate-900 p-1">
          <button
            onClick={() => setActiveTab('CALCULATOR')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'CALCULATOR'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Freight Rate Calculator
          </button>
          <button
            onClick={() => setActiveTab('EWAY_BILL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'EWAY_BILL'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📜 E-Way Bill Generator
          </button>
          <button
            onClick={() => setActiveTab('BOOKINGS')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'BOOKINGS'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📋 Cargo Manifests & LRs
          </button>
        </div>
      </div>

      {/* ── Notification Banner ──────────────────────────────────────────── */}
      {bookingBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
          <span className="flex items-center gap-2 font-medium">
            <span>✅</span> {bookingBanner}
          </span>
          <button onClick={() => setBookingBanner(null)} className="text-emerald-400 hover:text-emerald-200">
            ✕
          </button>
        </div>
      )}

      {/* ── TAB 1: FREIGHT RATE CALCULATOR & ALLOCATION ────────────────────── */}
      {activeTab === 'CALCULATOR' && (
        <div className="space-y-6">
          {/* Freight Search Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Cargo Freight Configuration</span>
                {isEwbMandatory && (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-300 border border-rose-500/30">
                    E-Way Bill Mandatory (Value ≥ ₹50,000)
                  </span>
                )}
              </div>

              {/* Load Type Toggle */}
              <div className="flex items-center rounded-xl border border-white/10 bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => setLoadType('PTL')}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                    loadType === 'PTL'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  PTL (Part Truck Load)
                </button>
                <button
                  type="button"
                  onClick={() => setLoadType('FTL')}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                    loadType === 'FTL'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  FTL (Dedicated Truck Load)
                </button>
              </div>
            </div>

            <form onSubmit={handleCalculateRates} className="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Origin Pincode
                </label>
                <input
                  type="text"
                  value={originPincode}
                  onChange={(e) => setOriginPincode(e.target.value)}
                  placeholder="e.g. 400001"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Dest Pincode
                </label>
                <input
                  type="text"
                  value={destPincode}
                  onChange={(e) => setDestPincode(e.target.value)}
                  placeholder="e.g. 560001"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Weight (KG)
                </label>
                <input
                  type="number"
                  value={grossWeightKg}
                  onChange={(e) => setGrossWeightKg(e.target.value)}
                  placeholder="1200"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Pallets Count
                </label>
                <input
                  type="number"
                  value={palletCount}
                  onChange={(e) => setPalletCount(e.target.value)}
                  placeholder="4"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Declared Value (₹)
                </label>
                <input
                  type="number"
                  value={declaredValue}
                  onChange={(e) => setDeclaredValue(e.target.value)}
                  placeholder="150000"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={ratesMutation.isPending}
                  className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {ratesMutation.isPending ? 'Calculating…' : 'Get Live Quotes ❯'}
                </button>
              </div>
            </form>
          </div>

          {/* Quotes Results Grid */}
          {rateResults && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-1">
                <div className="flex items-center gap-3">
                  <span>Distance: <b className="text-white font-mono">{rateResults.distanceKm} KM</b></span>
                  <span>Transit Zone: <b className="text-amber-400 font-mono">{rateResults.transitZone}</b></span>
                  <span>Gross Weight: <b className="text-white font-mono">{rateResults.grossWeightKg} KG</b></span>
                </div>
                <span>Prices inclusive of GST & Docket Charges</span>
              </div>

              {/* PTL Mode Quotes */}
              {loadType === 'PTL' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {rateResults.ptlQuotes.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl hover:border-amber-400/50 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{q.carrierName}</span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                            ★ {q.rating}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Est. Transit: <b className="text-white">{q.transitDays} Business Days</b>
                        </div>

                        <div className="mt-4 rounded-xl border border-white/5 bg-slate-950/60 p-3 space-y-1 text-[11px] font-mono">
                          <div className="flex justify-between text-slate-400">
                            <span>Base Freight ({q.billableWeightKg}kg):</span>
                            <span>₹{q.baseFreight}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Docket & Loading:</span>
                            <span>₹{q.docketCharge + q.loadingCharges}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Fuel & GST (5%):</span>
                            <span>₹{q.fuelSurcharge + q.gstAmount}</span>
                          </div>
                          <div className="border-t border-white/10 pt-1 flex justify-between font-bold text-white text-xs">
                            <span>Total Payable:</span>
                            <span className="text-emerald-400 font-black">₹{q.totalAmount}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenBookModal(q)}
                        className="mt-4 w-full rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition shadow"
                      >
                        Book PTL Cargo ❯
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* FTL Mode Options */}
              {loadType === 'FTL' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rateResults.ftlOptions.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl hover:border-indigo-400/50 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{v.vehicleName}</span>
                          <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono text-indigo-300 border border-indigo-500/30">
                            Up to {v.maxPayloadKg} KG
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 italic">{v.idealFor}</p>

                        <div className="mt-4 rounded-xl border border-white/5 bg-slate-950/60 p-3 space-y-1 text-[11px] font-mono">
                          <div className="flex justify-between text-slate-400">
                            <span>Dedicated Vehicle Fare:</span>
                            <span>₹{v.baseFreight}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Toll & Green Tax:</span>
                            <span>₹{v.tollCharges}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>GST (5% GTA):</span>
                            <span>₹{v.gstAmount}</span>
                          </div>
                          <div className="border-t border-white/10 pt-1 flex justify-between font-bold text-white text-xs">
                            <span>Total Estimated:</span>
                            <span className="text-emerald-400 font-black">₹{v.totalAmount}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenBookModal(v)}
                        className="mt-4 w-full rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow"
                      >
                        Book Dedicated Truck ❯
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: STANDALONE E-WAY BILL GENERATOR ─────────────────────────── */}
      {activeTab === 'EWAY_BILL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="border-b border-white/10 pb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>📜</span> Indian GST NIC E-Way Bill (Form GST EWB-01)
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Generates statutory Part-A and Part-B with distance-based validity according to Rule 138(10).
              </p>
            </div>

            <form onSubmit={handleGenerateStandaloneEwb} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Invoice / Challan #</label>
                  <input
                    type="text"
                    value={ewbDocNo}
                    onChange={(e) => setEwbDocNo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Cargo Value (₹)</label>
                  <input
                    type="number"
                    value={ewbValue}
                    onChange={(e) => setEwbValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Consignor GSTIN</label>
                  <input
                    type="text"
                    value={ewbFromGstin}
                    onChange={(e) => setEwbFromGstin(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Consignee GSTIN</label>
                  <input
                    type="text"
                    value={ewbToGstin}
                    onChange={(e) => setEwbToGstin(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Origin Pincode</label>
                  <input
                    type="text"
                    value={ewbFromPincode}
                    onChange={(e) => setEwbFromPincode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Dest Pincode</label>
                  <input
                    type="text"
                    value={ewbToPincode}
                    onChange={(e) => setEwbToPincode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Vehicle Reg # (Part B)</label>
                  <input
                    type="text"
                    value={ewbVehicleNo}
                    onChange={(e) => setEwbVehicleNo(e.target.value)}
                    placeholder="DL-01-AB-1234"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">Road Distance (KM)</label>
                  <input
                    type="number"
                    value={ewbDistance}
                    onChange={(e) => setEwbDistance(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="odcCheck"
                  checked={isOverDimensional}
                  onChange={(e) => setIsOverDimensional(e.target.checked)}
                  className="rounded border-white/20 bg-slate-950 text-amber-500"
                />
                <label htmlFor="odcCheck" className="text-slate-300 text-[11px]">
                  Over Dimensional Cargo (ODC) — 20 km/day validity rate
                </label>
              </div>

              <button
                type="submit"
                disabled={ewbMutation.isPending}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {ewbMutation.isPending ? 'Validating NIC Schema…' : 'Generate 12-Digit E-Way Bill ❯'}
              </button>
            </form>
          </div>

          {/* Generated E-Way Bill Preview Slip */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl flex flex-col justify-between">
            {generatedEwb ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                      GOVERNMENT OF INDIA • GST PORTAL
                    </span>
                    <h3 className="text-base font-black text-white font-mono">
                      EWB No: {generatedEwb.ewbNumber}
                    </h3>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                    ACTIVE • VALID
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                  <div className="rounded-xl border border-white/5 bg-slate-950 p-3">
                    <span className="text-slate-500 block text-[10px]">PART-A (CONSIGNOR)</span>
                    <div className="font-bold text-white mt-0.5">{generatedEwb.partA.fromTrdName}</div>
                    <div className="text-amber-400">{generatedEwb.partA.fromGstin}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-950 p-3">
                    <span className="text-slate-500 block text-[10px]">PART-A (CONSIGNEE)</span>
                    <div className="font-bold text-white mt-0.5">{generatedEwb.partA.toTrdName}</div>
                    <div className="text-amber-400">{generatedEwb.partA.toGstin}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-slate-950 p-4 space-y-2 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Allocated Vehicle Number:</span>
                    <b className="text-white">{generatedEwb.partB.vehicleNumber}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Consignment Value:</span>
                    <b className="text-emerald-400">₹{generatedEwb.partA.totalValue.toLocaleString('en-IN')}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transit Distance:</span>
                    <b className="text-white">{generatedEwb.distanceKm} KM</b>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-2">
                    <span className="text-slate-400">Valid Upto:</span>
                    <b className="text-amber-300">{new Date(generatedEwb.validUpto).toLocaleString('en-IN')} ({generatedEwb.validityDays} days)</b>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                  QR Payload Encrypted & Sealed for State Highway Checkpoint Scanners.
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <span className="text-4xl block mb-2">📄</span>
                <p className="text-xs">
                  Fill in cargo and vehicle details on the left to generate an authentic 12-digit Indian GST E-Way Bill slip.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: ACTIVE CARGO BOOKINGS & LORRY RECEIPTS (LR) ───────────── */}
      {activeTab === 'BOOKINGS' && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-slate-950/60 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Booking # / LR</th>
                  <th className="py-3.5 px-4">Type & Weight</th>
                  <th className="py-3.5 px-4">Origin ➔ Destination</th>
                  <th className="py-3.5 px-4">Allocated Vehicle & Driver</th>
                  <th className="py-3.5 px-4">E-Way Bill</th>
                  <th className="py-3.5 px-4">Freight Amount</th>
                  <th className="py-3.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {bookingsData?.bookings && bookingsData.bookings.length > 0 ? (
                  bookingsData.bookings.map((b) => (
                    <tr key={b._id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white">{b.bookingNumber}</div>
                        <div className="font-mono text-[11px] text-amber-400">{b.carrier.lrNumber}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                          {b.type}
                        </span>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {b.cargoDetails.grossWeightKg} KG ({b.cargoDetails.palletCount} pallets)
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-white font-medium">{b.origin.city} ({b.origin.pincode})</div>
                        <div className="text-slate-500 text-[11px]">➔ {b.destination.city} ({b.destination.pincode})</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white">{b.vehicleDetails.vehicleNumber}</div>
                        <div className="text-[11px] text-slate-400">{b.vehicleDetails.driverName}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        {b.ewayBill?.ewbNumber ? (
                          <div>
                            <span className="font-mono text-emerald-400 font-bold">{b.ewayBill.ewbNumber}</span>
                            <div className="text-[10px] text-slate-500">
                              Valid: {b.ewayBill.validUpto ? new Date(b.ewayBill.validUpto).toLocaleDateString() : 'Active'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Not Required</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        ₹{b.pricing.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No freight bookings recorded yet. Use the Rate Calculator tab to allocate cargo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Booking Confirmation Modal ────────────────────────────────────── */}
      {selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                  B2B COMMERCIAL CARGO ALLOCATION
                </span>
                <h3 className="text-base font-bold text-white">
                  Confirm Booking with {selectedQuote.carrierName}
                </h3>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="text-slate-400 hover:text-white text-base">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmBooking} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Vehicle Registration Number (Part-B E-Way Bill)
                </label>
                <input
                  type="text"
                  value={bookingVehicleNo}
                  onChange={(e) => setBookingVehicleNo(e.target.value)}
                  placeholder="e.g. MH-12-AB-9921"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Origin Pickup Warehouse Address
                </label>
                <textarea
                  rows={2}
                  value={bookingOriginAddress}
                  onChange={(e) => setBookingOriginAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Destination Delivery Address
                </label>
                <textarea
                  rows={2}
                  value={bookingDestAddress}
                  onChange={(e) => setBookingDestAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white"
                  required
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Total Freight Invoice</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    ₹{selectedQuote.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">Includes E-Way Bill & LR</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedQuote(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookMutation.isPending}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {bookMutation.isPending ? 'Allocating Vehicle…' : 'Generate LR & Dispatch Truck ❯'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
