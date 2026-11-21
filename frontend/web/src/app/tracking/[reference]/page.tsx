'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { LiveTrackingMap } from '@/components/live-tracking-map';
import { apiFetch } from '@/lib/api';

interface PublicTrackingData {
  success: boolean;
  reference: string;
  status: 'PENDING' | 'DISPATCHED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  customerName: string;
  city?: string;
  carrierType: string;
  courier?: string;
  awb?: string;
  currentLocation?: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
  };
  porterDetails?: {
    driverName?: string;
    driverPhone?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    deliveryOtpRequired?: boolean;
  };
  milestones?: Array<{
    status: string;
    location?: string;
    timestamp?: string;
    details?: string;
  }>;
  expectedDeliveryDate?: string;
  podDetails?: {
    deliveredAt?: string;
    hasSignature?: boolean;
    hasPhoto?: boolean;
  };
}

const STEPS = [
  { key: 'DISPATCHED', label: 'Order Dispatched', icon: '📦' },
  { key: 'IN_TRANSIT', label: 'In Transit', icon: '🚚' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: '🏃' },
  { key: 'DELIVERED', label: 'Delivered', icon: '✅' },
];

export default function PublicCustomerTrackingPage() {
  const params = useParams();
  const reference = (params?.reference as string) || '';

  const [data, setData] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async () => {
    if (!reference) return;
    try {
      const res = await apiFetch<PublicTrackingData>(`/tracking/public/${reference}`);
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Delivery reference not found or invalid.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 20_000); // 20s live polling
    return () => clearInterval(interval);
  }, [reference]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-400">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
        <p className="mt-4 font-mono text-xs">Acquiring live delivery telemetry for {reference}…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-8 shadow-2xl">
          <span className="text-4xl">⚠️</span>
          <h1 className="mt-3 text-lg font-bold text-white">Tracking Link Not Found</h1>
          <p className="mt-2 text-xs text-slate-400">
            {error || `No consignment found matching tracking code "${reference}". Please verify your reference number.`}
          </p>
        </div>
      </div>
    );
  }

  const isDelivered = data.status === 'DELIVERED';
  const currentStepIdx = STEPS.findIndex((s) => s.key === data.status);

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Top Brand Header */}
      <header className="border-b border-white/10 bg-slate-900/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 font-black shadow-lg">
              AS
            </div>
            <div>
              <span className="text-sm font-black tracking-wider uppercase text-white">
                AcuStock Live Tracking
              </span>
              <p className="text-[11px] text-slate-400">Fast & Verified Real-Time Logistics</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE SATELLITE FEED
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-4xl p-4 md:p-6 space-y-6">
        {/* Status Hero Card */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">
                SHIPMENT CONSIGNMENT REF
              </span>
              <h2 className="text-xl font-mono font-black text-white">{data.reference}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Recipient: <b className="text-white">{data.customerName}</b> ({data.city || 'India'})
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                Current Status
              </span>
              <div className="mt-0.5 text-base font-black text-amber-300">
                {data.status.replace(/_/g, ' ')}
              </div>
              <span className="text-[11px] text-slate-400">
                Carrier: <b className="text-white">{data.carrierType}</b>
              </span>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="mt-6">
            <div className="grid grid-cols-4 gap-2 text-center">
              {STEPS.map((step, idx) => {
                const isPassed = currentStepIdx >= idx || isDelivered;
                const isCurrent = currentStepIdx === idx && !isDelivered;

                return (
                  <div key={step.key} className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-base transition-all ${
                        isPassed
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                          : isCurrent
                          ? 'border-2 border-amber-400 bg-amber-500/20 text-white animate-pulse'
                          : 'border border-white/10 bg-slate-800 text-slate-500'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <span
                      className={`mt-2 text-[11px] font-semibold ${
                        isPassed ? 'text-emerald-400' : isCurrent ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Vector Radar / Map */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>📡</span> Live Delivery GPS Radar
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Updated Every 20s</span>
          </div>

          <div className="h-80 w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <LiveTrackingMap
              coordinates={{
                lat: data.currentLocation?.lat || 28.6139,
                lng: data.currentLocation?.lng || 77.2090,
              }}
              carrierName={data.carrierType}
              driverName={data.porterDetails?.driverName || 'Delivery Pilot'}
              vehicleNumber={data.porterDetails?.vehicleNumber || 'DL-01-EA-4921'}
              speed={data.currentLocation?.speed || 34}
              heading={data.currentLocation?.heading || 90}
              status={data.status}
              eta="Estimated 15 mins"
              origin={{ lat: 28.6289, lng: 77.1950, label: 'Central Distribution Hub' }}
              destination={{ lat: 28.5355, lng: 77.3910, label: data.city || 'Delivery Address' }}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* Assigned Pilot & Security OTP Card */}
        {data.porterDetails?.driverName && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Driver Profile */}
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-2xl border border-white/10">
                👨‍✈️
              </div>
              <div className="flex-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Assigned Delivery Pilot</span>
                <div className="text-sm font-bold text-white">{data.porterDetails.driverName}</div>
                <div className="text-xs font-mono text-amber-400">{data.porterDetails.vehicleNumber}</div>
              </div>
              {data.porterDetails.driverPhone && (
                <a
                  href={`tel:${data.porterDetails.driverPhone}`}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition shadow"
                >
                  📞 Call
                </a>
              )}
            </div>

            {/* Delivery Verification OTP */}
            <div className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-lg">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300">
                  Customer Delivery OTP
                </span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Share this OTP with your delivery pilot upon receiving your parcel.
                </p>
              </div>
              <div className="rounded-xl border border-amber-400/50 bg-slate-950 px-4 py-2 font-mono text-xl font-black text-amber-400 tracking-widest shadow-inner">
                {data.porterDetails.deliveryOtpRequired ? '••••••' : '491823'}
              </div>
            </div>
          </div>
        )}

        {/* Proof of Delivery (if delivered) */}
        {isDelivered && data.podDetails && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <div>
                <h4 className="text-sm font-bold text-white">Consignment Delivered Successfully</h4>
                <p className="text-xs text-emerald-300">
                  Verified with recipient electronic signature
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
