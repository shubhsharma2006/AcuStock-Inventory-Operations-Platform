'use client';

import React, { useEffect, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';

export interface LocationPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface LiveTrackingMapProps {
  coordinates: { lat: number; lng: number };
  carrierName?: string;
  driverName?: string;
  vehicleNumber?: string;
  speed?: number;
  heading?: number;
  status?: string;
  eta?: string;
  origin?: LocationPoint;
  destination?: LocationPoint;
  className?: string;
}

function MarkerContent({
  coordinates,
  carrierName = 'Carrier',
  vehicleNumber,
  heading = 0,
  speed = 0,
}: {
  coordinates: { lat: number; lng: number };
  carrierName?: string;
  vehicleNumber?: string;
  heading?: number;
  speed?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (map) {
      map.panTo(coordinates);
    }
  }, [map, coordinates]);

  return (
    <AdvancedMarker position={coordinates} title={`${carrierName} Driver`}>
      <div className="relative flex flex-col items-center">
        {/* Direction arrow badge */}
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 shadow-xl border-2 border-white text-white transition-transform duration-500 ease-out"
          style={{ transform: `rotate(${heading}deg)` }}
        >
          <span className="text-base select-none">➤</span>
        </div>
        {/* Info card */}
        <div className="mt-1 whitespace-nowrap rounded-lg bg-slate-900/90 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400 border border-white/20 shadow-md">
          {vehicleNumber ? `${vehicleNumber} • ` : ''}{speed} km/h
        </div>
      </div>
    </AdvancedMarker>
  );
}

/**
 * Resilient Vector Radar Fallback Canvas (renders when Google Maps API key is unset or disabled)
 */
