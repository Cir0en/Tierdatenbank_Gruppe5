// Route /karte: interaktive Karten-Ansicht (MapTiler) zur Erfassung und Anzeige
// von Fundorten. Angemeldete Nutzer können per Klick auf die Karte ein neues Tier
// mit Koordinaten anlegen (TierFormPanel); alle Besucher sehen bereits erfasste
// Tiere als Marker. Bietet außerdem einen Wechsel zur Heatmap-Ansicht (pages/heatmap.tsx).
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Map, MapStyle, config, Marker, Popup } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import Navbar from '../components/Navbar';
import { useAuth } from '@clerk/nextjs';
import { useTaxonomyFilter, TaxonomyFilterControl } from '../components/TaxonomyFilter';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const SELTENHEIT_OPTIONS = ['Häufig','Selten','Sehr selten','Ungefährdet','Wichtig','Geschützt','Stark gefährdet'];

interface CollectionOption { id: number; name: string; isPublic: boolean; }

// GBIF-Taxonomie-Abgleich (Global Biodiversity Information Facility): entweder
// ein eindeutiger Treffer (match_found) oder eine Liste von Vorschlägen, die
// der Nutzer manuell bestätigen muss.
interface GbifTaxonomy {
  reich: string; stamm: string; klasse: string;
  ordnung: string; familie: string; gattung: string; art: string;
}
interface GbifMatchResult {
  status: 'match_found';
  source?: 'gbif' | 'local';
  usageKey?: number;
  taxonomyId?: number;
  confidence?: number;
  canonicalName: string;
  taxonomy: GbifTaxonomy;
}
interface GbifSuggestion {
  source?: 'gbif' | 'local';
  usageKey?: number;
  taxonomyId?: number;
  scientificName?: string;
  canonicalName?: string;
  rank?: string;
}
interface GbifNeedsConfirmation {
  status: 'needs_confirmation';
  suggestions: GbifSuggestion[];
}
type GbifResult = GbifMatchResult | GbifNeedsConfirmation;

interface MapItem {
  itemId: number;
  itemName: string | null;
  locationName: string;
  latitude: number;
  longitude: number;
  sex: string | null;
  canDelete: boolean;
  // Verknüpfte Taxonomie (aus /api/geolocations/map-items) — Basis für den Taxonomie-Filter.
  taxonomyId: number | null;
}

// ── Tier-Erfassungs-Panel (fixed overlay – immer vollständig sichtbar) ─────────

