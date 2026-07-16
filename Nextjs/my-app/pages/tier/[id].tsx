// Route /tier/[id]: Detailseite für ein einzelnes Sammlungsobjekt (Tier).
// Zeigt Stammdaten (Taxonomie, Fundort, Maße, Status/Seltenheit etc.) sowie ein
// zugehöriges Foto an und erlaubt das Hochladen/Ersetzen/Löschen dieses Fotos.
// Die Tier-ID kommt aus dem dynamischen Next.js-Routenparameter `id`.
'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import Navbar from '../../components/Navbar';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';


function resolveImageUrl(imageUrl: string): string {
  if (
    imageUrl.startsWith('/api/') ||
    imageUrl.startsWith('/uploads/')
  ) {
    return `${API}${imageUrl}`;
  }

  return imageUrl;
}

interface AnimalDetail {
  id: number;
  collectionId: number | null;
  taxonomyId: number | null;
  name: string | null;
  findDate: string | null;
  description: string | null;
  storageInfo: string | null;
  createdAt: string | null;
  status: string | null;
  sex: string | null;
  ageClass: string | null;
  lebensraum: string | null;
  bodyMassGram: number | null;
  bodyLengthMm: number | null;
  taxonomy: { id: number; name: string; rank: string | null } | null;
  collection: { id: number; name: string } | null;
  findingLocation: { id: number; name: string; latitude: number; longitude: number } | null;
  canEdit: boolean;
}

// GBIF-Taxonomie-Abgleich (siehe Sammlung.tsx/karte.tsx): entweder ein eindeutiger Treffer
// (match_found) oder eine Liste von Vorschlägen, die der Nutzer manuell bestätigen muss.
interface GbifTaxonomy {
  reich: string; stamm: string; klasse: string;
  ordnung: string; familie: string; gattung: string; art: string;
}
interface GbifMatchResult {
  status: 'match_found';
  usageKey: number;
  confidence: number;
  canonicalName: string;
  taxonomy: GbifTaxonomy;
}
interface GbifSuggestion {
  usageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  rank?: string;
}
interface GbifNeedsConfirmation {
  status: 'needs_confirmation';
  suggestions: GbifSuggestion[];
}
type GbifResult = GbifMatchResult | GbifNeedsConfirmation;

const SELTENHEIT_OPTIONS = ['Häufig', 'Selten', 'Sehr selten', 'Ungefährdet', 'Wichtig', 'Geschützt', 'Stark gefährdet'];

interface AnimalImage {
  id: number;
  imageUrl: string;
  createdAt: string | null;
}

// Ordnet den Seltenheits-/Status-Text einem passenden Badge-Farbschema
// (Hintergrund/Text) zu, damit z.B. "Stark gefährdet" optisch anders hervorsticht
// als "Häufig". Unbekannte/fehlende Werte erhalten ein neutrales Grau.
function statusBadge(status: string | null) {
  switch ((status ?? '').toLowerCase()) {
    case 'häufig':
    case 'ungefährdet':      return { bg: '#d1fae5', color: '#065f46' };
    case 'selten':           return { bg: '#fef3c7', color: '#92400e' };
    case 'sehr selten':      return { bg: '#ffedd5', color: '#9a3412' };
    case 'wichtig':          return { bg: '#e0e7ff', color: '#3730a3' };
    case 'geschützt':        return { bg: '#fee2e2', color: '#991b1b' };
    case 'stark gefährdet':  return { bg: '#fce7f3', color: '#9d174d' };
    default:                 return { bg: '#f3f4f6', color: '#374151' };
  }
}

// Lokale Formatierungs-Hilfsfunktion (unabhängig von utils/date.ts): formatiert
// ein beliebiges Datum-String ins deutsche Anzeigeformat TT.MM.JJJJ.
// Fängt ungültige Datumswerte ab und gibt dann den Rohwert unverändert zurück.
function formatDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
}

