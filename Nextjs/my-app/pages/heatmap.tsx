// Route /heatmap: alternative Kartenansicht zu pages/karte.tsx, die alle
// erfassten Fundorte statt als einzelne Marker als Dichte-Heatmap (MapTiler
// helpers.addHeatmap) darstellt. Nützlich, um auf einen Blick zu erkennen, wo
// besonders viele Funde konzentriert sind. Bietet einen Wechsel zurück zur
// normalen Marker-Karte.
'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Map, MapStyle, config, helpers } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import Navbar from '../components/Navbar';
import { useAuth } from '@clerk/nextjs';
import { useTaxonomyFilter, TaxonomyFilterControl } from '../components/TaxonomyFilter';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// Fundobjekt der Karte (Teilmenge von /api/geolocations/map-items), inkl. Taxonomie für den Filter.
interface HeatItem {
  itemId: number;
  latitude: number;
  longitude: number;
  taxonomyId: number | null;
}

// Wandelt die Items in eine GeoJSON-FeatureCollection für den Heatmap-Layer um.
function toGeoJson(items: HeatItem[]) {
  return {
    type: 'FeatureCollection',
    features: items.map(item => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] },
      properties: { id: item.itemId },
    })),
  };
}

export default function HeatmapPage() {
  const { isSignedIn, userId } = useAuth();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance  = useRef<Map | null>(null);
  // Id der vom Heatmap-Helper angelegten GeoJSON-Quelle, um die Daten beim Filtern zu aktualisieren.
  const heatmapSourceRef = useRef<string | null>(null);

  // Alle geladenen Items (für Taxonomie-Filter + dynamisches Neuberechnen der Heatmap).
  const [items, setItems] = useState<HeatItem[]>([]);
  // Eine per URL (?tax=) übergebene Vorauswahl bleibt so beim Wechsel Karte→Heatmap erhalten.
  const taxParam = router.query.tax;
  const initialTax = typeof taxParam === 'string' && taxParam !== '' && Number.isFinite(Number(taxParam))
    ? Number(taxParam) : null;
  const taxFilter = useTaxonomyFilter(items, initialTax);
  const visibleCount = useMemo(
    () => items.filter(it => taxFilter.matches(it.taxonomyId)).length,
    [items, taxFilter.matches]
  );

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

        const loaded: HeatItem[] = (await res.json()).map((i: any) => ({
          itemId: i.itemId,
          latitude: i.latitude,
          longitude: i.longitude,
          taxonomyId: i.taxonomyId ?? null,
        }));
        // Items in den React-State spiegeln, damit Taxonomie-Filter + Neuberechnung darauf zugreifen.
        setItems(loaded);

        // 2. Daten in eine GeoJSON FeatureCollection umwandeln (anfangs ohne Filter → alle Punkte)
        const geojsonData = toGeoJson(loaded);

        // 3. Den MapTiler Helper nutzen, um die Heatmap hinzuzufügen
        //
        // Radius/Intensität sind zoombasiert gestaffelt: bei weiter Ansicht (z.B. ganz
        // Deutschland) bleiben Einzelfunde klein/blass, während dicht beieinander liegende
        // Funde (Cluster) sich zu klar erkennbaren Hotspots aufsummieren. Beim Reinzoomen
        // wachsen Radius und Intensität mit, damit auch einzelne Cluster für sich gut lesbar
        // bleiben. Mit den bisherigen fixen Werten (radius: 50, intensity: 3.5) sahen
        // Einzelpunkte bei Weitwinkel-Zoom fast genauso "heiß" aus wie Cluster.
        const { heatmapSourceId } = helpers.addHeatmap(map, {
            data: geojsonData as any, // Typ-Casting für den Helper
            radius: [
              { zoom: 4, value: 10 },
              { zoom: 6, value: 18 },
              { zoom: 9, value: 30 },
              { zoom: 12, value: 45 },
              { zoom: 16, value: 70 },
            ],
            intensity: [
              { zoom: 4, value: 0.6 },
              { zoom: 6, value: 1 },
              { zoom: 9, value: 1.5 },
              { zoom: 12, value: 2 },
            ],
            opacity: 0.85,
        });
        // Source-Id merken, damit der Taxonomie-Filter die Heatmap-Daten aktualisieren kann.
        heatmapSourceRef.current = heatmapSourceId;

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

  // Aktualisiert die Heatmap beim Wechsel des Taxonomie-Filters (oder wenn die Items
  // geladen wurden): Die GeoJSON-Quelle des Heatmap-Layers wird auf die gefilterten
  // Punkte gesetzt, wodurch MapTiler die Dichtekarte automatisch neu zeichnet.
  useEffect(() => {
    const map = mapInstance.current;
    const srcId = heatmapSourceRef.current;
    if (!map || !srcId) return;
    const source = map.getSource(srcId) as { setData?: (d: any) => void } | undefined;
    if (source?.setData) {
      source.setData(toGeoJson(items.filter(it => taxFilter.matches(it.taxonomyId))));
    }
  }, [items, taxFilter.matches]);

  // Wechselt zurück zur Marker-Karte (pages/karte.tsx) und übergibt das aktuelle
  // Kartenzentrum/-zoom als Query-Parameter, damit die Ansicht dort nahtlos
  // an derselben Stelle fortgesetzt wird.
  const goToKarte = () => {
    // Aktiven Taxonomie-Filter mitnehmen, damit er auf der Karte erhalten bleibt.
    const tax = taxFilter.selectedId != null ? `&tax=${taxFilter.selectedId}` : '';
    const map = mapInstance.current;
    if (!map) { router.push(`/karte${tax ? `?${tax.slice(1)}` : ''}`); return; }
    const c = map.getCenter();
    router.push(`/karte?lng=${c.lng}&lat=${c.lat}&zoom=${map.getZoom()}${tax}`);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      {/* Du musst in deiner Navbar ggf. 'heatmap' als aktiven Status abfangen */}
      <Navbar activeNav="heatmap" />

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {/* Taxonomie-Filter (geteiltes Modul, auch in der normalen Karte genutzt) */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 500 }}>
          <TaxonomyFilterControl
            options={taxFilter.options}
            selectedId={taxFilter.selectedId}
            onChange={taxFilter.setSelectedId}
            count={visibleCount}
            dark
          />
        </div>

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