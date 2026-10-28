'use client';

import { useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';

interface Props {
  coordinates: { lat: number; lng: number };
  carrierName: string;
}

function MarkerContent({ coordinates, carrierName }: Props) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.panTo(coordinates);
    }
  }, [map, coordinates]);

  return (
    <AdvancedMarker position={coordinates} title="Driver Location">
      <div className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-xl border border-white/20">
        <span>🚚</span>
        <span>{carrierName} Live</span>
      </div>
    </AdvancedMarker>
  );
}

export function LiveTrackingMap({ coordinates, carrierName }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

  // Strictly optional: only render if coordinates and API key are present
  if (!apiKey || !coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
    return null;
  }

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-white/10 shadow-inner">
      <APIProvider apiKey={apiKey}>
        <Map
          mapId={mapId}
          defaultCenter={coordinates}
          defaultZoom={14}
          gestureHandling="cooperative"
          disableDefaultUI={false}
        >
          <MarkerContent coordinates={coordinates} carrierName={carrierName} />
        </Map>
      </APIProvider>
    </div>
  );
}
