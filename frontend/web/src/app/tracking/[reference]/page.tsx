'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LiveTrackingMap } from '@/components/live-tracking-map';
import { apiFetch } from '@/lib/api';

interface PublicTrackingData {
  success: boolean;
  type?: 'SHIPMENT' | 'STOCK_TRANSFER';
  reference: string;
  awb?: string | null;
  status: string;
  rawStatus?: string;
  statusMeta?: {
    label: string;
    icon: string;
    color: string;
    badgeBg: string;
  };
  customerName: string;
  city?: string;
  pincode?: string | null;
  carrierType: string;
  courier?: string;
  expectedDeliveryDate?: string | null;
  brand?: {
    name: string;
    legalName?: string;
    logoUrl?: string | null;
    supportEmail?: string;
    phone?: string;
    website?: string;
    brandColor?: string;
  };
  items?: Array<{
    name: string;
    quantity: number;
    model?: string | null;
    receivedQuantity?: number;
  }>;
  fromWarehouse?: {
    name: string;
    code?: string;
    city?: string;
  };
  toWarehouse?: {
    name: string;
    code?: string;
    city?: string;
  };
  ndrDetails?: {
    reason?: string;
    action?: string;
    preferredTimeSlot?: string;
    customerComments?: string;
    instructionStatus?: string;
  } | null;
  currentLocation?: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
  } | null;
  porterDetails?: {
    driverName?: string;
    driverPhone?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    deliveryOtpRequired?: boolean;
  } | null;
  podDetails?: {
    deliveredAt?: string;
    hasSignature?: boolean;
    hasPhoto?: boolean;
  } | null;
  milestones?: Array<{
    status: string;
    rawStatus?: string;
    location?: string;
    timestamp?: string;
    details?: string;
  }>;
}

const CANONICAL_STEPS = [
  { key: 'BOOKED', label: 'Order Booked', icon: '📝' },
  { key: 'PICKED_UP', label: 'Picked Up', icon: '📦' },
  { key: 'IN_TRANSIT', label: 'In Transit', icon: '🚚' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: '🏃' },
  { key: 'DELIVERED', label: 'Delivered', icon: '✅' },
];

