// Route /karte: interaktive Karten-Ansicht (MapTiler) zur Erfassung und Anzeige
// von Fundorten. Angemeldete Nutzer können per Klick auf die Karte ein neues Tier
// mit Koordinaten anlegen (TierFormPanel); alle Besucher sehen bereits erfasste
// Tiere als Marker. Bietet außerdem einen Wechsel zur Heatmap-Ansicht (pages/heatmap.tsx).
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Map, MapStyle, config, Marker, Popup } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import Navbar from '../components/Navbar';
import { useAuth } from '@clerk/nextjs';

const API = 'http://localhost:5099';
const KATEGORIE_OPTIONS = ['Insekten','Säugetiere','Vögel','Amphibien','Reptilien','Fische','Spinnentiere','Schnecken','Sonstige'];
const SELTENHEIT_OPTIONS = ['Häufig','Selten','Sehr selten','Ungefährdet','Wichtig','Geschützt','Stark gefährdet'];

interface TaxonomyOption { id: number; name: string; rank: string | null; }
interface CollectionOption { id: number; name: string; isPublic: boolean; }

// ── Tier-Erfassungs-Panel (fixed overlay – immer vollständig sichtbar) ─────────

// Formular-Panel, das sich öffnet, wenn ein angemeldeter Nutzer auf die Karte
// klickt. Erfasst die Tierdaten (Name, Kategorie, Maße, ...) für die zuvor per
// Klick ermittelten Koordinaten (coords) und legt bei Bestätigung einen neuen
// Datensatz über die Animals-API an. Lädt außerdem die eigenen (Owner-)Sammlungen
// des Nutzers nach, damit das neue Tier optional direkt einer Sammlung zugeordnet
// werden kann.
function TierFormPanel({ taxonomies, coords, userId, onClose, onSaved }: {
  taxonomies: TaxonomyOption[];
  coords: { lng: number; lat: number };
  userId: string | null | undefined;
  onClose: () => void;
  onSaved: (name: string, sex: string, id: number) => void;
}) {
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [kategorie, setKategorie]   = useState('');
  const [seltenheit, setSeltenheit] = useState('');
  const [lebensraum, setLebensraum] = useState('');
  const [findDate, setFindDate]     = useState('');
  const [taxonomyId, setTaxonomyId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [sex, setSex]               = useState('Unbekannt');
  const [ageClass, setAgeClass]     = useState('');
  const [bodyMass, setBodyMass]     = useState('');
  const [bodyLen, setBodyLen]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [nameErr, setNameErr]       = useState(false);
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/api/collections`, { headers: { 'X-Clerk-User-Id': userId } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) =>
        setCollections(data.filter(c => c.isOwner).map(c => ({ id: c.id, name: c.name, isPublic: c.isPublic })))
      )
      .catch(() => {});
  }, [userId]);

  // Validiert minimal (Artname erforderlich) und legt das neue Tier inkl.
  // Koordinaten per POST an. Bei Erfolg wird onSaved() aufgerufen, damit die
  // Elternkomponente (MapPage) direkt einen Marker an der geklickten Position
  // ergänzen kann, ohne die komplette Marker-Liste neu laden zu müssen.
  const handleSave = async () => {
    if (!name.trim()) { setNameErr(true); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/animals/map`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         name.trim(),
          sex:          sex === 'Unbekannt' ? null : sex,
          ageClass:     ageClass || null,
          bodyMassGram: bodyMass ? parseFloat(bodyMass) : null,
          bodyLengthMm: bodyLen  ? parseFloat(bodyLen)  : null,
          latitude:     coords.lat,
          longitude:    coords.lng,
          description:  description.trim() || null,
          status:       seltenheit || null,
          kategorie:    kategorie || null,
          lebensraum:   lebensraum.trim() || null,
          findDate:     findDate || null,
          taxonomyId:   taxonomyId   ? parseInt(taxonomyId)   : null,
          collectionId: collectionId ? parseInt(collectionId) : null,
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      const saved = await res.json();
      onSaved(name.trim(), sex, saved.id);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="tp-overlay" onClick={saving ? undefined : onClose}>
      <div className="tp-panel" onClick={e => e.stopPropagation()}>

        <div className="tp-header">
          <span className="tp-title">🐾 Neues Tier erfassen</span>
          <button className="tp-close" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="tp-body">
          {error && <div className="tp-error">{error}</div>}

          <div className="tp-group">
            <label className="tp-label">Artname <span className="tp-req">*</span></label>
            <input
              className={`tp-input${nameErr ? ' tp-input-err' : ''}`}
              type="text" autoFocus placeholder="z. B. Papilio machaon"
              value={name}
              onChange={e => { setName(e.target.value); setNameErr(false); }}
            />
            {nameErr && <span className="tp-hint">Bitte Artname eingeben.</span>}
          </div>

          <div className="tp-group">
            <label className="tp-label">Beschreibung</label>
            <textarea className="tp-input tp-textarea" placeholder="Kurze Beschreibung…"
              value={description} onChange={e => setDesc(e.target.value)} />
          </div>

          <div className="tp-row">
            <div className="tp-group">
              <label className="tp-label">Tier-Kategorie</label>
              <select className="tp-input tp-select" value={kategorie} onChange={e => setKategorie(e.target.value)}>
                <option value="">— nicht angegeben —</option>
                {KATEGORIE_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="tp-group">
              <label className="tp-label">Seltenheit</label>
              <select className="tp-input tp-select" value={seltenheit} onChange={e => setSeltenheit(e.target.value)}>
                <option value="">— nicht angegeben —</option>
                {SELTENHEIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="tp-group">
            <label className="tp-label">Lebensraum</label>
            <input className="tp-input" type="text" placeholder="z. B. Alpine Wiesen, Berghänge"
              value={lebensraum} onChange={e => setLebensraum(e.target.value)} />
          </div>

          <div className="tp-row">
            <div className="tp-group">
              <label className="tp-label">Funddatum</label>
              <input className="tp-input" type="date" value={findDate} onChange={e => setFindDate(e.target.value)} />
            </div>
            <div className="tp-group">
              <label className="tp-label">Wissenschaftlicher Name</label>
              <select className="tp-input tp-select" value={taxonomyId} onChange={e => setTaxonomyId(e.target.value)}>
                <option value="">— keine —</option>
                {taxonomies.map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {t.rank ? `[${t.rank}] ` : ''}{t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {collections.length > 0 && (
            <div className="tp-group">
              <label className="tp-label">Sammlung</label>
              <select className="tp-input tp-select" value={collectionId} onChange={e => setCollectionId(e.target.value)}>
                <option value="">— keine Sammlung —</option>
                {collections.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.isPublic ? '🌐' : '🔒'} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="tp-group">
            <label className="tp-label">Geschlecht</label>
            <div className="tp-radio-group">
              {(['Männlich', 'Weiblich', 'Unbekannt'] as const).map(g => (
                <label key={g} className={`tp-radio${sex === g ? ' tp-radio-checked' : ''}`}>
                  <input type="radio" name="tp-sex" value={g} checked={sex === g}
                    onChange={() => setSex(g)} style={{ display: 'none' }} />
                  {g === 'Männlich' ? '♂ Männlich' : g === 'Weiblich' ? '♀ Weiblich' : '◉ Unbekannt'}
                </label>
              ))}
            </div>
          </div>

          <div className="tp-group">
            <label className="tp-label">Altersklasse</label>
            <select className="tp-input tp-select" value={ageClass} onChange={e => setAgeClass(e.target.value)}>
              <option value="">— nicht angegeben —</option>
              <option value="Juvenile">Juvenil</option>
              <option value="Subadult">Subadult</option>
              <option value="Adult">Adult</option>
              <option value="Senior">Senior</option>
            </select>
          </div>

          <div className="tp-row">
            <div className="tp-group">
              <label className="tp-label">Körpermasse</label>
              <div className="tp-unit-wrap">
                <input className="tp-input tp-unit-input" type="number" min="0" step="0.01" placeholder="0.00"
                  value={bodyMass} onChange={e => setBodyMass(e.target.value)} />
                <span className="tp-unit">g</span>
              </div>
            </div>
            <div className="tp-group">
              <label className="tp-label">Körperlänge</label>
              <div className="tp-unit-wrap">
                <input className="tp-input tp-unit-input" type="number" min="0" step="0.1" placeholder="0.0"
                  value={bodyLen} onChange={e => setBodyLen(e.target.value)} />
                <span className="tp-unit">mm</span>
              </div>
            </div>
          </div>

          <div className="tp-actions">
            <button className="tp-btn-cancel" disabled={saving} onClick={onClose}>Abbrechen</button>
            <button className="tp-btn-save"   disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Wird gespeichert…' : '💾 Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export default function MapPage() {
  const { isSignedIn, userId } = useAuth();
  const router = useRouter();
  // isSignedIn/userId werden zusätzlich in Refs gespiegelt, damit die weiter
  // unten registrierten MapTiler-Event-Handler (map.on('click'/'load')) beim
  // Auslösen immer den aktuellen Auth-Status lesen können, ohne dass die Karte
  // bei jeder Auth-Änderung neu initialisiert werden muss (die Handler werden
  // nur einmalig beim Mounten registriert, siehe Effekt weiter unten).
  const isSignedInRef = useRef(isSignedIn);
  const userIdRef     = useRef(userId);

  useEffect(() => { isSignedInRef.current = isSignedIn; }, [isSignedIn]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance  = useRef<Map | null>(null);

  const [formOpen, setFormOpen]     = useState(false);
  const [formCoords, setFormCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [taxonomies, setTaxonomies] = useState<TaxonomyOption[]>([]);

  // Ref-Callback: map-click → React-State (kein Re-Render-Problem)
  const openFormRef = useRef<((lng: number, lat: number) => void) | null>(null);
  openFormRef.current = (lng, lat) => {
    setFormCoords({ lng, lat });
    setFormOpen(true);
  };

  // Ref-Callback: nach erfolgreichem Speichern Marker zur Karte hinzufügen
  const addMarkerRef = useRef<((name: string, sex: string, id: number, lng: number, lat: number) => void) | null>(null);

  // Taxonomien für den Formular-Select
  useEffect(() => {
    fetch(`${API}/api/taxonomy`)
      .then(r => r.ok ? r.json() : [])
      .then(setTaxonomies)
      .catch(() => {});
  }, []);

  // Initialisiert die MapTiler-Karte genau einmal (sobald der Container im DOM
  // ist und die Next.js-Route/-Query bereit ist) und registriert alle
  // Karten-Event-Handler (Klick zum Erfassen, Laden bestehender Marker aus der DB).
  // Läuft absichtlich nur bei router.isReady erneut, NICHT bei jeder Auth-Änderung,
  // damit die Karte nicht ständig neu aufgebaut wird (siehe Refs oben).
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current || !router.isReady) return;

    // MapTiler-API-Key aus den Umgebungsvariablen setzen (clientseitig verfügbar
    // dank NEXT_PUBLIC_-Präfix)
    config.apiKey = process.env.NEXT_PUBLIC_MAP_API_KEY as string;

    // Kartenposition aus optionalen Query-Parametern übernehmen (z.B. beim
    // Zurückwechseln von der Heatmap-Ansicht, siehe goToHeatmap), sonst
    // Standard-Zentrum/-Zoom (Deutschland-Mitte) verwenden.
    const qLng  = parseFloat(router.query.lng as string);
    const qLat  = parseFloat(router.query.lat as string);
    const qZoom = parseFloat(router.query.zoom as string);
    const initialCenter: [number, number] =
      !isNaN(qLng) && !isNaN(qLat) ? [qLng, qLat] : [8.0020, 50.9411];
    const initialZoom = !isNaN(qZoom) ? qZoom : 5;

    const map = new Map({
      container: mapContainer.current,
      style: MapStyle.STREETS,
      center: initialCenter,
      zoom: initialZoom,
    });
    mapInstance.current = map;

    // ── Marker-Element erstellen ─────────────────────────────────────────
    // Baut das DOM-Element für einen einzelnen Karten-Marker: zeigt ein
    // Geschlechts-Symbol (♂/♀/◉ falls unbekannt) sowie den Artnamen als Label an.
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

    // Marker nach dem Speichern setzen (via Ref aus React erreichbar)
    addMarkerRef.current = (name, sex, id, lng, lat) => {
      const el = createMarkerElement(name, sex === 'Unbekannt' ? undefined : sex);
      el.addEventListener('click', () => { window.location.href = `/tier/${id}`; });
      new Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    };

    // ── Klick auf Karte ──────────────────────────────────────────────────
    // Nicht angemeldete Nutzer erhalten stattdessen einen Hinweis-Popup mit
    // Login-Link; angemeldete Nutzer öffnen über openFormRef das Erfassungs-Panel.
    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;

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

      openFormRef.current?.(lng, lat);
    });

    // ── Vorhandene Tiere aus DB als Marker laden ─────────────────────────
    // Sobald die Karte fertig geladen ist, werden alle bereits erfassten
    // Fundorte per API abgerufen und als klickbare Marker (Link zur Detailseite
    // /tier/[id]) auf die Karte gesetzt. Angemeldete Nutzer schicken ihre
    // Clerk-User-ID mit (z.B. relevant für private/eigene Sammlungsobjekte).
    map.on('load', async () => {
      try {
        const headers: Record<string, string> = {};
        if (isSignedInRef.current && userIdRef.current) {
          headers['X-Clerk-User-Id'] = userIdRef.current;
        }
        const res = await fetch(`${API}/api/geolocations/map-items`, { headers });
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
          const label = item.itemName ?? item.locationName;
          const el    = createMarkerElement(label, item.sex ?? undefined);
          el.addEventListener('click', () => { window.location.href = `/tier/${item.itemId}`; });
          new Marker({ element: el }).setLngLat([item.longitude, item.latitude]).addTo(map);
        }
      } catch (err) {
        console.error('Marker konnten nicht geladen werden:', err);
      }
    });

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [router.isReady]);

  // Wechselt zur Heatmap-Ansicht und gibt dabei das aktuelle Kartenzentrum/-zoom
  // als Query-Parameter mit, damit die Heatmap an derselben Stelle startet statt
  // wieder beim Standard-Ausschnitt.
  const goToHeatmap = () => {
    const map = mapInstance.current;
    if (!map) { router.push('/heatmap'); return; }
    const c = map.getCenter();
    router.push(`/heatmap?lng=${c.lng}&lat=${c.lat}&zoom=${map.getZoom()}`);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <Navbar activeNav="karte" />

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        <button className="view-switch-btn" onClick={goToHeatmap} title="Zur Heatmap wechseln">
          🔥 Heatmap
        </button>

        {/* Panel ist position:fixed → bricht aus overflow:hidden des Elternelements aus */}
        {formOpen && formCoords && (
          <TierFormPanel
            taxonomies={taxonomies}
            coords={formCoords}
            userId={userId}
            onClose={() => setFormOpen(false)}
            onSaved={(name, sex, id) => {
              addMarkerRef.current?.(name, sex, id, formCoords.lng, formCoords.lat);
              setFormOpen(false);
            }}
          />
        )}

        <style jsx global>{`
          /* ── View-Switch-Button ── */
          .view-switch-btn {
            position: absolute; top: 12px; right: 56px; z-index: 500;
            display: flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,.92); border: 1px solid #dadce0;
            border-radius: 20px; padding: 7px 14px;
            font-size: 12px; font-weight: 600; color: #202124;
            font-family: 'Inter', system-ui, sans-serif; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,.18);
            transition: background .15s, transform .15s;
          }
          .view-switch-btn:hover { background: #fff; transform: translateY(-1px); }

          /* ── Marker ── */
          .custom-marker { pointer-events: auto; cursor: pointer; }
          .markerBody {
            display: flex; align-items: center; gap: 6px;
            background: #fff; border: 2px solid #0078FF;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.25);
            padding: 6px 14px; transition: transform .2s ease;
          }
          .markerBody:hover { transform: scale(1.08); }
          .markerIcon { font-size: 14px; color: #0078FF; }
          .markerText { font-weight: 600; font-size: 13px; color: #202124; font-family: sans-serif; }

          /* ── Tier-Panel (fixed overlay) ── */
          .tp-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,.4); z-index: 2000;
            display: flex; align-items: center; justify-content: center;
            padding: 16px;
          }
          .tp-panel {
            background: #fff; border-radius: 14px;
            width: min(460px, 100%);
            max-height: calc(100vh - 32px);
            display: flex; flex-direction: column;
            box-shadow: 0 12px 40px rgba(0,0,0,.25);
            font-family: 'Inter', system-ui, sans-serif;
          }
          .tp-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 20px 14px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0;
          }
          .tp-title  { font-size: 16px; font-weight: 700; color: #1a1a1a; }
          .tp-close  {
            background: none; border: none; font-size: 16px; color: #9ca3af;
            cursor: pointer; padding: 2px 6px; border-radius: 4px;
            transition: background .15s; line-height: 1;
          }
          .tp-close:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
          .tp-body   { flex: 1; overflow-y: auto; padding: 18px 20px 20px; }

          .tp-error  {
            font-size: 12px; color: #b91c1c; background: #fef2f2;
            border: 1px solid #fecaca; padding: 8px 12px;
            border-radius: 6px; margin-bottom: 14px;
          }
          .tp-group  { margin-bottom: 14px; }
          .tp-label  {
            display: block; font-size: 11px; font-weight: 600; color: #5f6368;
            text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px;
          }
          .tp-req    { color: #ea4335; }
          .tp-input  {
            width: 100%; padding: 8px 10px; border-radius: 6px;
            border: 1px solid #dadce0; font-size: 13px; color: #202124;
            background: #fff; outline: none; font-family: inherit;
            transition: border-color .2s, box-shadow .2s; box-sizing: border-box;
          }
          .tp-input:focus    { border-color: #0078FF; box-shadow: 0 0 0 3px rgba(0,120,255,.1); }
          .tp-input-err      { border-color: #ea4335 !important; box-shadow: 0 0 0 3px rgba(234,67,53,.1) !important; }
          .tp-hint           { font-size: 11px; color: #ea4335; margin-top: 3px; display: block; }
          .tp-textarea       { resize: vertical; min-height: 62px; }
          .tp-select         { cursor: pointer; }
          .tp-row            { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .tp-row .tp-group  { margin-bottom: 14px; }
          .tp-unit-wrap      { position: relative; display: flex; align-items: center; }
          .tp-unit-input     { padding-right: 30px !important; }
          .tp-unit           { position: absolute; right: 10px; font-size: 11px; color: #9aa0a6; font-weight: 500; pointer-events: none; }

          .tp-radio-group { display: flex; gap: 8px; flex-wrap: wrap; }
          .tp-radio {
            display: flex; align-items: center; gap: 5px; font-size: 12px;
            color: #202124; cursor: pointer; background: #f8f9fa;
            border: 1px solid #dadce0; border-radius: 20px; padding: 5px 12px;
            transition: all .15s; user-select: none;
          }
          .tp-radio:hover        { border-color: #0078FF; background: #e8f0fe; }
          .tp-radio-checked      { background: #e8f0fe; border-color: #0078FF; color: #0078FF; font-weight: 600; }

          .tp-actions {
            display: flex; gap: 10px; justify-content: flex-end;
            margin-top: 18px; padding-top: 14px; border-top: 1px solid #f1f3f4;
          }
          .tp-btn-cancel {
            padding: 8px 18px; border-radius: 8px; border: 1px solid #dadce0;
            background: #fff; font-size: 13px; color: #5f6368; cursor: pointer;
            font-weight: 500; font-family: inherit; transition: background .15s;
          }
          .tp-btn-cancel:hover:not(:disabled) { background: #f8f9fa; }
          .tp-btn-save {
            padding: 8px 20px; border-radius: 8px; border: none;
            background: #0078FF; color: #fff; font-size: 13px; font-weight: 600;
            cursor: pointer; font-family: inherit; transition: background .15s;
          }
          .tp-btn-save:hover:not(:disabled) { background: #0060cc; }
          .tp-btn-cancel:disabled,
          .tp-btn-save:disabled { opacity: .6; cursor: not-allowed; }
        `}</style>
      </main>
    </div>
  );
}
