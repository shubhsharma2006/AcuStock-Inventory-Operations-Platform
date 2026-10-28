'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';

// Dynamic import: Google Maps JS bundle is loaded ONLY when live GPS coordinates exist
const LazyLiveTrackingMap = dynamic(
  () => import('./live-tracking-map').then((mod) => mod.LiveTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full rounded-2xl bg-slate-900/40 border border-white/5 flex items-center justify-center animate-pulse text-xs text-slate-500">
        Loading live map view…
      </div>
    )
  }
);

interface TrackingEvent {
  _id: string;
  status: string;
  location?: string;
  geoLocation?: { lat: number; lng: number };
  carrierType: string;
  recordedAt: string;
  source: string;
  metadata?: {
    driverName?: string;
    driverPhone?: string;
    vehicleNumber?: string;
    eta?: string;
    expectedDelivery?: string;
  };
}

interface TrackingResponse {
  trackingMode: 'NONE' | 'PORTAL_LINK' | 'LIVE_API' | 'MANUAL';
  trackingAllowed: boolean;
  isApiConfigured: boolean;
  shipment: any;
  events: TrackingEvent[];
  portalUrl: string | null;
  hasLiveGps: boolean;
  carrierType: string;
}

interface Props {
  shipmentId: string;
  shipmentRef: string;
  carrierType: string;
  awb?: string;
  onClose?: () => void;
}

const STATUS_ICONS: Record<string, string> = {
  DISPATCHED:       '📦',
  IN_TRANSIT:       '🚚',
  OUT_FOR_DELIVERY: '🏃',
  DELIVERED:        '✅',
  RETURNED:         '↩️',
  CANCELLED:        '❌'
};

export function ShipmentTrackingPanel({ shipmentId, shipmentRef, carrierType, awb, onClose }: Props) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery<TrackingResponse>({
    queryKey: ['shipment-tracking', shipmentId],
    queryFn: () => apiFetch<TrackingResponse>(`/tracking/${shipmentId}`),
    refetchInterval: 45_000, // Poll every 45s while drawer is open
    retry: 1
  });

  const pollNowMutation = useMutation({
    mutationFn: () => apiFetch(`/tracking/${shipmentId}/poll-now`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-tracking', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
        <div className="h-6 w-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        <p className="text-xs font-medium">Checking carrier dispatch details…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 text-center space-y-2">
        <span className="text-2xl">⚠️</span>
        <p className="text-sm font-semibold text-white">Tracking Data Unavailable</p>
        <p className="text-xs text-slate-400">
          {(error as Error)?.message || 'Could not retrieve tracking details for this dispatch.'}
        </p>
      </div>
    );
  }

  const { trackingMode, isApiConfigured, events = [], portalUrl, hasLiveGps } = data;
  const latestGeoEvent = events.find((e) => e.geoLocation?.lat && e.geoLocation?.lng);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            {carrierType} LOGISTICS
          </span>
          <h3 className="text-base font-bold text-white">
            Dispatch #{shipmentRef}
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* AWB info badge */}
      {awb && (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2">
          <div className="text-xs">
            <span className="text-slate-400">AWB / Consignment: </span>
            <span className="font-mono font-bold text-white">{awb}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(awb);
              alert('AWB copied to clipboard!');
            }}
            className="text-[11px] text-amber-300 hover:text-amber-200 transition"
          >
            📋 Copy
          </button>
        </div>
      )}

      {/* TIER 0: Manual / In-House Dispatch (No external tracking) */}
      {trackingMode === 'NONE' && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-center space-y-2">
          <span className="text-3xl">🏢</span>
          <h4 className="text-sm font-semibold text-white">In-House Fleet / Manual Dispatch</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            This shipment is managed via direct transport or local fleet. Lifecycle updates are maintained manually using the status updater.
          </p>
        </div>
      )}

      {/* TIER 3: Live GPS Map (rendered ONLY if coordinates exist) */}
      {hasLiveGps && latestGeoEvent?.geoLocation && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Vehicle GPS Active
            </span>
            {latestGeoEvent.metadata?.eta && (
              <span className="text-slate-300 font-medium">ETA: {latestGeoEvent.metadata.eta}</span>
            )}
          </div>
          <LazyLiveTrackingMap
            coordinates={latestGeoEvent.geoLocation}
            carrierName={carrierType}
          />
        </div>
      )}

      {/* TIER 1: 1-Click Direct Carrier Portal Link */}
      {portalUrl && (
        <div className="flex items-center justify-between rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
              <span>🌐</span>
              <span>Official Carrier Portal</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Track live checkpoints on the official {carrierType} website
            </p>
          </div>
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition shrink-0"
          >
            <span>Track on {carrierType}</span>
            <span>↗</span>
          </a>
        </div>
      )}

      {/* Driver & Transit Metadata (if available) */}
      {events[0]?.metadata?.driverName && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 flex items-center justify-between text-xs">
          <div>
            <div className="text-slate-400">Assigned Driver</div>
            <div className="font-semibold text-white">
              {events[0].metadata.driverName}
              {events[0].metadata.vehicleNumber && ` · ${events[0].metadata.vehicleNumber}`}
            </div>
          </div>
          {events[0].metadata.driverPhone && (
            <a
              href={`tel:${events[0].metadata.driverPhone}`}
              className="rounded-lg bg-emerald-500/20 text-emerald-300 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500/30 transition"
            >
              📞 Call Driver
            </a>
          )}
        </div>
      )}

      {/* Live Polling Refresh Action */}
      {isApiConfigured && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={pollNowMutation.isPending || refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await pollNowMutation.mutateAsync();
              } catch (err: any) {
                alert(err?.message || 'Failed to refresh tracking status');
              } finally {
                setRefreshing(false);
              }
            }}
            className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1 transition disabled:opacity-50"
          >
            <span className={pollNowMutation.isPending ? 'animate-spin' : ''}>🔄</span>
            <span>{pollNowMutation.isPending ? 'Fetching update…' : 'Poll Carrier Now'}</span>
          </button>
        </div>
      )}

      {/* TIER 2: Milestone Events Timeline */}
      {events.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Delivery Milestones & Checkpoints
          </h4>
          <div className="relative space-y-3">
            {events.map((evt, idx) => (
              <div key={evt._id} className="flex items-start gap-3 text-xs">
                <div className="flex flex-col items-center">
                  <span className="text-base leading-none">
                    {STATUS_ICONS[evt.status] || '📍'}
                  </span>
                  {idx < events.length - 1 && (
                    <div className="w-0.5 h-6 bg-white/10 my-1" />
                  )}
                </div>
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      {evt.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(evt.recordedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {evt.location && (
                    <p className="text-slate-300">{evt.location}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : trackingMode !== 'NONE' && (
        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-400">
          No automated carrier events recorded yet. Click above to view status on the carrier portal or trigger a poll.
        </div>
      )}
    </div>
  );
}