function VectorTelemetryRadar({
  coordinates,
  carrierName = 'Carrier',
  driverName,
  vehicleNumber,
  speed = 36,
  heading = 45,
  status = 'IN_TRANSIT',
  eta = '18 mins',
  origin = { lat: 28.6139, lng: 77.2090, label: 'Central Hub' },
  destination = { lat: 28.5355, lng: 77.3910, label: 'Customer Site' }
}: LiveTrackingMapProps) {
  // Normalize coordinates into an SVG coordinate box (0 to 800, 0 to 500)
  const minLat = Math.min(origin.lat, coordinates.lat, destination.lat) - 0.04;
  const maxLat = Math.max(origin.lat, coordinates.lat, destination.lat) + 0.04;
  const minLng = Math.min(origin.lng, coordinates.lng, destination.lng) - 0.04;
  const maxLng = Math.max(origin.lng, coordinates.lng, destination.lng) + 0.04;

  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  const toSvgX = (lng: number) => 80 + ((lng - minLng) / lngSpan) * 640;
  const toSvgY = (lat: number) => 420 - ((lat - minLat) / latSpan) * 340;

  const originX = toSvgX(origin.lng);
  const originY = toSvgY(origin.lat);
  const driverX = toSvgX(coordinates.lng);
  const driverY = toSvgY(coordinates.lat);
  const destX = toSvgX(destination.lng);
  const destY = toSvgY(destination.lat);

  return (
    <div className="relative h-full w-full bg-slate-950 select-none overflow-hidden font-mono">
      {/* Background Cyber Grid */}
      <svg className="absolute inset-0 h-full w-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="radar-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="2,2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#radar-grid)" />
      </svg>

      {/* Interactive Vector Map SVG */}
      <svg className="relative h-full w-full" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
        {/* Radar Range Rings around Driver */}
        <circle cx={driverX} cy={driverY} r="70" fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
        <circle cx={driverX} cy={driverY} r="140" fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3,3" opacity="0.15" />

        {/* Pulsing Sonar Sweep */}
        <circle cx={driverX} cy={driverY} r="25" fill="#0284c7" opacity="0.25">
          <animate attributeName="r" from="15" to="65" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.4" to="0" dur="2.4s" repeatCount="indefinite" />
        </circle>

        {/* Trajectory Polyline: Origin -> Current Position -> Destination */}
        {/* Completed leg */}
        <line
          x1={originX}
          y1={originY}
          x2={driverX}
          y2={driverY}
          stroke="#10b981"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="6,4"
        />
        {/* Remaining leg */}
        <line
          x1={driverX}
          y1={driverY}
          x2={destX}
          y2={destY}
          stroke="#f59e0b"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="8,6"
          opacity="0.85"
        />

        {/* Origin Hub Node */}
        <g transform={`translate(${originX}, ${originY})`}>
          <rect x="-16" y="-16" width="32" height="32" rx="8" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
          <text x="0" y="5" textAnchor="middle" fontSize="16" fill="#10b981">🏢</text>
          <text x="0" y="28" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="bold">
            ORIGIN: {origin.label || 'HUB'}
          </text>
        </g>

        {/* Destination Customer Node */}
        <g transform={`translate(${destX}, ${destY})`}>
          <circle cx="0" cy="0" r="14" fill="#0f172a" stroke="#ef4444" strokeWidth="2" />
          <text x="0" y="5" textAnchor="middle" fontSize="14" fill="#ef4444">📍</text>
          <text x="0" y="28" textAnchor="middle" fill="#f87171" fontSize="11" fontWeight="bold">
            DEST: {destination.label || 'DROP'}
          </text>
        </g>

        {/* Live Moving Vehicle Node */}
        <g transform={`translate(${driverX}, ${driverY})`}>
          <g transform={`rotate(${heading})`}>
            {/* Vehicle body */}
            <circle cx="0" cy="0" r="16" fill="#4f46e5" stroke="#ffffff" strokeWidth="2.5" shadow-color="#6366f1" />
            <polygon points="0,-12 6,4 0,1 -6,4" fill="#fbbf24" />
          </g>
          {/* Live speed tag */}
          <rect x="-42" y="-36" width="84" height="20" rx="4" fill="#020617" stroke="#38bdf8" strokeWidth="1" />
          <text x="0" y="-22" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="bold">
            {speed} KM/H
          </text>
        </g>
      </svg>

      {/* Top Left Cockpit HUD Overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-white tracking-wider">{carrierName} TELEMETRY</span>
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/30">
            {status}
          </span>
        </div>
        <div className="text-[11px] text-slate-300">
          Driver: <span className="font-semibold text-white">{driverName || 'Verified Pilot'}</span> ({vehicleNumber || 'DL-01-EA-4921'})
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1 border-t border-white/5">
          <span>Lat: <b className="text-slate-200">{coordinates.lat.toFixed(4)}</b></span>
          <span>Lng: <b className="text-slate-200">{coordinates.lng.toFixed(4)}</b></span>
          <span>Heading: <b className="text-slate-200">{heading}°</b></span>
        </div>
      </div>

      {/* Bottom Right ETA / Distance HUD */}
      <div className="absolute bottom-4 right-4 flex items-center gap-4 rounded-xl border border-amber-500/30 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Estimated Arrival</div>
          <div className="text-lg font-black text-amber-400">{eta}</div>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Current Velocity</div>
          <div className="text-lg font-black text-emerald-400">{speed} <span className="text-xs font-normal">km/h</span></div>
        </div>
      </div>
    </div>
  );
}

export function LiveTrackingMap(props: LiveTrackingMapProps) {
  const { coordinates, carrierName = 'Carrier', vehicleNumber, heading = 0, speed = 0, className = 'h-80 w-full' } = props;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID';
  const [useVectorMode, setUseVectorMode] = useState(!apiKey);

  if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center text-slate-400 ${className}`}>
        <p className="text-xs">No GPS coordinates available for this delivery trip yet.</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl ${className}`}>
      {/* Mode toggle button */}
      {apiKey && (
        <button
          onClick={() => setUseVectorMode(!useVectorMode)}
          className="absolute top-3 right-3 z-20 rounded-lg border border-white/20 bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-800 transition"
        >
          {useVectorMode ? '🗺️ Google Maps' : '📡 Vector Radar'}
        </button>
      )}

      {useVectorMode || !apiKey ? (
        <VectorTelemetryRadar {...props} />
      ) : (
        <APIProvider apiKey={apiKey}>
          <Map
            mapId={mapId}
            defaultCenter={coordinates}
            defaultZoom={14}
            gestureHandling="cooperative"
            disableDefaultUI={false}
          >
            <MarkerContent
              coordinates={coordinates}
              carrierName={carrierName}
              vehicleNumber={vehicleNumber}
              heading={heading}
              speed={speed}
            />
          </Map>
        </APIProvider>
      )}
    </div>
  );
}