// Formular-Panel, das sich öffnet, wenn ein angemeldeter Nutzer auf die Karte
// klickt. Erfasst die Tierdaten (Name, Taxonomie, Maße, ...) für die zuvor per
// Klick ermittelten Koordinaten (coords) und legt bei Bestätigung einen neuen
// Datensatz über die Animals-API an. Lädt außerdem die eigenen (Owner-)Sammlungen
// des Nutzers nach, damit das neue Tier optional direkt einer Sammlung zugeordnet
// werden kann. Die Felder entsprechen exakt dem Formular zum Hinzufügen eines
// Tiers zu einer Sammlung (AddAnimalModal in Sammlung.tsx), inkl. GBIF-Workflow.
function TierFormPanel({ coords, locationName, userId, onClose, onSaved }: {
  coords: { lng: number; lat: number };
  locationName: string | null;
  userId: string | null | undefined;
  onClose: () => void;
  onSaved: (name: string, sex: string, id: number, locationName: string, taxonomyId: number | null) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [seltenheit, setSeltenheit] = useState('');
  const [lebensraum, setLebensraum] = useState('');
  const [findDate, setFindDate]     = useState('');
  const [taxonomyId, setTaxonomyId] = useState<number | null>(null);
  const [collectionId, setCollectionId] = useState('');
  const [sex, setSex]               = useState('Unbekannt');
  const [ageClass, setAgeClass]     = useState('');
  const [bodyMass, setBodyMass]     = useState('');
  const [bodyLen, setBodyLen]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [nameErr, setNameErr]       = useState(false);
  const [collectionErr, setCollectionErr] = useState(false);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const fallbackLocationName = `Naturstandort (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`;
  const [locationNameInput, setLocationNameInput] = useState(locationName ?? fallbackLocationName);

  const [collectionsLoaded, setCollectionsLoaded] = useState(false);

  const [gbifResult, setGbifResult]       = useState<GbifResult | null>(null);
  const [gbifLoading, setGbifLoading]     = useState(false);
  const [gbifError, setGbifError]         = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [confirming, setConfirming]       = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/api/collections`, { headers: { 'X-Clerk-User-Id': userId } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) =>
        setCollections(data.filter(c => c.isOwner).map(c => ({ id: c.id, name: c.name, isPublic: c.isPublic })))
      )
      .catch(() => {})
      .finally(() => setCollectionsLoaded(true));
  }, [userId]);

  // Setzt den kompletten GBIF-Zustand zurück (z. B. wenn der Artname geändert
  // wird und ein vorheriger Treffer/Vorschlag damit ungültig wird).
  const resetGbif = () => {
    setGbifResult(null);
    setConfirmedName(null);
    setTaxonomyId(null);
    setGbifError(null);
  };

  // Fragt die GBIF-Taxonomie-API mit dem eingegebenen Artnamen ab. Ergebnis ist
  // entweder ein eindeutiger Treffer oder eine Liste von Vorschlägen (siehe GbifResult).
  const handleGbifSearch = async () => {
    if (!name.trim()) return;
    setGbifLoading(true);
    resetGbif();
    try {
      const res = await fetch(`${API}/api/taxonomy/gbif?speciesName=${encodeURIComponent(name.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGbifResult(await res.json());
    } catch (e: any) {
      setGbifError('GBIF-Suche fehlgeschlagen: ' + e.message);
    } finally {
      setGbifLoading(false);
    }
  };

  // Bestätigt einen GBIF-Treffer/-Vorschlag (per usageKey): das Backend legt
  // dafür ggf. einen Taxonomie-Datensatz an/findet ihn und liefert dessen id
  // zurück, die anschließend beim Speichern des Tiers mitgeschickt wird.
  const handleGbifConfirm = async (usageKey: number, displayName: string) => {
    setConfirming(true);
    setGbifError(null);
    try {
      const res = await fetch(`${API}/api/taxonomy/gbif/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageKey }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTaxonomyId(data.taxonomyId);
      setConfirmedName(displayName);
      setGbifResult(null);
    } catch (e: any) {
      setGbifError('Bestätigung fehlgeschlagen: ' + e.message);
    } finally {
      setConfirming(false);
    }
  };

  // Übernimmt einen lokalen Treffer/Vorschlag direkt: der Taxonomie-Eintrag existiert
  // bereits in der Datenbank (manuell eingereicht und freigegeben), daher ist anders als
  // bei GBIF-Treffern kein Bestätigungs-Request nötig.
  const selectLocalTaxonomy = (id: number, displayName: string) => {
    setTaxonomyId(id);
    setConfirmedName(displayName);
    setGbifResult(null);
  };

  // Validiert minimal (Name erforderlich) und legt das neue Tier inkl.
  // Koordinaten per POST an. Bei Erfolg wird onSaved() aufgerufen, damit die
  // Elternkomponente (MapPage) direkt einen Marker an der geklickten Position
  // ergänzen kann, ohne die komplette Marker-Liste neu laden zu müssen.
  const handleSave = async () => {
    // Name UND Sammlung sind Pflicht: ein Tier muss immer einer eigenen Sammlung
    // zugeordnet werden (ohne Sammlung kann kein Eintrag gespeichert werden).
    let invalid = false;
    if (!displayName.trim()) { setNameErr(true); invalid = true; }
    if (!collectionId)       { setCollectionErr(true); invalid = true; }
    if (invalid) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/animals/map`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          // Clerk-User-Id mitschicken, damit das Backend die Sammlungs-Eigentümerschaft
          // prüfen und den Ersteller (CreatedByUserId) setzen kann.
          ...(userId ? { 'X-Clerk-User-Id': userId } : {}),
        },
        body: JSON.stringify({
          name:         displayName.trim(),
          sex:          sex === 'Unbekannt' ? null : sex,
          ageClass:     ageClass || null,
          bodyMassGram: bodyMass ? parseFloat(bodyMass) : null,
          bodyLengthMm: bodyLen  ? parseFloat(bodyLen)  : null,
          latitude:     coords.lat,
          longitude:    coords.lng,
          locationName: locationNameInput.trim() || fallbackLocationName,
          description:  description.trim() || null,
          status:       seltenheit || null,
          lebensraum:   lebensraum.trim() || null,
          findDate:     findDate || null,
          taxonomyId:   taxonomyId,
          collectionId: parseInt(collectionId),
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      const saved = await res.json();
      onSaved(displayName.trim(), sex, saved.id, locationNameInput.trim() || fallbackLocationName, taxonomyId);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const matchResult  = gbifResult?.status === 'match_found'        ? gbifResult as GbifMatchResult       : null;
  const needsConfirm = gbifResult?.status === 'needs_confirmation'  ? gbifResult as GbifNeedsConfirmation : null;

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
            <label className="tp-label">Name <span className="tp-req">*</span></label>
            <input
              className={`tp-input${nameErr ? ' tp-input-err' : ''}`}
              type="text" autoFocus placeholder="z. B. Fund Nr. 3, Waldrand-Käfer"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setNameErr(false); }}
            />
            {nameErr && <span className="tp-hint">Bitte einen Namen eingeben.</span>}
          </div>

          {/* Artname + GBIF-Suche (nur für die Taxonomie-Zuordnung, unabhängig vom Namen oben) */}
          <div className="tp-group">
            <label className="tp-label">Artname (Taxonomie-Suche)</label>
            <div className="tp-gbif-search-row">
              <input type="text" className="tp-input"
                placeholder="z. B. Parnassius apollo"
                value={name}
                onChange={e => { setName(e.target.value); resetGbif(); }}
                onKeyDown={e => { if (e.key === 'Enter') handleGbifSearch(); }} />
              <button type="button" className="tp-btn-gbif-search"
                onClick={handleGbifSearch}
                disabled={!name.trim() || gbifLoading || saving}>
                {gbifLoading ? '⏳' : '🔍 Suchen'}
              </button>
            </div>
            <div className="tp-gbif-hint">Wissenschaftlichen Artnamen eingeben und Suchen klicken, um die Taxonomie automatisch zuzuordnen.</div>
          </div>

          {gbifError && <div className="tp-error">{gbifError}</div>}

          {/* Bestätigte Taxonomie */}
          {confirmedName && (
            <div className="tp-gbif-confirmed">
              <span>✓ Taxonomie: <em>{confirmedName}</em></span>
              <button type="button" onClick={resetGbif} title="Zurücksetzen">✕</button>
            </div>
          )}

          {/* GBIF/lokaler Treffer */}
          {matchResult && (
            <div className="tp-gbif-preview">
              <div className="tp-gbif-preview-title">
                {matchResult.source === 'local'
                  ? 'Bereits in der Datenbank vorhanden'
                  : `GBIF-Treffer — ${matchResult.confidence}% Übereinstimmung`}
              </div>
              <div className="tp-gbif-chain">
                {(Object.entries(matchResult.taxonomy) as [string, string][]).map(([rank, val], i, arr) => (
                  <span key={rank} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="tp-gbif-chain-item">
                      <span className="tp-gbif-rank">{rank}</span>
                      <span className="tp-gbif-val">{val}</span>
                    </span>
                    {i < arr.length - 1 && <span className="tp-gbif-arrow">›</span>}
                  </span>
                ))}
              </div>
              <button type="button" className="tp-btn-gbif-accept" disabled={confirming}
                onClick={() => matchResult.source === 'local' && matchResult.taxonomyId
                  ? selectLocalTaxonomy(matchResult.taxonomyId, matchResult.canonicalName)
                  : handleGbifConfirm(matchResult.usageKey!, matchResult.canonicalName)}>
                {confirming ? '⏳ Wird gespeichert…' : '✓ Taxonomie übernehmen'}
              </button>
            </div>
          )}

          {/* GBIF/lokale Vorschläge */}
          {needsConfirm && (
            <div className="tp-gbif-preview tp-gbif-preview--warn">
              <div className="tp-gbif-preview-title">Keine exakte Übereinstimmung gefunden</div>
              {needsConfirm.suggestions.filter(s => s.usageKey || s.taxonomyId).length > 0 ? (
                <>
                  <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>Meintest du eine dieser Arten?</div>
                  {needsConfirm.suggestions.filter(s => s.usageKey || s.taxonomyId).map((s, i) => (
                    <button key={i} type="button" className="tp-btn-gbif-suggestion" disabled={confirming}
                      onClick={() => s.source === 'local' && s.taxonomyId
                        ? selectLocalTaxonomy(s.taxonomyId, s.canonicalName ?? s.scientificName ?? 'Unbekannt')
                        : handleGbifConfirm(s.usageKey!, s.canonicalName ?? s.scientificName ?? 'Unbekannt')}>
                      <em>{s.canonicalName ?? s.scientificName}</em>
                      {s.rank && <span className="tp-gbif-rank"> [{s.rank}]</span>}
                      {s.source === 'local' && <span className="tp-gbif-rank"> · lokal</span>}
                    </button>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Keine Vorschläge gefunden.</div>
              )}
            </div>
          )}

          <div className="tp-group">
            <label className="tp-label">Fundort</label>
            <input
              className="tp-input"
              type="text"
              value={locationNameInput}
              onChange={e => setLocationNameInput(e.target.value)}
              placeholder="z. B. Buchenwald oberhalb der Siegquelle"
            />
            <span className="tp-hint">
              Automatisch aus den Koordinaten vorgeschlagen. Du kannst den Fundort anpassen.
            </span>
          </div>

          <div className="tp-group">
            <label className="tp-label">Beschreibung</label>
            <textarea className="tp-input tp-textarea" placeholder="Kurze Beschreibung…"
              value={description} onChange={e => setDesc(e.target.value)} />
          </div>

          <div className="tp-group">
            <label className="tp-label">Seltenheit</label>
            <select className="tp-input tp-select" value={seltenheit} onChange={e => setSeltenheit(e.target.value)}>
              <option value="">— nicht angegeben —</option>
              {SELTENHEIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="tp-row">
            <div className="tp-group">
              <label className="tp-label">Lebensraum</label>
              <input className="tp-input" type="text" placeholder="z. B. Alpine Wiesen, Berghänge"
                value={lebensraum} onChange={e => setLebensraum(e.target.value)} />
            </div>
            <div className="tp-group">
              <label className="tp-label">Funddatum</label>
              <input className="tp-input" type="date" value={findDate} onChange={e => setFindDate(e.target.value)} />
            </div>
          </div>

          {/* Sammlung ist Pflicht: jedes Tier muss einer eigenen Sammlung zugeordnet werden.
              Hat der Nutzer noch keine Sammlung, wird ein Hinweis mit Link zum Anlegen gezeigt
              und das Speichern ist nicht möglich (siehe handleSave + deaktivierter Save-Button). */}
          <div className="tp-group">
            <label className="tp-label">Sammlung <span className="tp-req">*</span></label>
            {collections.length > 0 ? (
              <>
                <select
                  className={`tp-input tp-select${collectionErr ? ' tp-input-err' : ''}`}
                  value={collectionId}
                  onChange={e => { setCollectionId(e.target.value); setCollectionErr(false); }}
                >
                  <option value="">— bitte auswählen —</option>
                  {collections.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.isPublic ? '🌐' : '🔒'} {c.name}
                    </option>
                  ))}
                </select>
                {collectionErr && <span className="tp-hint">Bitte eine Sammlung auswählen.</span>}
              </>
            ) : collectionsLoaded ? (
              <div className="tp-no-collection">
                Du hast noch keine eigene Sammlung. Lege zuerst eine Sammlung an, um ein Tier speichern zu können.
                <a href="/Sammlung" className="tp-no-collection-link">→ Zu meinen Sammlungen</a>
              </div>
            ) : (
              <div className="tp-gbif-hint">Sammlungen werden geladen…</div>
            )}
          </div>

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
              <option value="Juvenil">Juvenil</option>
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
            <button
              className="tp-btn-save"
              disabled={saving || collections.length === 0}
              title={collections.length === 0 ? 'Ohne eigene Sammlung kann kein Tier gespeichert werden.' : undefined}
              onClick={handleSave}
            >
              {saving ? '⏳ Wird gespeichert…' : '💾 Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hilfsfunktion für Reverse Geocoding  ────────────────────────────────────────────────────────────────

// Neue Version für Reverse Geocoding, die Entfernung und Fallback berücksichtigt:
// Warum? Weil die MapTiler-Geocoding-API manchmal einen Ort liefert,
// der weit entfernt von den tatsächlichen Koordinaten liegt (z. B. wenn Fundort
// in einem Waldgebiet ist, das keine genaue Adresse hat),
// und wir möchten, dass die Anzeige in diesem Fall
// "In der Nähe von ..." oder "Naturstandort bei ..." anzeigt,
// statt eine ungenaue Adresse zu verwenden.

interface ReverseGeocodeResult {
  locationName: string;
  distanceMeters: number | null;
  isPrecise: boolean;
}

// Berechnung der Distanz mit der Haversine-Formel
function distanceMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const earthRadius = 6371000;
  const toRad = (v: number) => v * Math.PI / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) *
    Math.cos(toRad(bLat)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function reverseGeocode(lng: number, lat: number): Promise<ReverseGeocodeResult> {
  const key = process.env.NEXT_PUBLIC_MAP_API_KEY;
  const roundedLng = lng.toFixed(6);
  const roundedLat = lat.toFixed(6);
  const url =
    `https://api.maptiler.com/geocoding/${roundedLng},${roundedLat}.json` +
    `?key=${key}&language=de`;

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    console.error('MapTiler Reverse Geocoding Fehler:', res.status, errorText);
    throw new Error('Adresse konnte nicht ermittelt werden');
  }

  const data = await res.json();
  const features = data.features ?? [];

  console.log(features.map((f: any) => ({
  id: f.id,
  text: f.text_de ?? f.text,
  placeName: f.place_name_de ?? f.place_name,
  placeType: f.place_type,
  center: f.center,
})));

  if (features.length === 0) {
    return {
      locationName: `Naturstandort (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      distanceMeters: null,
      isPrecise: false,
    };
  }

  const best = features[0];
  const [foundLng, foundLat] = best.center ?? [lng, lat];
  const distance = distanceMeters(lng, lat, foundLng, foundLat);

  const placeName =
    best.place_name_de ??
    best.place_name ??
    best.text_de ??
    best.text ??
    'unbekannter Ort';

  if (distance <= 100) {
    return {
      locationName: placeName,
      distanceMeters: distance,
      isPrecise: true,
    };
  }

  if (distance <= 500) {
    return {
      locationName: `In der Nähe von ${placeName}`,
      distanceMeters: distance,
      isPrecise: false,
    };
  }

  const shortPlace =
    best.text_de ??
    best.text ??
    placeName;

  return {
    locationName: `Naturstandort bei ${shortPlace} (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
    distanceMeters: distance,
    isPrecise: false,
  };
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
  // Marker-Instanzen nach Item-ID, damit die Suche beim Treffer das passende
  // Popup öffnen kann statt nur zur Position zu springen.
  const markersRef   = useRef<globalThis.Map<number, Marker>>(new globalThis.Map());

  const [formOpen, setFormOpen]     = useState(false);
  const [formCoords, setFormCoords] = useState<{ lng: number; lat: number } | null>(null);

  // ── Suche ─────────────────────────────────────────────────────────────
  // Alle geladenen Marker-Items werden hier gespiegelt, damit rein clientseitig
  // (ohne zusätzlichen API-Call) nach Artname/Fundort gefiltert werden kann.
  const [items, setItems]           = useState<MapItem[]>([]);
  const [search, setSearch]         = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [formLocationName, setFormLocationName] = useState<string | null>(null);
  const [geoResults, setGeoResults] = useState<any[]>([]);

  // Wiederverwendbarer Taxonomie-Filter (geteiltes Modul mit der Heatmap-Ansicht).
  // Eine per URL (?tax=) übergebene Vorauswahl bleibt so beim Wechsel Heatmap→Karte erhalten.
  const taxParam = router.query.tax;
  const initialTax = typeof taxParam === 'string' && taxParam !== '' && Number.isFinite(Number(taxParam))
    ? Number(taxParam) : null;
  const taxFilter = useTaxonomyFilter(items, initialTax);
  // Anzahl aktuell (nach Filter) sichtbarer Marker — informativ im Dropdown.
  const visibleCount = useMemo(
    () => items.filter(it => taxFilter.matches(it.taxonomyId)).length,
    [items, taxFilter.matches]
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items
      // Die Suche berücksichtigt denselben Taxonomie-Filter wie die Karte, damit
      // Treffer und sichtbare Marker konsistent bleiben.
      .filter(it => taxFilter.matches(it.taxonomyId))
      .filter(it => (it.itemName ?? '').toLowerCase().includes(q) || it.locationName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, items, taxFilter.matches]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) { setGeoResults([]); return; }

    const timeout = setTimeout(async () => {
      try {
        const key = process.env.NEXT_PUBLIC_MAP_API_KEY;
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}&language=de&limit=5&autocomplete=true`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setGeoResults(data.features ?? []);
      }
      catch {
        setGeoResults([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  // Springt zur Position eines Suchtreffers und öffnet dessen Popup.
  const flyToItem = (it: MapItem) => {
    const map = mapInstance.current;
    if (!map) return;
    map.flyTo({ center: [it.longitude, it.latitude], zoom: 14 });
    openItemPopupRef.current?.(it);
    setSearch('');
    setSearchOpen(false);
  };

  const flyToGeoResult = (res: any) => {
    const map = mapInstance.current;
    if (!map || !res.center) return;

    const [lng, lat] = res.center;
    map.flyTo({ center: [lng, lat], zoom: 14 });
    setSearch('');
    setSearchOpen(false);
  }


  // Ref-Callback: map-click → React-State (kein Re-Render-Problem)
  const openFormRef = useRef<((lng: number, lat: number) => void) | null>(null);
  openFormRef.current = (lng, lat) => {
    setFormCoords({ lng, lat });
    setFormOpen(true);
  };

  // Ref-Callback: öffnet das Marker-Popup (siehe openItemPopup im Karten-Effekt weiter
  // unten) auch aus Handlern außerhalb dieses Effekts heraus (z.B. flyToItem bei der Suche).
  const openItemPopupRef = useRef<((item: MapItem) => void) | null>(null);

  // Ref-Callback: nach erfolgreichem Speichern Marker zur Karte hinzufügen
  const addMarkerRef = useRef < ((name: string,
    sex: string, id: number,
    lng: number, lat: number, locationName: string, taxonomyId: number | null) => void) | null>(null);

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

    // Öffnet bei Klick auf einen Marker ein Popup mit Detail-Link und, falls der
    // aktuelle Nutzer berechtigt ist (Ersteller oder Admin/Moderator, siehe
    // GeoMapItemDto.CanDelete), einem Löschen-Button. Ersetzt die frühere direkte
    // Navigation, damit überhaupt eine Möglichkeit zum Löschen besteht.
    const openItemPopup = (item: MapItem) => {
      const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: '240px' })
        .setLngLat([item.longitude, item.latitude])
        .setHTML(`
          <div style="padding:10px 12px;font-family:sans-serif;font-size:13px;">
            <div style="font-weight:600;margin-bottom:4px;">${item.itemName ?? item.locationName}</div>
            <div style="color:#5f6368;font-size:11px;margin-bottom:10px;">${item.locationName}</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <a href="/tier/${item.itemId}" style="color:#0078FF;font-size:12px;font-weight:600;text-decoration:none;">Details ansehen →</a>
              ${item.canDelete ? `<button type="button" data-delete-item="${item.itemId}" style="margin-left:auto;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;">🗑 Löschen</button>` : ''}
            </div>
          </div>
        `)
        .addTo(map);

      if (item.canDelete) {
        const btn = popup.getElement()?.querySelector<HTMLButtonElement>(`[data-delete-item="${item.itemId}"]`);
        btn?.addEventListener('click', async () => {
          if (!confirm(`„${item.itemName ?? `Eintrag #${item.itemId}`}" wirklich löschen?`)) return;
          btn.disabled = true;
          btn.textContent = '⏳';
          try {
            const res = await fetch(`${API}/api/animals/${item.itemId}`, {
              method: 'DELETE',
              headers: userIdRef.current ? { 'X-Clerk-User-Id': userIdRef.current } : {},
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            markersRef.current.get(item.itemId)?.remove();
            markersRef.current.delete(item.itemId);
            setItems(prev => prev.filter(it => it.itemId !== item.itemId));
            popup.remove();
          } catch {
            alert('Löschen fehlgeschlagen. Bitte versuche es erneut.');
            btn.disabled = false;
            btn.textContent = '🗑 Löschen';
          }
        });
      }
    };
    openItemPopupRef.current = openItemPopup;

    // Marker nach dem Speichern setzen (via Ref aus React erreichbar)
    addMarkerRef.current = (name, sex, id, lng, lat, locationName, taxonomyId) => {
      const el = createMarkerElement(name, sex === 'Unbekannt' ? undefined : sex);
      // Selbst angelegte Objekte darf man auch gleich wieder löschen.
      const newItem: MapItem = { itemId: id, itemName: name, locationName, latitude: lat, longitude: lng, sex: sex === 'Unbekannt' ? null : sex, canDelete: true, taxonomyId: taxonomyId ?? null };
      // stopPropagation verhindert, dass der Klick zusätzlich den Karten-eigenen
      // click-Handler auslöst (der sonst das "Tier erfassen"-Formular als
      // Vollbild-Overlay über dem Popup öffnen würde).
      el.addEventListener('click', (e) => { e.stopPropagation(); openItemPopup(newItem); });
      const marker = new Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      markersRef.current.set(id, marker);
      setItems(prev => [
        ...prev,
        newItem,
      ]);
    };

    // ── Klick auf Karte ──────────────────────────────────────────────────
    // Nicht angemeldete Nutzer erhalten stattdessen einen Hinweis-Popup mit
    // Login-Link; angemeldete Nutzer öffnen über openFormRef das Erfassungs-Panel.
    map.on('click', async (e) => {
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

// reverseGeocode liefert jetzt ein Objekt 
      try {
        const result = await reverseGeocode(lng, lat);
        setFormLocationName(result.locationName);
      } catch (err) {
        console.error('Reverse Geocoding fehlgeschlagen:', err);
        setFormLocationName(`Naturstandort (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
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

        const items: MapItem[] = await res.json();

        for (const item of items) {
          const label = item.itemName ?? item.locationName;
          const el    = createMarkerElement(label, item.sex ?? undefined);
          el.addEventListener('click', (e) => { e.stopPropagation(); openItemPopup(item); });
          const marker = new Marker({ element: el }).setLngLat([item.longitude, item.latitude]).addTo(map);
          markersRef.current.set(item.itemId, marker);
        }
        setItems(items);
      } catch (err) {
        console.error('Marker konnten nicht geladen werden:', err);
      }
    });

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [router.isReady]);

  // Blendet Marker beim Wechsel des Taxonomie-Filters (oder bei neuen/gelöschten
  // Items) ein bzw. aus, ohne die Marker neu erzeugen zu müssen: passende Marker
  // werden zur Karte hinzugefügt, nicht passende entfernt.
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    for (const it of items) {
      const marker = markersRef.current.get(it.itemId);
      if (!marker) continue;
      if (taxFilter.matches(it.taxonomyId)) marker.addTo(map);
      else marker.remove();
    }
  }, [items, taxFilter.matches]);

  // Wechselt zur Heatmap-Ansicht und gibt dabei das aktuelle Kartenzentrum/-zoom
  // als Query-Parameter mit, damit die Heatmap an derselben Stelle startet statt
  // wieder beim Standard-Ausschnitt.
  const goToHeatmap = () => {
    // Aktiven Taxonomie-Filter mitnehmen, damit er auf der Heatmap erhalten bleibt.
    const tax = taxFilter.selectedId != null ? `&tax=${taxFilter.selectedId}` : '';
    const map = mapInstance.current;
    if (!map) { router.push(`/heatmap${tax ? `?${tax.slice(1)}` : ''}`); return; }
    const c = map.getCenter();
    router.push(`/heatmap?lng=${c.lng}&lat=${c.lat}&zoom=${map.getZoom()}${tax}`);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <Navbar activeNav="karte" />

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        <div className="map-search-wrap">
          <span className="map-search-icon">🔍</span>
          <input
            type="text"
            className="map-search-input"
            placeholder="Tier oder Fundort suchen…"
            value={search}
            onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          />
          {search && (
            <button
              className="map-search-clear"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setSearch(''); setSearchOpen(false); }}
              title="Suche löschen"
            >
              ✕
            </button>
          )}

          {searchOpen && search.trim() !== '' && (
            <div className="map-search-results" onMouseDown={e => e.preventDefault()}>
              {searchResults.length === 0 && geoResults.length === 0 ? (
                <div className="map-search-empty">Keine Treffer für „{search}“</div>
              ) : (
                 <>
                  {searchResults.map(it => (
                    <div
                      key={`item-${it.itemId}`}
                      className="map-search-result"
                      onClick={() => flyToItem(it)}
                    >
                      <span className="map-search-result-icon">
                        {it.sex === 'Männlich' ? '♂' : it.sex === 'Weiblich' ? '♀' : '◉'}
                      </span>

                      <div className="map-search-result-text">
                        <div className="map-search-result-name">
                          {it.itemName ?? it.locationName}
                        </div>
                        <div className="map-search-result-loc">
                          {it.locationName}
                        </div>
                      </div>
                    </div>
                  ))}

                  {geoResults.map(feature => (
                    <div
                      key={`geo-${feature.id}`}
                      className="map-search-result"
                      onClick={() => flyToGeoResult(feature)}
                    >
                      <span className="map-search-result-icon">⌖</span>

                      <div className="map-search-result-text">
                        <div className="map-search-result-name">
                          {feature.text_de ?? feature.text ?? 'Ort'}
                        </div>
                        <div className="map-search-result-loc">
                          {feature.place_name_de ?? feature.place_name ?? ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Taxonomie-Filter (geteiltes Modul, auch in der Heatmap genutzt) */}
        <div className="map-taxfilter">
          <TaxonomyFilterControl
            options={taxFilter.options}
            selectedId={taxFilter.selectedId}
            onChange={taxFilter.setSelectedId}
            count={visibleCount}
          />
        </div>

        <button className="view-switch-btn" onClick={goToHeatmap} title="Zur Heatmap wechseln">
          🔥 Heatmap
        </button>

        {/* Panel ist position:fixed → bricht aus overflow:hidden des Elternelements aus */}
        {formOpen && formCoords && (
          <TierFormPanel
            coords={formCoords}
            locationName={formLocationName}
            userId={userId}
            onClose={() => setFormOpen(false)}
            onSaved={(name, sex, id, locationName, taxonomyId) => {
              addMarkerRef.current?.(name, sex, id, formCoords.lng, formCoords.lat, locationName, taxonomyId);
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

          /* ── Taxonomie-Filter (rechts neben der Suchleiste, damit er die
                Suche und deren Trefferliste nicht verdeckt) ── */
          .map-taxfilter {
            position: absolute; top: 12px; z-index: 500;
            /* Suche: left 12px + Inhalt min(300px, 100vw-24px) + 30px Padding/Rahmen + 12px Abstand */
            left: calc(54px + min(300px, calc(100vw - 24px)));
          }

          /* ── Karten-Suche ── */
          .map-search-wrap {
            position: absolute; top: 12px; left: 12px; z-index: 500;
            display: flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,.95); border: 1px solid #dadce0;
            border-radius: 20px; padding: 8px 14px;
            font-family: 'Inter', system-ui, sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,.18);
            width: min(300px, calc(100vw - 24px));
          }
          .map-search-icon  { font-size: 13px; color: #5f6368; flex-shrink: 0; }
          .map-search-input {
            border: none; outline: none; background: transparent;
            font-size: 13px; color: #202124; flex: 1; min-width: 0;
            font-family: inherit;
          }
          .map-search-clear {
            border: none; background: none; cursor: pointer; color: #9aa0a6;
            font-size: 12px; padding: 2px 4px; line-height: 1; flex-shrink: 0;
          }
          .map-search-clear:hover { color: #5f6368; }
          .map-search-results {
            position: absolute; top: calc(100% + 6px); left: 0; width: 100%;
            max-height: 320px; overflow-y: auto;
            background: #fff; border-radius: 10px; border: 1px solid #dadce0;
            box-shadow: 0 8px 24px rgba(0,0,0,.18);
          }
          .map-search-empty { padding: 12px 14px; font-size: 12px; color: #9aa0a6; }
          .map-search-result {
            display: flex; align-items: center; gap: 10px; padding: 9px 14px;
            cursor: pointer; transition: background .15s;
          }
          .map-search-result:hover      { background: #f1f5ff; }
          .map-search-result-icon       { font-size: 14px; color: #0078FF; flex-shrink: 0; }
          .map-search-result-text       { min-width: 0; }
          .map-search-result-name       { font-size: 13px; font-weight: 600; color: #202124; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .map-search-result-loc        { font-size: 11px; color: #9aa0a6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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

          .tp-gbif-search-row { display: flex; gap: 8px; }
          .tp-gbif-search-row .tp-input { flex: 1; }
          .tp-gbif-hint { font-size: 11px; color: #9ca3af; margin-top: 5px; }

          .tp-no-collection {
            font-size: 12px; color: #92400e; background: #fffbeb;
            border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px;
            display: flex; flex-direction: column; gap: 8px;
          }
          .tp-no-collection-link {
            align-self: flex-start; font-size: 12px; font-weight: 600;
            color: #0078FF; text-decoration: none;
          }
          .tp-no-collection-link:hover { text-decoration: underline; }

          .tp-btn-gbif-search {
            white-space: nowrap; padding: 8px 14px; background: #eff6ff;
            border: 1px solid #bfdbfe; border-radius: 6px;
            font-size: 12px; font-weight: 600; color: #1d4ed8;
            cursor: pointer; font-family: inherit; transition: all .15s;
          }
          .tp-btn-gbif-search:hover:not(:disabled) { background: #dbeafe; }
          .tp-btn-gbif-search:disabled { opacity: .5; cursor: not-allowed; }

          .tp-gbif-preview {
            background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 10px;
            padding: 14px; margin-bottom: 14px;
          }
          .tp-gbif-preview--warn { background: #fffbeb; border-color: #fde68a; }
          .tp-gbif-preview-title { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 10px; }

          .tp-gbif-chain {
            display: flex; flex-wrap: wrap; align-items: center;
            gap: 4px; margin-bottom: 12px;
          }
          .tp-gbif-chain-item {
            display: flex; flex-direction: column; align-items: center;
            background: #fff; border: 1px solid #d1fae5; border-radius: 6px;
            padding: 4px 8px; min-width: 56px;
          }
          .tp-gbif-rank  { font-size: 9px; color: #9ca3af; text-transform: capitalize; }
          .tp-gbif-val   { font-size: 11px; font-weight: 700; color: #1a1a1a; }
          .tp-gbif-arrow { font-size: 14px; color: #9ca3af; line-height: 1; }

          .tp-btn-gbif-accept {
            padding: 7px 16px; background: #0078FF; color: #fff; border: none;
            border-radius: 7px; font-size: 12px; font-weight: 600;
            cursor: pointer; font-family: inherit; transition: background .15s;
          }
          .tp-btn-gbif-accept:hover:not(:disabled) { background: #0060cc; }
          .tp-btn-gbif-accept:disabled { opacity: .5; cursor: not-allowed; }

          .tp-btn-gbif-suggestion {
            display: block; width: 100%; text-align: left; margin-bottom: 6px;
            padding: 8px 12px; background: #fff; border: 1px solid #fde68a;
            border-radius: 8px; font-size: 12px; cursor: pointer;
            font-family: inherit; transition: all .15s;
          }
          .tp-btn-gbif-suggestion:hover:not(:disabled) { background: #fffbeb; border-color: #f59e0b; }
          .tp-btn-gbif-suggestion:disabled { opacity: .5; cursor: not-allowed; }

          .tp-gbif-confirmed {
            display: flex; align-items: center; gap: 8px; justify-content: space-between;
            background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px;
            padding: 10px 14px; margin-bottom: 14px;
            font-size: 13px; color: #065f46; font-weight: 500;
          }
          .tp-gbif-confirmed button {
            background: none; border: none; cursor: pointer;
            font-size: 14px; color: #9ca3af; padding: 0 4px; line-height: 1;
          }
          .tp-gbif-confirmed button:hover { color: #374151; }

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
