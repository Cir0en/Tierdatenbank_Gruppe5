'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Map, MapStyle, config, helpers } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import Navbar from '../components/Navbar';
import { useAuth } from '@clerk/nextjs';

const API = 'http://localhost:5099';

export default function HeatmapPage() {
  const { isSignedIn, userId } = useAuth();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance  = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current || !router.isReady) return;

    // API Key setzen
    config.apiKey = process.env.NEXT_PUBLIC_MAP_API_KEY as string;

    const qLng  = parseFloat(router.query.lng as string);
    const qLat  = parseFloat(router.query.lat as string);
    const qZoom = parseFloat(router.query.zoom as string);
    const initialCenter: [number, number] =
      !isNaN(qLng) && !isNaN(qLat) ? [qLng, qLat] : [8.0020, 50.9411];
    const initialZoom = !isNaN(qZoom) ? qZoom : 5;

    // Karte initialisieren
    const map = new Map({
      container: mapContainer.current,
      style: MapStyle.DATAVIZ.DARK, // Ein dunkler Stil lässt die Heatmap besser leuchten!
      center: initialCenter,
      zoom: initialZoom,
    });

    mapInstance.current = map;

    // Sobald die Karte geladen ist, rufen wir die Daten ab und bauen die Heatmap
    map.on('load', async () => {
      try {
        const headers: Record<string, string> = {};
        if (isSignedIn && userId) {
          headers['X-Clerk-User-Id'] = userId;
        }
        
        // 1. Daten aus dem Backend laden (wie in deiner karte.tsx)
        const res = await fetch(`${API}/api/geolocations/map-items`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const items: {
          itemId: number;
          latitude: number;
          longitude: number;
        }[] = await res.json();

        // 2. Daten in eine GeoJSON FeatureCollection umwandeln
        const geojsonData = {
          type: 'FeatureCollection',
          features: items.map(item => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [item.longitude, item.latitude] // Wichtig: Zuerst Longitude, dann Latitude!
            },
            properties: {
              id: item.itemId
            }
          }))
        };

        // 3. Den MapTiler Helper nutzen, um die Heatmap hinzuzufügen
        await helpers.addHeatmap(map, {
            data: geojsonData as any, // Typ-Casting für den Helper
            // Optionale Einstellungen
            radius: 50, // Größe der Hitze-Punkte
            intensity: 3.5, //Erhöht Gewichtung der Einträge, Standard ist 1
            // blur: 15,   // Verschwimmen der Ränder
        });

      } catch (err) {
        console.error('Heatmap-Daten konnten nicht geladen werden:', err);
      }
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [isSignedIn, userId, router.isReady]); // Dependencies für Auth hinzugefügt

  const goToKarte = () => {
    const map = mapInstance.current;
    if (!map) { router.push('/karte'); return; }
    const c = map.getCenter();
    router.push(`/karte?lng=${c.lng}&lat=${c.lat}&zoom=${map.getZoom()}`);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      {/* Du musst in deiner Navbar ggf. 'heatmap' als aktiven Status abfangen */}
      <Navbar activeNav="heatmap" />

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        <button className="view-switch-btn" onClick={goToKarte} title="Zur Karte wechseln">
          🗺️ Karte
        </button>

        <style jsx global>{`
          .view-switch-btn {
            position: absolute; top: 12px; right: 56px; z-index: 500;
            display: flex; align-items: center; gap: 6px;
            background: rgba(30,30,30,.85); border: 1px solid rgba(255,255,255,.2);
            border-radius: 20px; padding: 7px 14px;
            font-size: 12px; font-weight: 600; color: #fff;
            font-family: 'Inter', system-ui, sans-serif; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,.35);
            transition: background .15s, transform .15s;
          }
          .view-switch-btn:hover { background: rgba(50,50,50,.95); transform: translateY(-1px); }
        `}</style>
      </main>
    </div>
  );
}