'use client';

import React, { useEffect, useRef } from 'react';
import { Map, MapStyle, config } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import { MarkerLayout } from '@maptiler/marker-layout';

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);

  useEffect(() => {
    // Sicherstellen, dass der Container existiert und die Map nur einmal initialisiert wird
    if (!mapContainer.current || mapInstance.current) return;

    // Konfiguration der API[cite: 1] hier API Key eingeben von MapTilerCloud
    config.apiKey = process.env.MAP_API_KEY as string;

    // Map initialisieren[cite: 1]
    const map = new Map({
      container: mapContainer.current,
      style: MapStyle.STREETS,
      geolocate: true
    });
    mapInstance.current = map;

    // Container für die Marker erstellen[cite: 1]
    const markerContainer = document.createElement("div");
    mapContainer.current.appendChild(markerContainer);

    (async () => {
      await map.onReadyAsync();

      // MarkerLayout konfigurieren[cite: 1]
      const markerManager = new MarkerLayout(map as any, {
        layers: ["City labels", "Place labels", "Town labels"],
        markerSize: [140, 80],
        markerAnchor: "top",
        offset: [0, -8],
        sortingProperty: "rank",
        filter: (feature) => {
          if (["City labels", "Town labels"].includes(feature.layer.id)) {
            return true;
          } else {
            return ["village"].includes(feature.properties.class);
          }
        }
      });

      const markerLogicContainer: { [key: string]: HTMLDivElement } = {};

      // Funktion zum Aktualisieren der Marker[cite: 1]
      const updateMarkers = () => {
        const markerStatus = markerManager.update();
        if (!markerStatus) return;

        // Entfernen[cite: 1]
        markerStatus.removed.forEach((abstractMarker) => {
          const markerDiv = markerLogicContainer[abstractMarker.id];
          if (markerDiv) {
            delete markerLogicContainer[abstractMarker.id];
            markerContainer.removeChild(markerDiv);
          }
        });

        // Aktualisieren[cite: 1]
        markerStatus.updated.forEach((abstractMarker) => {
          const markerDiv = markerLogicContainer[abstractMarker.id];
          if (markerDiv) {
            updateMarkerDiv(abstractMarker, markerDiv);
          }
        });

        // Neu erstellen[cite: 1]
        markerStatus.new.forEach((abstractMarker) => {
          const markerDiv = makeMarker(abstractMarker);
          markerLogicContainer[abstractMarker.id] = markerDiv;
          markerContainer.appendChild(markerDiv);
        });
      };

      // Event-Listener registrieren[cite: 1]
      map.on("move", updateMarkers);
      map.on("moveend", () => {
        map.once("idle", updateMarkers);
      });

      updateMarkers();
    })();

    // Aufräumen beim Verlassen der Seite
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* Styles für die Marker (können auch in eine CSS-Datei) */}
      <style jsx global>{`
        .marker {
          position: absolute;
          pointer-events: none;
          will-change: transform;
        }
        .markerBody {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          padding: 8px;
          font-family: sans-serif;
        }
        .markerTop {
          font-weight: bold;
          border-bottom: 1px solid #eee;
          margin-bottom: 4px;
        }
        .fade-in-animation {
          animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </main>
  );
}

// Hilfsfunktionen außerhalb der Komponente[cite: 1]
function makeMarker(abstractMarker: any) {
  const marker = document.createElement("div");
  marker.classList.add("marker");
  marker.classList.add('fade-in-animation');
  updateMarkerDiv(abstractMarker, marker);

  const feature = abstractMarker.features[0];
  marker.innerHTML = `
    <div class="markerPointy"></div>
    <div class="markerBody">
      <div class="markerTop">
        ${feature.properties["name:en"] || feature.properties["name"]}
      </div>
      <div class="markerBottom">
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 11px;">
          <li><b>Name:</b> ${feature.properties.name}</li>
          <li><b>Rank:</b> ${feature.properties.rank}</li>
        </ul>
      </div>
    </div>
  `;
  return marker;
}

function updateMarkerDiv(abstractMarker: any, marker: HTMLDivElement) {
  marker.style.width = `${abstractMarker.size[0]}px`;
  marker.style.height = `${abstractMarker.size[1]}px`;
  marker.style.transform = `translate(${abstractMarker.position[0]}px, ${abstractMarker.position[1]}px)`;
}