// ── Bearbeitungs-Formular ────────────────────────────────────────────────────
//
// Formular zum Bearbeiten eines bestehenden Tier-Eintrags (Stammdaten + Taxonomie +
// optionale Koordinaten), analog zu AddAnimalModal (Sammlung.tsx) / TierFormPanel
// (karte.tsx), aber mit Werten aus dem geladenen Tier vorbefüllt und PUT statt POST.
function EditAnimalForm({ animal, clerkUserId, onCancel, onSaved }: {
  animal: AnimalDetail;
  clerkUserId: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(animal.name ?? '');
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState(animal.description ?? '');
  const [findDate, setFindDate]     = useState(animal.findDate ?? '');
  const [sex, setSex]               = useState(animal.sex ?? 'Unbekannt');
  const [ageClass, setAgeClass]     = useState(animal.ageClass ?? '');
  const [bodyMass, setBodyMass]     = useState(animal.bodyMassGram != null ? String(animal.bodyMassGram) : '');
  const [bodyLen, setBodyLen]       = useState(animal.bodyLengthMm != null ? String(animal.bodyLengthMm) : '');
  const [taxonomyId, setTaxonomyId] = useState<number | null>(animal.taxonomyId);
  const [lebensraum, setLebensraum] = useState(animal.lebensraum ?? '');
  const [seltenheit, setSeltenheit] = useState(animal.status ?? '');
  const [storageInfo, setStorageInfo] = useState(animal.storageInfo ?? '');
  const [showCoords, setShowCoords] = useState(animal.findingLocation != null);
  const [latitude, setLatitude]     = useState(animal.findingLocation ? String(animal.findingLocation.latitude) : '');
  const [longitude, setLongitude]   = useState(animal.findingLocation ? String(animal.findingLocation.longitude) : '');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [gbifResult, setGbifResult]       = useState<GbifResult | null>(null);
  const [gbifLoading, setGbifLoading]     = useState(false);
  const [gbifError, setGbifError]         = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState<string | null>(animal.taxonomy?.name ?? null);
  const [confirming, setConfirming]       = useState(false);

  // Setzt den kompletten GBIF-Zustand zurück (z. B. wenn der Artname geändert wird und
  // ein vorheriger Treffer/Vorschlag oder die bereits zugeordnete Taxonomie damit ungültig wird).
  const resetGbif = () => {
    setGbifResult(null);
    setConfirmedName(null);
    setTaxonomyId(null);
    setGbifError(null);
  };

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

  const handleSave = async () => {
    if (!displayName.trim()) { setError('Bitte einen Namen eingeben.'); return; }

    const lat = showCoords && latitude.trim()  ? parseFloat(latitude)  : null;
    const lng = showCoords && longitude.trim() ? parseFloat(longitude) : null;
    if (showCoords && ((lat === null) !== (lng === null))) {
      setError('Bitte Breiten- und Längengrad zusammen eingeben (oder beide leer lassen).');
      return;
    }
    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      setError('Breitengrad muss zwischen -90 und 90 liegen.');
      return;
    }
    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      setError('Längengrad muss zwischen -180 und 180 liegen.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/animals/${animal.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(clerkUserId ? { 'X-Clerk-User-Id': clerkUserId } : {}),
        },
        body: JSON.stringify({
          name:         displayName.trim(),
          description:  description.trim() || null,
          findDate:     findDate || null,
          sex:          sex === 'Unbekannt' ? null : sex,
          ageClass:     ageClass || null,
          bodyMassGram: bodyMass ? parseFloat(bodyMass) : null,
          bodyLengthMm: bodyLen  ? parseFloat(bodyLen)  : null,
          taxonomyId:   taxonomyId,
          lebensraum:   lebensraum.trim() || null,
          status:       seltenheit || null,
          storageInfo:  storageInfo.trim() || null,
          latitude:     lat,
          longitude:    lng,
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const matchResult  = gbifResult?.status === 'match_found'        ? gbifResult as GbifMatchResult       : null;
  const needsConfirm = gbifResult?.status === 'needs_confirmation'  ? gbifResult as GbifNeedsConfirmation : null;

  return (
    <div>
      {error && <div className="modal-error">{error}</div>}

      <div className="form-group">
        <label className="form-label">Name <span className="required">*</span></label>
        <input type="text" className="form-input" autoFocus
          value={displayName} onChange={e => setDisplayName(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Artname (Taxonomie-Suche)</label>
        <div className="gbif-search-row">
          <input type="text" className="form-input"
            placeholder="z. B. Parnassius apollo"
            value={name}
            onChange={e => { setName(e.target.value); resetGbif(); }}
            onKeyDown={e => { if (e.key === 'Enter') handleGbifSearch(); }} />
          <button type="button" className="btn-gbif-search"
            onClick={handleGbifSearch}
            disabled={!name.trim() || gbifLoading || saving}>
            {gbifLoading ? '⏳' : '🔍 Suchen'}
          </button>
        </div>
        <div className="gbif-hint">Wissenschaftlichen Artnamen eingeben und Suchen klicken, um die Taxonomie neu zuzuordnen.</div>
      </div>

      {gbifError && <div className="modal-error">{gbifError}</div>}

      {confirmedName && (
        <div className="gbif-confirmed">
          <span>✓ Taxonomie: <em>{confirmedName}</em></span>
          <button type="button" onClick={resetGbif} title="Zurücksetzen">✕</button>
        </div>
      )}

      {matchResult && (
        <div className="gbif-preview">
          <div className="gbif-preview-title">
            GBIF-Treffer — {matchResult.confidence}% Übereinstimmung
          </div>
          <div className="gbif-chain">
            {(Object.entries(matchResult.taxonomy) as [string, string][]).map(([rank, val], i, arr) => (
              <span key={rank} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="gbif-chain-item">
                  <span className="gbif-rank">{rank}</span>
                  <span className="gbif-val">{val}</span>
                </span>
                {i < arr.length - 1 && <span className="gbif-arrow">›</span>}
              </span>
            ))}
          </div>
          <button type="button" className="btn-gbif-accept" disabled={confirming}
            onClick={() => handleGbifConfirm(matchResult.usageKey, matchResult.canonicalName)}>
            {confirming ? '⏳ Wird gespeichert…' : '✓ Taxonomie übernehmen'}
          </button>
        </div>
      )}

      {needsConfirm && (
        <div className="gbif-preview gbif-preview--warn">
          <div className="gbif-preview-title">Keine exakte Übereinstimmung gefunden</div>
          {needsConfirm.suggestions.filter(s => s.usageKey).length > 0 ? (
            <>
              <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>Meintest du eine dieser Arten?</div>
              {needsConfirm.suggestions.filter(s => s.usageKey).map((s, i) => (
                <button key={i} type="button" className="btn-gbif-suggestion" disabled={confirming}
                  onClick={() => handleGbifConfirm(s.usageKey!, s.canonicalName ?? s.scientificName ?? 'Unbekannt')}>
                  <em>{s.canonicalName ?? s.scientificName}</em>
                  {s.rank && <span className="gbif-rank"> [{s.rank}]</span>}
                </button>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Keine Vorschläge gefunden.</div>
          )}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Beschreibung</label>
        <textarea className="form-textarea" placeholder="Kurze Beschreibung…"
          value={description} onChange={e => setDesc(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Seltenheit</label>
        <select className="form-select" value={seltenheit} onChange={e => setSeltenheit(e.target.value)}>
          <option value="">— nicht angegeben —</option>
          {SELTENHEIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label className="form-label">Lebensraum</label>
          <input type="text" className="form-input"
            placeholder="z. B. Alpine Wiesen, Berghänge"
            value={lebensraum} onChange={e => setLebensraum(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Funddatum</label>
          <input type="date" className="form-input"
            value={findDate} onChange={e => setFindDate(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Lagerung</label>
        <input type="text" className="form-input"
          placeholder="z. B. Vitrine 3, Schrank B"
          value={storageInfo} onChange={e => setStorageInfo(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input type="checkbox" checked={showCoords}
            onChange={e => setShowCoords(e.target.checked)} />
          Koordinaten manuell eingeben (statt über die Kartenansicht)
        </label>
        {showCoords && (
          <div className="form-row-2" style={{ marginTop: 10 }}>
            <div className="form-group">
              <label className="form-label">Breitengrad</label>
              <input type="number" step="any" min="-90" max="90" className="form-input"
                placeholder="z. B. 50.9411"
                value={latitude} onChange={e => setLatitude(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Längengrad</label>
              <input type="number" step="any" min="-180" max="180" className="form-input"
                placeholder="z. B. 8.0020"
                value={longitude} onChange={e => setLongitude(e.target.value)} />
            </div>
          </div>
        )}
        <div className="gbif-hint">Wird ein Fundort mit Koordinaten angegeben, erscheint das Tier auf der Kartenansicht.</div>
      </div>

      <div className="form-group">
        <label className="form-label">Geschlecht</label>
        <div className="radio-group">
          {(['Männlich', 'Weiblich', 'Unbekannt'] as const).map(g => (
            <label key={g} className={`radio-label${sex === g ? ' radio-checked' : ''}`}>
              <input type="radio" name="sex-edit" value={g}
                checked={sex === g} onChange={() => setSex(g)} style={{ display: 'none' }} />
              {g === 'Männlich' ? '♂ Männlich' : g === 'Weiblich' ? '♀ Weiblich' : '◉ Unbekannt'}
            </label>
          ))}
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label className="form-label">Altersklasse</label>
          <select className="form-select" value={ageClass} onChange={e => setAgeClass(e.target.value)}>
            <option value="">— nicht angegeben —</option>
            <option value="Juvenil">Juvenil</option>
            <option value="Subadult">Subadult</option>
            <option value="Adult">Adult</option>
            <option value="Senior">Senior</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Körpermasse (g)</label>
          <input type="number" min="0" step="0.01" className="form-input"
            placeholder="0.00" value={bodyMass} onChange={e => setBodyMass(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Körperlänge (mm)</label>
          <input type="number" min="0" step="0.1" className="form-input"
            placeholder="0.0" value={bodyLen} onChange={e => setBodyLen(e.target.value)} />
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn-cancel" disabled={saving} onClick={onCancel}>Abbrechen</button>
        <button className="btn-save"   disabled={saving} onClick={handleSave}>
          {saving ? '⏳ Wird gespeichert…' : '💾 Speichern'}
        </button>
      </div>
    </div>
  );
}

export default function TierDetailPage() {
  const router = useRouter();
  const { userId } = useAuth();
  const rawId = router.query.id;
  const animalId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [animal, setAnimal]         = useState<AnimalDetail | null>(null);
  const [image, setImage]           = useState<AnimalImage | null>(null);
  const [loading, setLoading]       = useState(true);
  const [imgLoading, setImgLoading] = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [imgError, setImgError]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [editing, setEditing]       = useState(false);

  // Lädt die Stammdaten des Tieres. Sendet die Clerk-User-Id mit, damit das Backend
  // canEdit/canDelete korrekt für den anfragenden Nutzer berechnen kann. Als useCallback
  // definiert, damit EditAnimalForm nach dem Speichern dieselbe Funktion erneut aufrufen
  // kann, um die aktualisierten Daten nachzuladen.
  const loadAnimal = useCallback(async () => {
    if (!animalId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/animals/${animalId}`, {
        headers: userId ? { 'X-Clerk-User-Id': userId } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnimal(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [animalId, userId]);

  // Lädt die Stammdaten des Tieres, sobald die Routen-ID verfügbar ist
  // (z.B. erst nach der Client-seitigen Hydration von router.query gültig)
  useEffect(() => { loadAnimal(); }, [loadAnimal]);

  // Lädt das (erste) zugehörige Foto des Tieres. Als useCallback definiert, damit
  // die Funktion sowohl im Lade-Effekt unten als auch nach Upload/Löschen erneut
  // aufgerufen werden kann, ohne die Referenz bei jedem Render neu zu erzeugen.
  const loadImage = useCallback(async () => {
    if (!animalId) return;
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await fetch(`${API}/api/images/${animalId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list: AnimalImage[] = await res.json();
      setImage(list[0] ?? null);
    } catch (e: any) {
      setImgError(e.message);
    } finally {
      setImgLoading(false);
    }
  }, [animalId]);

  useEffect(() => { loadImage(); }, [loadImage]);

  // Lädt eine ausgewählte Bilddatei per FormData/multipart-Upload hoch und
  // aktualisiert danach die Bildanzeige durch erneutes Laden (loadImage).
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !animalId) return;
    setUploading(true);
    setImgError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/images/upload/${animalId}`, {
        method: 'POST',
        headers: userId ? { 'X-Clerk-User-Id': userId } : {},
        body: fd,
      });
      if (res.status === 401) throw new Error('Bitte melde dich an, um ein Foto hochzuladen.');
      if (res.status === 403) throw new Error('Du bist nicht berechtigt, für dieses Tier ein Foto hochzuladen.');
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      await loadImage();
    } catch (e: any) {
      setImgError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Löscht das aktuell angezeigte Foto (nach Bestätigung über den nativen
  // confirm()-Dialog) und entfernt es lokal aus dem State.
  const handleDeleteImg = async () => {
    if (!image || !confirm('Foto wirklich löschen?')) return;
    setImgError(null);
    try {
      const res = await fetch(`${API}/api/images/${image.id}`, {
        method: 'DELETE',
        headers: userId ? { 'X-Clerk-User-Id': userId } : {},
      });
      if (res.status === 401) throw new Error('Bitte melde dich an, um dieses Foto zu löschen.');
      if (res.status === 403) throw new Error('Du bist nicht berechtigt, dieses Foto zu löschen.');
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      setImage(null);
    } catch (e: any) {
      setImgError(e.message);
    }
  };

  const badge = animal?.status ? statusBadge(animal.status) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f9fa; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: #202124; }

        .app-layout   { display: flex; height: 100vh; overflow: hidden; }
        .main-content { flex: 1; background: #fff; padding: 40px; overflow-y: auto; }

        .back-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: #f0fdf4; border: 1.5px solid #a7f3d0; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; font-weight: 500; color: #065f46;
          cursor: pointer; font-family: inherit; transition: background .15s; margin-bottom: 28px;
          border: none;
        }
        .back-btn:hover { background: #dcfce7; }

        .edit-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; font-weight: 500; color: #1d4ed8;
          cursor: pointer; font-family: inherit; transition: background .15s; margin-bottom: 28px;
        }
        .edit-btn:hover { background: #dbeafe; }

        .detail-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 36px;
          align-items: start;
          max-width: 900px;
        }
        @media (max-width: 640px) {
          .detail-grid { grid-template-columns: 1fr; }
          .main-content { padding: 20px; }
        }

        /* ── Left: Bild ── */
        .img-col { display: flex; flex-direction: column; gap: 12px; }

        .img-box {
          width: 100%; aspect-ratio: 1 / 1; border-radius: 16px; overflow: hidden;
          border: 1.5px solid #e5e7eb; background: #f3f4f6;
          display: flex; align-items: center; justify-content: center;
        }
        .img-main  { width: 100%; height: 100%; object-fit: cover; display: block; }
        .img-empty-box {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; color: #c4c9d1; font-size: 44px;
        }
        .img-empty-box span:last-child { font-size: 12px; font-weight: 500; }

        .img-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .img-upload-btn {
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          padding: 8px 14px; background: #2d6a4f; color: #fff;
          border-radius: 8px; font-size: 12px; font-weight: 600;
          transition: background .15s; user-select: none;
        }
        .img-upload-btn:hover { background: #1b4332; }
        .img-delete-btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid #fecaca;
          background: #fff; color: #b91c1c; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .img-delete-btn:hover { background: #fee2e2; }
        .img-err { font-size: 12px; color: #b91c1c; margin-top: 4px; }

        /* ── Right: Info ── */
        .info-col { display: flex; flex-direction: column; gap: 22px; }

        .animal-name {
          font-size: 28px; font-weight: 700; color: #111827; line-height: 1.2; margin-bottom: 4px;
        }
        .animal-scientific { font-size: 15px; color: #6b7280; font-style: italic; margin-bottom: 10px; }

        .badge-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .badge {
          font-size: 11px; font-weight: 600; padding: 3px 10px;
          border-radius: 99px; display: inline-block;
        }
        .badge-sex    { background: #e0f2fe; color: #0369a1; }
        .badge-age    { background: #f3f4f6; color: #374151; }

        .desc-box {
          font-size: 14px; color: #374151; line-height: 1.65;
          padding: 12px 16px; background: #f9fafb;
          border: 1px solid #e5e7eb; border-radius: 10px;
        }

        .section-title {
          font-size: 11px; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: .07em;
          padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; margin-bottom: 10px;
        }

        .info-table { width: 100%; border-collapse: collapse; }
        .info-table tr { border-bottom: 1px solid #f9fafb; }
        .info-table tr:last-child { border-bottom: none; }
        .info-table td { padding: 7px 0; font-size: 13px; vertical-align: top; }
        .info-table td:first-child { color: #9ca3af; font-weight: 500; width: 44%; }
        .info-table td:last-child  { color: #111827; font-weight: 500; }

        .collection-link {
          display: inline-flex; align-items: center; gap: 7px;
          background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 20px;
          padding: 6px 14px; font-size: 12px; color: #065f46; font-weight: 600;
          cursor: pointer; text-decoration: none; transition: background .15s;
        }
        .collection-link:hover { background: #dcfce7; }

        .status-msg { text-align: center; padding: 80px; color: #6b7280; font-size: 15px; }
        .error-box {
          padding: 32px; border: 1px dashed #fca5a5; border-radius: 12px;
          background: #fff5f5; color: #b91c1c; font-size: 14px; text-align: center;
        }

        /* ── Bearbeiten-Formular ── */
        .modal-error { font-size: 12px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 11px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
        .required { color: #ea4335; }
        .form-input, .form-textarea { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #e5e7eb; font-size: 13px; color: #202124; font-family: inherit; outline: none; transition: border-color .2s, box-shadow .2s; }
        .form-input:focus, .form-textarea:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,.1); }
        .form-textarea { resize: vertical; min-height: 72px; }

        .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 0; }
        .form-row-2 .form-group { margin-bottom: 16px; }
        .form-select {
          width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #e5e7eb;
          font-size: 13px; color: #202124; font-family: inherit; outline: none;
          background: #fff; cursor: pointer; transition: border-color .2s, box-shadow .2s;
        }
        .form-select:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,.1); }

        .checkbox-label {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #374151; cursor: pointer; user-select: none;
        }
        .checkbox-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #2d6a4f; }

        .radio-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .radio-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: #374151; cursor: pointer;
          background: #f9fafb; border: 1.5px solid #e5e7eb;
          border-radius: 20px; padding: 5px 12px;
          transition: all .15s; user-select: none;
        }
        .radio-label:hover { border-color: #2d6a4f; background: #f0fdf4; }
        .radio-checked { background: #f0fdf4; border-color: #2d6a4f; color: #2d6a4f; font-weight: 600; }

        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; padding-top: 16px; border-top: 1px solid #f1f3f4; }
        .btn-cancel { padding: 8px 18px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; font-size: 13px; color: #5f6368; cursor: pointer; font-weight: 500; font-family: inherit; transition: background .15s; }
        .btn-cancel:hover:not(:disabled) { background: #f8f9fa; }
        .btn-save { padding: 8px 20px; border-radius: 8px; border: none; background: #2d6a4f; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s; }
        .btn-save:hover:not(:disabled) { background: #1b4332; }
        .btn-cancel:disabled, .btn-save:disabled { opacity: .6; cursor: not-allowed; }

        .gbif-search-row { display: flex; gap: 8px; }
        .gbif-search-row .form-input { flex: 1; }
        .gbif-hint { font-size: 11px; color: #9ca3af; margin-top: 5px; }

        .btn-gbif-search {
          white-space: nowrap; padding: 9px 14px; background: #eff6ff;
          border: 1px solid #bfdbfe; border-radius: 8px;
          font-size: 12px; font-weight: 600; color: #1d4ed8;
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .btn-gbif-search:hover:not(:disabled) { background: #dbeafe; }
        .btn-gbif-search:disabled { opacity: .5; cursor: not-allowed; }

        .gbif-preview {
          background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 10px;
          padding: 14px; margin-bottom: 16px;
        }
        .gbif-preview--warn { background: #fffbeb; border-color: #fde68a; }
        .gbif-preview-title { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 10px; }

        .gbif-chain {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 4px; margin-bottom: 12px;
        }
        .gbif-chain-item {
          display: flex; flex-direction: column; align-items: center;
          background: #fff; border: 1px solid #d1fae5; border-radius: 6px;
          padding: 4px 8px; min-width: 56px;
        }
        .gbif-rank  { font-size: 9px; color: #9ca3af; text-transform: capitalize; }
        .gbif-val   { font-size: 11px; font-weight: 700; color: #1a1a1a; }
        .gbif-arrow { font-size: 14px; color: #9ca3af; line-height: 1; }

        .btn-gbif-accept {
          padding: 7px 16px; background: #2d6a4f; color: #fff; border: none;
          border-radius: 7px; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .btn-gbif-accept:hover:not(:disabled) { background: #1b4332; }
        .btn-gbif-accept:disabled { opacity: .5; cursor: not-allowed; }

        .btn-gbif-suggestion {
          display: block; width: 100%; text-align: left; margin-bottom: 6px;
          padding: 8px 12px; background: #fff; border: 1px solid #fde68a;
          border-radius: 8px; font-size: 12px; cursor: pointer;
          font-family: inherit; transition: all .15s;
        }
        .btn-gbif-suggestion:hover:not(:disabled) { background: #fffbeb; border-color: #f59e0b; }
        .btn-gbif-suggestion:disabled { opacity: .5; cursor: not-allowed; }

        .gbif-confirmed {
          display: flex; align-items: center; gap: 8px; justify-content: space-between;
          background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px;
          padding: 10px 14px; margin-bottom: 16px;
          font-size: 13px; color: #065f46; font-weight: 500;
        }
        .gbif-confirmed button {
          background: none; border: none; cursor: pointer;
          font-size: 14px; color: #9ca3af; padding: 0 4px; line-height: 1;
        }
        .gbif-confirmed button:hover { color: #374151; }
      `}</style>

      <div className="app-layout">
        <Navbar activeNav="tierliste" />

        <main className="main-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <button className="back-btn" onClick={() => {
              // Kam der Nutzer über eine Sammlung hierher (siehe Sammlung.tsx), führt
              // "Zurück" gezielt wieder in dieselbe Sammlung statt nur zur Übersicht,
              // da /Sammlung selbst kein eigenes Routing für die Detailansicht hat.
              const fromCollection = router.query.fromCollection;
              if (fromCollection) {
                router.push(`/Sammlung?collection=${fromCollection}`);
              } else {
                router.back();
              }
            }}>← Zurück</button>

            {animal?.canEdit && !editing && (
              <button className="edit-btn" onClick={() => setEditing(true)}>✏️ Bearbeiten</button>
            )}
          </div>

          {loading && <div className="status-msg">Wird geladen…</div>}
          {error   && <div className="error-box">⚠️ {error}</div>}

          {!loading && !error && animal && (
            <div className="detail-grid">

              {/* ── Bild-Spalte ── */}
              <div className="img-col">
                <div className="img-box">
                  {imgLoading ? (
                    <div className="img-empty-box"><span>⏳</span></div>
                  ) : image ? (
                  <img
                    src={`${resolveImageUrl(image.imageUrl)}?v=${encodeURIComponent(image.createdAt ?? '')}`}
                    alt={animal.name ?? ''}
                    className="img-main"
                  />
                    //<img src={`${API}${image.imageUrl}`} alt={animal.name ?? ''} className="img-main" />
                  ) : (
                    <div className="img-empty-box">
                      <span>📷</span>
                      <span>Kein Foto</span>
                    </div>
                  )}
                </div>

                {imgError && <div className="img-err">⚠️ {imgError}</div>}

                <div className="img-actions">
                  <label className="img-upload-btn">
                    {uploading ? '⏳ …' : image ? '🔄 Ersetzen' : '📷 Foto hochladen'}
                    <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                      style={{ display: 'none' }} disabled={uploading} onChange={handleUpload} />
                  </label>
                  {image && !imgLoading && (
                    <button className="img-delete-btn" onClick={handleDeleteImg}>🗑 Löschen</button>
                  )}
                </div>
              </div>

              {/* ── Info-Spalte ── */}
              <div className="info-col">
              {editing ? (
                <EditAnimalForm
                  animal={animal}
                  clerkUserId={userId ?? null}
                  onCancel={() => setEditing(false)}
                  onSaved={() => { setEditing(false); loadAnimal(); }}
                />
              ) : (
                <>
                <div>
                  <div className="animal-name">{animal.name ?? `Eintrag #${animal.id}`}</div>
                  {animal.taxonomy?.name && (
                    <div className="animal-scientific">{animal.taxonomy.name}</div>
                  )}
                  <div className="badge-row">
                    {badge && animal.status && (
                      <span className="badge" style={{ background: badge.bg, color: badge.color }}>
                        {animal.status}
                      </span>
                    )}
                    {animal.sex && (
                      <span className="badge badge-sex">
                        {animal.sex === 'Männlich' ? '♂ Männlich'
                          : animal.sex === 'Weiblich' ? '♀ Weiblich'
                          : `◉ ${animal.sex}`}
                      </span>
                    )}
                    {animal.ageClass && (
                      <span className="badge badge-age">{animal.ageClass}</span>
                    )}
                  </div>
                </div>

                {animal.description && (
                  <div className="desc-box">{animal.description}</div>
                )}

                <div>
                  <div className="section-title">Details</div>
                  <table className="info-table">
                    <tbody>
                      {animal.taxonomy?.rank && (
                        <tr><td>Taxonomie-Rang</td><td>{animal.taxonomy.rank}</td></tr>
                      )}
                      {animal.findDate && (
                        <tr><td>Funddatum</td><td>{formatDate(animal.findDate)}</td></tr>
                      )}
                      {animal.findingLocation && (
                        <tr><td>Fundort</td><td>{animal.findingLocation.name}</td></tr>
                      )}
                      {animal.bodyMassGram != null && (
                        <tr><td>Körpermasse</td><td>{animal.bodyMassGram} g</td></tr>
                      )}
                      {animal.bodyLengthMm != null && (
                        <tr><td>Körperlänge</td><td>{animal.bodyLengthMm} mm</td></tr>
                      )}
                      {animal.storageInfo && (
                        <tr><td>Lagerung</td><td>{animal.storageInfo}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {animal.collection && (
                  <div>
                    <div className="section-title">Sammlung</div>
                    <a className="collection-link" href={`/Sammlung?collection=${animal.collection.id}`}>
                      📂 {animal.collection.name}
                    </a>
                  </div>
                )}
                </>
              )}
              </div>

            </div>
          )}
        </main>
      </div>
    </>
  );
}
