'use client';

import React, { useEffect, useRef } from 'react';
import { Map, MapStyle, config, Marker, Popup } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import Navbar from '../components/Navbar';
import { useAuth } from '@clerk/nextjs';

export default function MapPage() {
  const { isSignedIn } = useAuth();
  const isSignedInRef = useRef(isSignedIn);

  useEffect(() => {
    isSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance  = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    config.apiKey = process.env.NEXT_PUBLIC_MAP_API_KEY as string;

    const map = new Map({
      container: mapContainer.current,
      style: MapStyle.STREETS,
      center: [8.0020, 50.9411],
      zoom: 5,
    });
    mapInstance.current = map;

    // ── Marker-Element erstellen ─────────────────────────────────────────
    const createMarkerElement = (artname: string, geschlecht?: string) => {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      const icon = geschlecht === 'Männlich' ? '♂' : geschlecht === 'Weiblich' ? '♀' : '◉';
      el.innerHTML = `
        <div class="markerBody">
          <span class="markerIcon">${icon}</span>
          <div class="markerText">${artname}</div>
        </div>
      `;
      return el;
    };

    // ── Popup-Formular HTML ──────────────────────────────────────────────
    const buildPopupContent = () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="popup-form">
          <div class="popup-title">🐾 Neues Tier erfassen</div>

          <!-- Artname (Pflichtfeld) -->
          <div class="form-group">
            <label class="form-label">
              Artname <span class="required">*</span>
            </label>
            <input
              id="f-artname"
              type="text"
              placeholder="z. B. Papilio machaon"
              class="form-input"
              required
            />
            <span class="field-hint" id="hint-artname" style="display:none;">
              Bitte Artname eingeben.
            </span>
          </div>

          <!-- Geschlecht -->
          <div class="form-group">
            <label class="form-label">Geschlecht</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="geschlecht" value="Männlich" />
                <span>♂ Männlich</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="geschlecht" value="Weiblich" />
                <span>♀ Weiblich</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="geschlecht" value="Unbekannt" checked />
                <span>◉ Unbekannt</span>
              </label>
            </div>
          </div>

          <!-- Altersklasse -->
          <div class="form-group">
            <label class="form-label">Altersklasse</label>
            <select id="f-altersklasse" class="form-input form-select">
              <option value="">— nicht angegeben —</option>
              <option value="Juvenile">Juvenil (Jungtier)</option>
              <option value="Subadult">Subadult</option>
              <option value="Adult">Adult (Erwachsen)</option>
              <option value="Senior">Senior</option>
            </select>
          </div>

          <!-- Körpermasse + Körperlänge nebeneinander -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Körpermasse</label>
              <div class="input-unit-wrap">
                <input
                  id="f-masse"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  class="form-input input-unit"
                />
                <span class="unit-label">g</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Körperlänge</label>
              <div class="input-unit-wrap">
                <input
                  id="f-laenge"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0.0"
                  class="form-input input-unit"
                />
                <span class="unit-label">mm</span>
              </div>
            </div>
          </div>

          <!-- Buttons -->
          <div class="form-actions">
            <button id="btn-cancel" class="btn-cancel">Abbrechen</button>
            <button id="btn-save"   class="btn-save">💾 Speichern</button>
          </div>
        </div>
      `;
      return div;
    };

    // ── Klick auf Karte ──────────────────────────────────────────────────
    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;

      // Unangemeldete Nutzer dürfen keine Einträge erstellen
      if (!isSignedInRef.current) {
        new Popup({ closeButton: true, closeOnClick: true, maxWidth: '260px' })
          .setLngLat([lng, lat])
          .setHTML(`
            <div style="padding:14px 16px;font-family:sans-serif;font-size:13px;color:#202124;">
              <div style="font-weight:600;margin-bottom:6px;">🔒 Anmeldung erforderlich</div>
              <div style="color:#5f6368;margin-bottom:10px;">Um Tiere auf der Karte zu erfassen, musst du angemeldet sein.</div>
              <a href="/login" style="display:inline-block;padding:6px 14px;background:#0078FF;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">Anmelden</a>
            </div>
          `)
          .addTo(map);
        return;
      }

      const content = buildPopupContent();

      const popup = new Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '340px',
      })
        .setLngLat([lng, lat])
        .setDOMContent(content)
        .addTo(map);

      // Fokus auf Artname
      setTimeout(() => {
        (content.querySelector('#f-artname') as HTMLInputElement)?.focus();
      }, 100);

      // Abbrechen
      content.querySelector('#btn-cancel')?.addEventListener('click', () => {
        popup.remove();
      });

      // Speichern
      content.querySelector('#btn-save')?.addEventListener('click', async () => {
        const artnameEl    = content.querySelector('#f-artname')              as HTMLInputElement;
        const altersEl     = content.querySelector('#f-altersklasse')         as HTMLSelectElement;
        const masseEl      = content.querySelector('#f-masse')                as HTMLInputElement;
        const laengeEl     = content.querySelector('#f-laenge')               as HTMLInputElement;
        const geschlechtEl = content.querySelector('input[name="geschlecht"]:checked') as HTMLInputElement;
        const hintArtname  = content.querySelector('#hint-artname')           as HTMLElement;
        const btnSave      = content.querySelector('#btn-save')               as HTMLButtonElement;

        const artname      = artnameEl.value.trim();
        const geschlecht   = geschlechtEl?.value ?? 'Unbekannt';
        const altersklasse = altersEl.value || null;
        const masse        = masseEl.value  ? parseFloat(masseEl.value)  : null;
        const laenge       = laengeEl.value ? parseFloat(laengeEl.value) : null;

        // Validierung: Artname ist Pflichtfeld
        if (!artname) {
          artnameEl.classList.add('input-error');
          hintArtname.style.display = 'block';
          artnameEl.focus();
          return;
        }

        // Speichern-Button deaktivieren während der API-Anfrage läuft
        btnSave.disabled = true;
        btnSave.textContent = '⏳ Wird gespeichert…';

        // Payload nach CreateMapAnimalDto aufbauen
        const payload = {
          name:          artname,
          sex:           geschlecht === 'Unbekannt' ? null : geschlecht,
          ageClass:      altersklasse,
          bodyMassGram:  masse,
          bodyLengthMm:  laenge,
          latitude:      lat,
          longitude:     lng,
        };

        try {
          const res = await fetch('http://localhost:5099/api/animals/map', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          });

          if (!res.ok) {
            // Fehlertext aus der API-Antwort anzeigen
            const errText = await res.text();
            throw new Error(errText || `HTTP ${res.status}`);
          }

          // Marker wird erst nach erfolgreichem Speichern auf der Karte gesetzt
          const markerEl = createMarkerElement(artname, geschlecht);
          new Marker({ element: markerEl })
            .setLngLat([lng, lat])
            .addTo(map);

          popup.remove();
        } catch (err) {
          // Fehlermeldung direkt im Popup anzeigen, ohne es zu schließen
          btnSave.disabled = false;
          btnSave.textContent = '💾 Speichern';

          let errDiv = content.querySelector('#save-error') as HTMLElement | null;
          if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.id = 'save-error';
            errDiv.style.cssText =
              'color:#c5221f;font-size:12px;margin-top:8px;padding:6px 8px;background:#fce8e6;border-radius:4px;';
            content.querySelector('.form-actions')?.before(errDiv);
          }
          errDiv.textContent = `Fehler: ${(err as Error).message}`;
        }
      });

      // Fehlerstatus zurücksetzen beim Tippen
      content.querySelector('#f-artname')?.addEventListener('input', () => {
        (content.querySelector('#f-artname') as HTMLInputElement).classList.remove('input-error');
        (content.querySelector('#hint-artname') as HTMLElement).style.display = 'none';
      });
    });

    // ── Tiere aus DB laden und als Marker anzeigen ───────────────────────
    // map-items verknüpft CollectItems mit GeoLocations über den
    // Fremdschlüssel FindingLocationId und liefert Tiername + Koordinaten.
    map.on('load', async () => {
      try {
        const res = await fetch('http://localhost:5099/api/geolocations/map-items');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const items: {
          itemId: number;
          itemName: string | null;
          locationName: string;
          latitude: number;
          longitude: number;
          sex: string | null;
        }[] = await res.json();

        for (const item of items) {
          // Tiername anzeigen, Fallback auf Ortsnamen wenn kein Name gesetzt
          const label = item.itemName ?? item.locationName;
          const el = createMarkerElement(label, item.sex ?? undefined);
          new Marker({ element: el })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);
        }
      } catch (err) {
        // Karte bleibt nutzbar, auch wenn Marker nicht geladen werden
        console.error('Marker konnten nicht geladen werden:', err);
      }
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <Navbar activeNav="karte" />
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      <style jsx global>{`
        /* ── Marker ── */
        .custom-marker { pointer-events: auto; cursor: pointer; }
        .markerBody {
          display: flex; align-items: center; gap: 6px;
          background: #fff; border: 2px solid #0078FF;
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          padding: 6px 14px; transition: transform 0.2s ease;
        }
        .markerBody:hover { transform: scale(1.08); }
        .markerIcon { font-size: 14px; color: #0078FF; }
        .markerText { font-weight: 600; font-size: 13px; color: #202124; font-family: sans-serif; }

        /* ── Popup wrapper ── */
        .maplibregl-popup-content,
        .mapboxgl-popup-content {
          padding: 0 !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 30px rgba(0,0,0,0.18) !important;
          overflow: hidden;
          font-family: sans-serif;
        }

        /* ── Form ── */
        .popup-form { padding: 18px 18px 14px; min-width: 280px; }
        .popup-title {
          font-size: 15px; font-weight: 600; color: #202124;
          margin-bottom: 14px; padding-bottom: 10px;
          border-bottom: 1px solid #e0e0e0;
        }
        .form-group { margin-bottom: 12px; }
        .form-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
          margin-bottom: 12px;
        }
        .form-row .form-group { margin-bottom: 0; }

        .form-label {
          display: block; font-size: 11px; font-weight: 600;
          color: #5f6368; text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 5px;
        }
        .required { color: #ea4335; }

        .form-input {
          width: 100%; padding: 8px 10px; border-radius: 6px;
          border: 1px solid #dadce0; font-size: 13px; color: #202124;
          background: #fff; outline: none; font-family: sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .form-input:focus {
          border-color: #0078FF;
          box-shadow: 0 0 0 3px rgba(0,120,255,0.1);
        }
        .form-input.input-error {
          border-color: #ea4335;
          box-shadow: 0 0 0 3px rgba(234,67,53,0.1);
        }
        .form-select { cursor: pointer; }

        /* Einheit-Wrapper */
        .input-unit-wrap { position: relative; display: flex; align-items: center; }
        .input-unit { padding-right: 32px !important; }
        .unit-label {
          position: absolute; right: 10px;
          font-size: 11px; color: #9aa0a6; font-weight: 500; pointer-events: none;
        }

        /* Radio buttons */
        .radio-group {
          display: flex; gap: 8px; flex-wrap: wrap;
        }
        .radio-label {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; color: #202124; cursor: pointer;
          background: #f8f9fa; border: 1px solid #dadce0;
          border-radius: 20px; padding: 4px 10px;
          transition: all 0.15s; user-select: none;
        }
        .radio-label:hover { border-color: #0078FF; background: #e8f0fe; }
        .radio-label input[type="radio"] { display: none; }
        .radio-label:has(input:checked) {
          background: #e8f0fe; border-color: #0078FF; color: #0078FF; font-weight: 500;
        }

        /* Hint */
        .field-hint { font-size: 11px; color: #ea4335; margin-top: 4px; display: block; }

        /* Buttons */
        .form-actions {
          display: flex; gap: 8px; justify-content: flex-end;
          margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f3f4;
        }
        .btn-cancel {
          padding: 7px 16px; border-radius: 6px; border: 1px solid #dadce0;
          background: #fff; font-size: 13px; color: #5f6368; cursor: pointer;
          font-weight: 500; font-family: sans-serif; transition: all 0.15s;
        }
        .btn-cancel:hover { background: #f1f3f4; }
        .btn-save {
          padding: 7px 18px; border-radius: 6px; border: none;
          background: #0078FF; color: #fff; font-size: 13px;
          font-weight: 600; cursor: pointer; font-family: sans-serif;
          transition: background 0.15s, box-shadow 0.15s;
          box-shadow: 0 1px 4px rgba(0,120,255,0.3);
        }
        .btn-save:hover { background: #0060cc; box-shadow: 0 2px 8px rgba(0,120,255,0.4); }
      `}</style>
      </main>
    </div>
  );
}