export default function PublicCustomerTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const rawRef = (params?.reference as string) || '';
  const reference = decodeURIComponent(rawRef).trim();

  const [data, setData] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search input state for tracking another package
  const [searchInput, setSearchInput] = useState('');

  // NDR Self-Service Dialog State
  const [showNdrModal, setShowNdrModal] = useState(false);
  const [ndrAction, setNdrAction] = useState('REATTEMPT_NEXT_DAY');
  const [ndrTimeSlot, setNdrTimeSlot] = useState('MORNING_9_TO_12');
  const [ndrComment, setNdrComment] = useState('');
  const [ndrSubmitting, setNdrSubmitting] = useState(false);
  const [ndrFeedback, setNdrFeedback] = useState<string | null>(null);

  // Alert Subscription State
  const [alertContact, setAlertContact] = useState('');
  const [alertChannel, setAlertChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');
  const [alertSubscribed, setAlertSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const fetchTracking = async () => {
    if (!reference) return;
    try {
      const res = await apiFetch<PublicTrackingData>(`/tracking/public/${encodeURIComponent(reference)}`);
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Delivery reference or AWB not found. Please verify the code.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchTracking();
    const interval = setInterval(fetchTracking, 25_000); // 25s auto-polling
    return () => clearInterval(interval);
  }, [reference]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    router.push(`/tracking/${encodeURIComponent(searchInput.trim())}`);
  };

  const handleNdrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNdrSubmitting(true);
    try {
      await apiFetch(`/tracking/public/${encodeURIComponent(reference)}/ndr-instruction`, {
        method: 'POST',
        body: JSON.stringify({
          action: ndrAction,
          preferredTimeSlot: ndrTimeSlot,
          comments: ndrComment
        })
      });
      setNdrFeedback('Your delivery re-attempt preference has been sent to our courier dispatch center.');
      setShowNdrModal(false);
      fetchTracking();
    } catch (err: any) {
      alert(err.message || 'Failed to submit instruction');
    } finally {
      setNdrSubmitting(false);
    }
  };

  const handleAlertSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertContact.trim()) return;
    setSubscribing(true);
    try {
      await apiFetch(`/tracking/public/${encodeURIComponent(reference)}/subscribe-alerts`, {
        method: 'POST',
        body: JSON.stringify({
          channel: alertChannel,
          contact: alertContact.trim()
        })
      });
      setAlertSubscribed(true);
    } catch (err: any) {
      alert(err.message || 'Failed to subscribe to alerts');
    } finally {
      setSubscribing(false);
    }
  };

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
        <div className="max-w-md w-full rounded-2xl border border-rose-500/30 bg-slate-900 p-8 shadow-2xl">
          <span className="text-4xl">📦</span>
          <h1 className="mt-3 text-lg font-bold text-white">Consignment Not Found</h1>
          <p className="mt-2 text-xs text-slate-400">
            {error || `No consignment found matching tracking code "${reference}". Please check the AWB or Order ID.`}
          </p>

          <form onSubmit={handleSearchSubmit} className="mt-6 flex gap-2">
            <input
              type="text"
              placeholder="Enter AWB, Reference, or Order #"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              Track
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isDelivered = data.status === 'DELIVERED';
  const isNdr = data.status === 'NDR';
  const isRto = data.status === 'RTO_INITIATED' || data.status === 'RTO_DELIVERED';
  const currentStepIdx = CANONICAL_STEPS.findIndex((s) => s.key === data.status);

  const brandName = data.brand?.name || 'AcuStock Logistics';
  const supportPhone = data.brand?.phone || '+91 1800-123-4567';
  const supportEmail = data.brand?.supportEmail || 'support@acustock.com';

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* ── Top White-Label Brand Header ─────────────────────────────────── */}
      <header className="border-b border-white/10 bg-slate-900/90 px-6 py-4 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {data.brand?.logoUrl ? (
              <img
                src={data.brand.logoUrl}
                alt={brandName}
                className="h-10 w-auto max-w-[120px] rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 font-black shadow-lg">
                {brandName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <span className="text-sm font-black tracking-wider uppercase text-white">
                {brandName}
              </span>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Verified Carrier Network</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-mono">AcuStock Control Tower</span>
              </p>
            </div>
          </div>

          {/* Support Quick Contact */}
          <div className="flex items-center gap-2">
            {supportPhone && (
              <a
                href={`tel:${supportPhone}`}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400 hover:text-white transition"
              >
                <span>📞</span>
                <span className="hidden sm:inline">Call Support</span>
              </a>
            )}
            {supportEmail && (
              <a
                href={`mailto:${supportEmail}?subject=Tracking%20Inquiry%20${encodeURIComponent(data.reference)}`}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400 hover:text-white transition"
              >
                <span>✉️</span>
                <span className="hidden sm:inline">Email</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-4xl p-4 md:p-6 space-y-6">
        {/* Quick Search & Switcher Bar */}
        <div className="rounded-xl border border-white/5 bg-slate-900/60 p-2 shadow-inner">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Track another package by AWB, Consignment, or Order #…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              Track
            </button>
          </form>
        </div>

        {/* NDR Feedback Alert if submitted */}
        {ndrFeedback && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>✅</span> {ndrFeedback}
            </span>
            <button onClick={() => setNdrFeedback(null)} className="text-emerald-400 hover:text-emerald-200">
              ✕
            </button>
          </div>
        )}

        {/* ── Status Hero Card ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">
                  {data.type === 'STOCK_TRANSFER' ? 'INTER-WAREHOUSE TRANSFER REF' : 'CONSIGNMENT REFERENCE'}
                </span>
                {data.type && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono text-slate-400 border border-white/5">
                    {data.type}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-mono font-black text-white mt-0.5">{data.reference}</h2>
              {data.awb && (
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  AWB Number: <b className="text-amber-300">{data.awb}</b>
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Recipient: <b className="text-white">{data.customerName}</b> ({data.city || 'India'})
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                Delivery Status
              </span>
              <div className={`mt-0.5 text-lg font-black ${data.statusMeta?.color || 'text-amber-300'}`}>
                {data.statusMeta?.icon || '🚚'} {data.statusMeta?.label || data.status.replace(/_/g, ' ')}
              </div>
              <span className="text-[11px] text-slate-400">
                Logistics Carrier: <b className="text-white">{data.courier || data.carrierType}</b>
              </span>
              {data.expectedDeliveryDate && (
                <div className="mt-1 text-[11px] font-mono text-emerald-400">
                  Estimated Arrival:{' '}
                  <b>{new Date(data.expectedDeliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                </div>
              )}
            </div>
          </div>

          {/* NDR Exception Action Banner */}
          {isNdr && (
            <div className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️</span> Action Required: Delivery Attempt Unsuccessful
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Our courier was unable to deliver your consignment. Please choose your preferred re-attempt options to prevent return.
                  </p>
                </div>
                <button
                  onClick={() => setShowNdrModal(true)}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-400 transition shadow-lg shadow-rose-500/20"
                >
                  Reschedule Delivery ❯
                </button>
              </div>
            </div>
          )}

          {/* Stepper Progress Bar */}
          <div className="mt-6">
            <div className="grid grid-cols-5 gap-2 text-center">
              {CANONICAL_STEPS.map((step, idx) => {
                const isPassed = currentStepIdx >= idx || isDelivered;
                const isCurrent = currentStepIdx === idx && !isDelivered;

                return (
                  <div key={step.key} className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-base transition-all ${
                        isPassed
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                          : isCurrent
                          ? isNdr
                            ? 'border-2 border-rose-400 bg-rose-500/20 text-white animate-pulse'
                            : 'border-2 border-amber-400 bg-amber-500/20 text-white animate-pulse'
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

        {/* ── Consignment Content / Items Overview ─────────────────────────── */}
        {data.items && data.items.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-lg">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span>📋</span> Consignment Package Manifest ({data.items.length} {data.items.length === 1 ? 'item' : 'items'})
            </h3>
            <div className="divide-y divide-white/5">
              {data.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <span className="font-semibold text-white">{item.name}</span>
                    {item.model && <span className="ml-2 font-mono text-[11px] text-slate-400">({item.model})</span>}
                  </div>
                  <div className="font-mono text-amber-300 font-bold">
                    Qty: {item.quantity}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stock Transfer Route details (if inter-warehouse) ────────────── */}
        {data.fromWarehouse && data.toWarehouse && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <span className="text-[10px] uppercase font-bold text-slate-400">Source Warehouse Hub</span>
              <div className="text-sm font-bold text-white mt-0.5">{data.fromWarehouse.name}</div>
              <div className="text-xs text-slate-400 font-mono">{data.fromWarehouse.city || 'Origin Facility'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <span className="text-[10px] uppercase font-bold text-emerald-400">Destination Warehouse Facility</span>
              <div className="text-sm font-bold text-white mt-0.5">{data.toWarehouse.name}</div>
              <div className="text-xs text-slate-400 font-mono">{data.toWarehouse.city || 'Target Facility'}</div>
            </div>
          </div>
        )}

        {/* ── Live Vector Radar / GPS Map ──────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>📡</span> Live Delivery GPS Radar
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Updated Every 25s</span>
          </div>

          <div className="h-80 w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <LiveTrackingMap
              coordinates={{
                lat: data.currentLocation?.lat || 28.6139,
                lng: data.currentLocation?.lng || 77.2090,
              }}
              carrierName={data.courier || data.carrierType}
              driverName={data.porterDetails?.driverName || 'Delivery Courier Pilot'}
              vehicleNumber={data.porterDetails?.vehicleNumber || 'DL-01-EA-4921'}
              speed={data.currentLocation?.speed || 34}
              heading={data.currentLocation?.heading || 90}
              status={data.status}
              eta={data.expectedDeliveryDate ? 'On Schedule' : 'Estimated 15 mins'}
              origin={{ lat: 28.6289, lng: 77.1950, label: data.fromWarehouse?.name || 'Central Distribution Hub' }}
              destination={{ lat: 28.5355, lng: 77.3910, label: data.toWarehouse?.name || data.city || 'Delivery Address' }}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* ── Assigned Pilot & Security OTP Card (Hyperlocal/Porter) ────────── */}
        {data.porterDetails?.driverName && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* ── Milestone Audit Activity Timeline ────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-5 flex items-center gap-2">
            <span>🕒</span> Detailed Carrier Transit Timeline
          </h3>

          <div className="relative border-l border-white/10 ml-4 space-y-6">
            {data.milestones && data.milestones.length > 0 ? (
              data.milestones.map((m, idx) => (
                <div key={idx} className="relative pl-6">
                  {/* Indicator Dot */}
                  <div
                    className={`absolute -left-2.5 top-1 h-5 w-5 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] ${
                      idx === data.milestones!.length - 1
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                        : 'bg-emerald-500 text-slate-950'
                    }`}
                  >
                    ✓
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {m.status.replace(/_/g, ' ')}
                    </span>
                    {m.timestamp && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(m.timestamp).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                  {m.location && (
                    <p className="text-[11px] text-amber-300/80 font-mono mt-0.5">
                      📍 {m.location}
                    </p>
                  )}
                  {m.details && (
                    <p className="text-xs text-slate-400 mt-1">
                      {m.details}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic pl-6">No transit activity recorded yet.</p>
            )}
          </div>
        </div>

        {/* ── Live Alerts Subscription (WhatsApp / SMS) ───────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 to-slate-900/80 p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>💬</span> Instant Delivery Notifications
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Get real-time milestone alerts sent to your phone when out for delivery.
              </p>
            </div>

            {alertSubscribed ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <span>✓</span> Subscribed for Alerts
              </div>
            ) : (
              <form onSubmit={handleAlertSubscribe} className="flex flex-wrap items-center gap-2">
                <select
                  value={alertChannel}
                  onChange={(e) => setAlertChannel(e.target.value as any)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white"
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                </select>
                <input
                  type="text"
                  placeholder="Mobile # e.g. 9876543210"
                  value={alertContact}
                  onChange={(e) => setAlertContact(e.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 w-44"
                />
                <button
                  type="submit"
                  disabled={subscribing}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {subscribing ? '…' : 'Subscribe'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── Proof of Delivery (if delivered) ─────────────────────────────── */}
        {isDelivered && data.podDetails && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <h4 className="text-sm font-bold text-white">Consignment Delivered Successfully</h4>
                <p className="text-xs text-emerald-300">
                  Verified with recipient electronic delivery confirmation
                  {data.podDetails.deliveredAt && ` on ${new Date(data.podDetails.deliveredAt).toLocaleDateString()}`}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── NDR Self-Service Re-attempt Modal ─────────────────────────────── */}
      {showNdrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>⚠️</span> Reschedule Delivery Re-attempt
              </h3>
              <button
                onClick={() => setShowNdrModal(false)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleNdrSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Re-attempt Preference
                </label>
                <select
                  value={ndrAction}
                  onChange={(e) => setNdrAction(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="REATTEMPT_NEXT_DAY">Re-attempt Tomorrow</option>
                  <option value="PREFERRED_TIME_SLOT">Deliver at specific time slot</option>
                  <option value="ALTERNATE_ADDRESS">Deliver to neighbour / landmark</option>
                  <option value="SELF_PICKUP">Hold for self-pickup at local hub</option>
                </select>
              </div>

              {ndrAction === 'PREFERRED_TIME_SLOT' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase">
                    Select Time Window
                  </label>
                  <select
                    value={ndrTimeSlot}
                    onChange={(e) => setNdrTimeSlot(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    <option value="MORNING_9_TO_12">Morning (9:00 AM – 12:00 PM)</option>
                    <option value="AFTERNOON_12_TO_4">Afternoon (12:00 PM – 4:00 PM)</option>
                    <option value="EVENING_4_TO_8">Evening (4:00 PM – 8:00 PM)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase">
                  Delivery Notes / Landmark Instructions
                </label>
                <textarea
                  rows={3}
                  value={ndrComment}
                  onChange={(e) => setNdrComment(e.target.value)}
                  placeholder="e.g. Please call before arriving or leave with security gate"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNdrModal(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ndrSubmitting}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-400 transition disabled:opacity-50"
                >
                  {ndrSubmitting ? 'Submitting…' : 'Confirm Preference'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
