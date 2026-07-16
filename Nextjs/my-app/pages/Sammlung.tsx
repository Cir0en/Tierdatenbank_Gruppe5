'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useUser, useAuth } from '@clerk/nextjs';
import Navbar from '../components/Navbar';

// ═══════════════════════════════════════════════════════════════════════════════
// Seite: /Sammlung
// Zweck: Übersicht und Verwaltung von "Sammlungen" (Gruppierungen von Tier-
//        Einträgen). Zeigt öffentliche Sammlungen aller Nutzer sowie die eigenen
//        (öffentlichen und privaten) Sammlungen des eingeloggten Nutzers an.
//        Erlaubt das Anlegen neuer Sammlungen, das Hinzufügen von Tieren zu einer
//        Sammlung (inkl. GBIF-Taxonomie-Abgleich) sowie das Ausleihen einzelner
//        Tiere an andere Nutzer.
// Rollen: Für nicht eingeloggte Nutzer read-only sichtbar (nur öffentliche
//        Sammlungen). Eingeloggte Nutzer (jede Rolle) können eigene Sammlungen
//        anlegen/löschen und Tiere hinzufügen bzw. verleihen, sofern sie Owner
//        der jeweiligen Sammlung sind (siehe `isOwner`/`canEdit`/`canDelete`).
// ═══════════════════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────────────────

interface Collection {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  ownerUsername: string | null;
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface CollectionItem {
  id: number;
  name: string | null;
  findDate: string | null;
  status: string | null;
  taxonomyName: string | null;
  taxonomyRank: string | null;
  findingLocation: string | null;
  lebensraum: string | null;
  imageUrl: string | null;
  imageCreatedAt: string | null;
  description: string | null;
  sex: string | null;
  ageClass: string | null;
  bodyMassGram: number | null;
  bodyLengthMm: number | null;
  isOnLoan: boolean;
  loanedToUsername: string | null;
  loanReturnDate: string | null;
  canDelete: boolean;
}

interface BorrowedItem {
  id: number;
  objectId: number | null;
  objectName: string | null;
  lenderName: string | null;
  lenderFirstName: string | null;
  lenderLastName: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  isOverdue: boolean;
}

const SELTENHEIT_OPTIONS = ['Häufig', 'Selten', 'Sehr selten', 'Ungefährdet', 'Wichtig', 'Geschützt', 'Stark gefährdet'];

interface CollectionDetail extends Collection {
  items: CollectionItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Ordnet dem Seltenheits-/Schutzstatus eines Tiers Hintergrund- und Textfarbe für
// das Badge in der Kartenansicht zu. Unbekannte/leere Werte bekommen ein neutrales Grau.
function statusBadge(status: string | null) {
  switch ((status ?? '').toLowerCase()) {
    case 'häufig':
    case 'ungefährdet':  return { bg: '#d1fae5', color: '#065f46' };
    case 'selten':       return { bg: '#fef3c7', color: '#92400e' };
    case 'sehr selten':  return { bg: '#ffedd5', color: '#9a3412' };
    case 'wichtig':      return { bg: '#e0e7ff', color: '#3730a3' };
    case 'geschützt':    return { bg: '#fee2e2', color: '#991b1b' };
    case 'stark gefährdet': return { bg: '#fce7f3', color: '#9d174d' };
    default:             return { bg: '#f3f4f6', color: '#374151' };
  }
}

// ── Create Modal ───────────────────────────────────────────────────────────────

// Modal zum Anlegen einer neuen Sammlung (Name, Beschreibung, Sichtbarkeit).
function CreateModal({ onClose, onSaved, clerkUserId }: {
  onClose: () => void;
  onSaved: () => void;
  clerkUserId: string | null;
}) {
  const [name, setName]         = useState('');
  const [description, setDesc]  = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Validiert die Eingaben, sendet die neue Sammlung ans Backend und meldet
  // Erfolg über onSaved(). Auth erfolgt hier per 'X-Clerk-User-Id'-Header
  // (nicht per Bearer-Token) — das Backend identifiziert den Owner darüber.
  const handleSave = async () => {
    if (!name.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    if (!clerkUserId) { setError('Du musst eingeloggt sein.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Clerk-User-Id': clerkUserId },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, isPublic }),
        
      });
      // Notification hier einfügen
      if (isPublic == true){const notres = await fetch(`${API}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ title: `A New Public Collection was created`, body: `The collection "${name.trim()}" has been created and is now publicly available. Check it out!`,
        segment:'Test Users'})});
      } 
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">📂 Neue Sammlung anlegen</div>
        {error && <div className="modal-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Name <span className="required">*</span></label>
          <input type="text" className="form-input" autoFocus
            placeholder="z. B. Schmetterlinge NRW"
            value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Beschreibung</label>
          <textarea className="form-textarea"
            placeholder="Kurze Beschreibung der Sammlung…"
            value={description} onChange={e => setDesc(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Sichtbarkeit</label>
          <div className="visibility-toggle">
            <button type="button"
              className={`vis-btn${isPublic ? ' vis-active-public' : ''}`}
              onClick={() => setIsPublic(true)}>🌍 Öffentlich</button>
            <button type="button"
              className={`vis-btn${!isPublic ? ' vis-active-private' : ''}`}
              onClick={() => setIsPublic(false)}>🔒 Privat</button>
          </div>
          <p className="vis-hint">
            {isPublic ? 'Alle Nutzer können diese Sammlung sehen.' : 'Nur du siehst diese Sammlung.'}
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" disabled={saving} onClick={onClose}>Abbrechen</button>
          <button className="btn-save"   disabled={saving} onClick={handleSave}>
            {saving ? '⏳ Wird erstellt…' : '✓ Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Collection Card ────────────────────────────────────────────────────────────

// Kachel einer einzelnen Sammlung in der Grid-Übersicht. Öffnet beim Klick die
// Detailansicht; zeigt einen Löschen-Button nur, wenn der Nutzer canDelete hat.
function CollectionCard({ col, clerkUserId, onOpen, onDeleted }: {
  col: Collection;
  clerkUserId: string | null;
  onOpen: (id: number) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  // Löscht die Sammlung nach Bestätigungsdialog. stopPropagation verhindert,
  // dass der Klick zusätzlich den Karten-onClick (Öffnen) auslöst.
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Sammlung „${col.name}" wirklich löschen?`)) return;
    setDeleting(true);
    try {
      await fetch(`${API}/api/collections/${col.id}`, {
        method: 'DELETE',
        headers: clerkUserId ? { 'X-Clerk-User-Id': clerkUserId } : {},
      });
      onDeleted();
    } catch { setDeleting(false); }
  };

  return (
    <div className="col-card" onClick={() => onOpen(col.id)}>
      <div className={`col-card-stripe ${col.isPublic ? 'stripe-public' : 'stripe-private'}`} />
      <div className="col-card-body">
        <div className="col-card-top">
          <div className="col-card-name">{col.name}</div>
          <span className={`col-badge ${col.isPublic ? 'badge-public' : 'badge-private'}`}>
            {col.isPublic ? '🌍 Öffentlich' : '🔒 Privat'}
          </span>
        </div>
        {col.description && <div className="col-card-desc">{col.description}</div>}
        <div className="col-card-meta">
          <span className="col-meta-item">🐾 {col.itemCount} Einträge</span>
          {col.ownerUsername && <span className="col-meta-item">👤 {col.ownerUsername}</span>}
        </div>
        {col.canDelete && (
          <button className="col-delete-btn" disabled={deleting}
            onClick={handleDelete} title="Sammlung löschen">
            {deleting ? '…' : '🗑'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Loan Animal Modal ─────────────────────────────────────────────────────────

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

type LoanUser = { id: number; username: string; firstName: string | null; lastName: string | null; institution: string | null };

// Modal zum Ausleihen eines einzelnen Sammlungs-Eintrags (Tiers) an einen
// anderen registrierten Nutzer. Nur für den Owner der Sammlung sichtbar.
function LoanAnimalModal({ item, getToken, onClose, onSaved }: {
  item: CollectionItem;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [users, setUsers]         = useState<LoanUser[]>([]);
  const [borrowerId, setBorrower] = useState<number | ''>('');
  const [startDate, setStart]     = useState(today);
  const [endDate, setEnd]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Lädt beim Öffnen des Modals die Liste möglicher Entleiher (alle anderen
  // Nutzer). Auth per Bearer-Token (LoanController erfordert [Authorize]).
  // Fehler werden bewusst verschluckt — dann bleibt die Auswahl leer.
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API}/api/loan/users`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setUsers(await res.json());
      } catch {}
    })();
  }, [getToken]);

  // Baut einen lesbaren Anzeigenamen (Vor-/Nachname, sonst Username) für die Auswahlliste.
  const displayName = (u: LoanUser) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;

  // Legt die Ausleihe im Backend an. Validiert vorher, dass Entleiher und
  // beide Datumsfelder gesetzt sind, und zeigt Backend-Fehlermeldungen an.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerId || !startDate || !endDate) { setError('Bitte alle Felder ausfüllen.'); return; }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/loan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ objectId: item.id, borrowerId, startDate, endDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Fehler ${res.status}`);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⇄ Tier ausleihen</div>

        <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{item.name ?? `Eintrag #${item.id}`}</div>
          {item.taxonomyName && <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', marginTop: 2 }}>{item.taxonomyName}</div>}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Entleiher <span className="required">*</span></label>
            <select className="form-select" value={borrowerId}
              onChange={e => setBorrower(Number(e.target.value))} required>
              <option value="">— Person auswählen —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {displayName(u)}{u.institution ? ` · ${u.institution}` : ''}
                </option>
              ))}
            </select>
            {users.length === 0 && (
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Keine weiteren Nutzer im System gefunden.
              </p>
            )}
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Startdatum <span className="required">*</span></label>
              <input type="date" className="form-input" value={startDate}
                onChange={e => setStart(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Rückgabedatum <span className="required">*</span></label>
              <input type="date" className="form-input" value={endDate}
                min={startDate} onChange={e => setEnd(e.target.value)} required />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" disabled={saving} onClick={onClose}>Abbrechen</button>
            <button type="submit" className="btn-save" disabled={saving || !borrowerId}>
              {saving ? '⏳ Wird gespeichert…' : '⇄ Ausleihe anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── GBIF Types ─────────────────────────────────────────────────────────────────
// Typen für die Antwort der GBIF-Taxonomie-Suche (Global Biodiversity
// Information Facility): entweder ein eindeutiger Treffer (match_found) oder
// eine Liste von Vorschlägen, die der Nutzer manuell bestätigen muss.

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

// ── Add Animal Modal ──────────────────────────────────────────────────────────

// Modal zum Hinzufügen eines neuen Tier-Eintrags zu einer Sammlung. Enthält
// zusätzlich den GBIF-Workflow: der Nutzer gibt einen Artnamen ein, sucht
// gegen die GBIF-Datenbank und übernimmt (bestätigt) einen Treffer, wodurch
// eine taxonomyId für das Tier gesetzt wird.
function AddAnimalModal({ collectionId, clerkUserId, onClose, onSaved }: {
  collectionId: number;
  clerkUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [findDate, setFindDate]     = useState('');
  const [sex, setSex]               = useState('Unbekannt');
  const [ageClass, setAgeClass]     = useState('');
  const [bodyMass, setBodyMass]     = useState('');
  const [bodyLen, setBodyLen]       = useState('');
  const [taxonomyId, setTaxonomyId] = useState<number | null>(null);
  const [lebensraum, setLebensraum] = useState('');
  const [showCoords, setShowCoords] = useState(false);
  const [latitude, setLatitude]     = useState('');
  const [longitude, setLongitude]   = useState('');
  const [seltenheit, setSeltenheit] = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [gbifResult, setGbifResult]       = useState<GbifResult | null>(null);
  const [gbifLoading, setGbifLoading]     = useState(false);
  const [gbifError, setGbifError]         = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [confirming, setConfirming]       = useState(false);

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

  // Speichert das neue Tier mit allen Formularfeldern (inkl. optionaler
  // taxonomyId aus dem GBIF-Workflow) im Backend. Leere/„Unbekannt"-Werte
  // werden bewusst als null statt als leerer String übergeben.
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
      const res = await fetch(`${API}/api/animals`, {
        method: 'POST',
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
          latitude:     lat,
          longitude:    lng,
          collectionId,
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
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-title">🐾 Neues Tier hinzufügen</div>
        {error && <div className="modal-error">{error}</div>}

        {/* Eigener Name/Bezeichnung des Eintrags */}
        <div className="form-group">
          <label className="form-label">Name <span className="required">*</span></label>
          <input type="text" className="form-input" autoFocus
            placeholder="z. B. Fund Nr. 3, Waldrand-Käfer"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)} />
        </div>

        {/* Artname + GBIF-Suche (nur für die Taxonomie-Zuordnung, unabhängig vom Namen oben) */}
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
          <div className="gbif-hint">Wissenschaftlichen Artnamen eingeben und Suchen klicken, um die Taxonomie automatisch zuzuordnen.</div>
        </div>

        {gbifError && <div className="modal-error">{gbifError}</div>}

        {/* Bestätigte Taxonomie */}
        {confirmedName && (
          <div className="gbif-confirmed">
            <span>✓ Taxonomie: <em>{confirmedName}</em></span>
            <button type="button" onClick={resetGbif} title="Zurücksetzen">✕</button>
          </div>
        )}

        {/* GBIF Treffer */}
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

        {/* GBIF Vorschläge */}
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
          <div className="gbif-hint">Wird ein Fundort mit Koordinaten angegeben, erscheint das Tier zusätzlich auf der Kartenansicht.</div>
        </div>

        <div className="form-group">
          <label className="form-label">Geschlecht</label>
          <div className="radio-group">
            {(['Männlich', 'Weiblich', 'Unbekannt'] as const).map(g => (
              <label key={g} className={`radio-label${sex === g ? ' radio-checked' : ''}`}>
                <input type="radio" name="sex-modal" value={g}
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
          <button className="btn-cancel" disabled={saving} onClick={onClose}>Abbrechen</button>
          <button className="btn-save"   disabled={saving} onClick={handleSave}>
            {saving ? '⏳ Wird gespeichert…' : '+ Tier hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Collection Detail View ─────────────────────────────────────────────────────

// Detailansicht einer einzelnen Sammlung: zeigt alle enthaltenen Tier-Einträge
// als Karten-Grid, erlaubt dem Owner das Hinzufügen neuer Tiere und das
// Ausleihen einzelner Einträge. Ein Klick auf eine Tierkarte navigiert zur
// Detailseite des Tiers (/tier/[id]).
function CollectionDetailView({ detail, onBack, onAnimalAdded, isSignedIn, clerkUserId, getToken }: {
  detail: CollectionDetail;
  onBack: () => void;
  onAnimalAdded: () => void;
  isSignedIn?: boolean;
  clerkUserId: string | null;
  getToken: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [showAddModal, setShowAddModal]     = useState(false);
  const [loanItem, setLoanItem]             = useState<CollectionItem | null>(null);
  const [loanSuccess, setLoanSuccess]       = useState<string | null>(null);
  const [deletingId, setDeletingId]         = useState<number | null>(null);

  // Löscht ein einzelnes Tier aus der Sammlung nach Bestätigungsdialog. Nur für
  // Admin/Moderator oder den Ersteller des Eintrags sichtbar (item.canDelete, siehe Backend).
  const handleDeleteAnimal = async (e: React.MouseEvent, item: CollectionItem) => {
    e.stopPropagation();
    if (!confirm(`„${item.name ?? `Eintrag #${item.id}`}" wirklich löschen?`)) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`${API}/api/animals/${item.id}`, {
        method: 'DELETE',
        headers: clerkUserId ? { 'X-Clerk-User-Id': clerkUserId } : {},
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      onAnimalAdded();
    } catch (err: any) {
      alert(err.message ?? 'Löschen fehlgeschlagen.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Back + header */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>← Zurück</button>
        <div className="detail-header-info">
          <div className="detail-title-row">
            <div className="detail-title">{detail.name}</div>
            {isSignedIn && (
              <button className="btn-add-animal" onClick={() => setShowAddModal(true)}>
                + Tier hinzufügen
              </button>
            )}
          </div>
          {loanSuccess && (
            <div style={{ marginTop: 8, padding: '8px 14px', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, fontSize: 13, color: '#065f46' }}>
              ✓ {loanSuccess}
            </div>
          )}
          <div className="detail-meta-row">
            <span className={`col-badge ${detail.isPublic ? 'badge-public' : 'badge-private'}`}>
              {detail.isPublic ? '🌍 Öffentlich' : '🔒 Privat'}
            </span>
            {detail.ownerUsername && (
              <span className="detail-owner">👤 {detail.ownerUsername}</span>
            )}
            <span className="detail-count">{detail.items.length} Einträge</span>
          </div>
          {detail.description && (
            <div className="detail-desc">{detail.description}</div>
          )}
        </div>
      </div>

      {/* Animal Cards */}
      {detail.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🐾</div>
          Diese Sammlung enthält noch keine Einträge.<br />
          Klicke auf „+ Tier hinzufügen".
        </div>
      ) : (
        <div className="animal-card-grid">
          {detail.items.map(item => {
            const badge = statusBadge(item.status);
            return (
              <div key={item.id} className="animal-card" onClick={() => router.push(`/tier/${item.id}?fromCollection=${detail.id}`)}>
                {item.canDelete && (
                  <button className="animal-delete-btn" disabled={deletingId === item.id}
                    onClick={e => handleDeleteAnimal(e, item)} title="Tier löschen">
                    {deletingId === item.id ? '…' : '🗑'}
                  </button>
                )}
                {/* Foto */}
                <div className="animal-card-img-wrap">
                  {item.imageUrl ? (
                  <img
                    src={`${resolveImageUrl(item.imageUrl)}?v=${encodeURIComponent(item.imageCreatedAt ?? '')}`}
                    alt={item.name ?? ''}
                    className="animal-card-img"
                  />
                    //<img src={`${API}${item.imageUrl}`} alt={item.name ?? ''} className="animal-card-img" />
                  ) : (
                    <div className="animal-card-img-placeholder">
                      <span>📷</span>
                      <span className="animal-card-img-hint">Foto hochladen</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="animal-card-body">
                  <div className="animal-card-name">{item.name ?? `Eintrag #${item.id}`}</div>

                  {item.taxonomyName && (
                    <div className="animal-card-scientific">{item.taxonomyName}</div>
                  )}

                  <div className="animal-card-meta">
                    {item.taxonomyRank && (
                      <span className="animal-card-cat">{item.taxonomyRank}</span>
                    )}
                    {item.lebensraum && (
                      <span className="animal-card-cat">{item.lebensraum}</span>
                    )}
                    {item.findingLocation && (
                      <span className="animal-card-loc">📍 {item.findingLocation}</span>
                    )}
                  </div>

                  {item.status && (
                    <span className="animal-card-badge"
                      style={{ background: badge.bg, color: badge.color }}>
                      {item.status}
                    </span>
                  )}

                  {item.isOnLoan && (
                    <span className="animal-card-badge animal-card-badge--loan">
                      ⇄ Verliehen
                      {item.loanedToUsername ? ` an ${item.loanedToUsername}` : ''}
                      {item.loanReturnDate ? ` bis ${new Date(item.loanReturnDate).toLocaleDateString('de-DE')}` : ''}
                    </span>
                  )}

                  {detail.isOwner && clerkUserId && (
                    item.isOnLoan ? (
                      <div className="btn-loan-animal btn-loan-animal--disabled" title="Dieses Tier ist bereits verliehen">
                        Bereits verliehen
                      </div>
                    ) : (
                      <button
                        className="btn-loan-animal"
                        onClick={e => { e.stopPropagation(); setLoanItem(item); setLoanSuccess(null); }}
                        title="Dieses Tier ausleihen"
                      >
                        ⇄ Ausleihen
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddAnimalModal
          collectionId={detail.id}
          clerkUserId={clerkUserId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); onAnimalAdded(); }}
        />
      )}

      {loanItem && clerkUserId && (
        <LoanAnimalModal
          item={loanItem}
          getToken={getToken}
          onClose={() => setLoanItem(null)}
          onSaved={() => {
            setLoanItem(null);
            setLoanSuccess(`„${loanItem.name ?? `Eintrag #${loanItem.id}`}" wurde erfolgreich ausgeliehen.`);
            onAnimalAdded(); // lädt die Sammlung neu, damit der "Verliehen"-Badge sofort sichtbar wird
          }}
        />
      )}

    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'public' | 'mine' | 'borrowed';

// Hauptkomponente der Seite /Sammlung. Verwaltet sowohl die Grid-Übersicht
// (mit Tabs "Öffentlich" / "Meine Sammlungen" und Volltextsuche über den Namen)
// als auch die Detailansicht (siehe CollectionDetailView), zwischen denen über
// den lokalen `detail`-State umgeschaltet wird. Die geöffnete Sammlung wird per
// ?collection=<id> in der URL gespiegelt (shallow routing), damit ein Zurück-
// navigieren von der Tier-Detailseite wieder dieselbe Sammlung öffnet.
export default function SammlungPage() {
  const router = useRouter();
  const { user } = useUser();
  const { isSignedIn, getToken } = useAuth();
  // clerkUserId wird bei jeder Sammlungs-/Objekt-API-Anfrage als
  // 'X-Clerk-User-Id'-Header mitgeschickt, damit das Backend Owner-Rechte
  // (canEdit/canDelete/isOwner) korrekt berechnen kann; ist der Nutzer nicht
  // eingeloggt, bleibt er null und es werden nur öffentlich sichtbare Daten
  // geliefert. Für die Ausleihe (LoanController, erfordert [Authorize]) wird
  // stattdessen getToken() für ein Bearer-Token verwendet (siehe CollectionDetailView).
  const clerkUserId = user?.id ?? null;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<Tab>('public');
  const [showModal, setShowModal]     = useState(false);
  const [search, setSearch]           = useState('');

  // Detail view
  const [detail, setDetail]           = useState<CollectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Tiere, die sich der aktuelle Nutzer von anderen ausgeliehen hat (Entleiher-Sicht,
  // Tab "Geliehen"). Geladen über den bestehenden LoanController, da geliehene Tiere
  // fachlich weiterhin zur Sammlung des Verleihers gehören und nicht Teil einer
  // eigenen Collection des Entleihers sind.
  const [borrowedItems, setBorrowedItems]   = useState<BorrowedItem[]>([]);
  const [borrowedLoading, setBorrowedLoading] = useState(false);

  const loadBorrowed = useCallback(async () => {
    if (!isSignedIn) { setBorrowedItems([]); return; }
    setBorrowedLoading(true);
    try {
      const token = await getToken();
      if (!token) { setBorrowedItems([]); return; }
      const authHeaders = { Authorization: `Bearer ${token}` };
      const meRes = await fetch(`${API}/api/users/me`, { headers: authHeaders });
      if (!meRes.ok) { setBorrowedItems([]); return; }
      const me = await meRes.json();
      const loansRes = await fetch(`${API}/api/loan`, { headers: authHeaders });
      if (!loansRes.ok) { setBorrowedItems([]); return; }
      const allLoans: any[] = await loansRes.json();
      setBorrowedItems(
        allLoans
          .filter(l => l.borrowerId === me.id && l.status === 'offen')
          .map(l => ({
            id: l.id,
            objectId: l.objectId,
            objectName: l.objectName,
            lenderName: l.lenderName,
            lenderFirstName: l.lenderFirstName,
            lenderLastName: l.lenderLastName,
            startDate: l.startDate,
            endDate: l.endDate,
            status: l.status,
            isOverdue: l.isOverdue,
          }))
      );
    } catch {
      setBorrowedItems([]);
    } finally {
      setBorrowedLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => { loadBorrowed(); }, [loadBorrowed]);

  // Lädt die Liste aller für den Nutzer sichtbaren Sammlungen (öffentliche +
  // eigene private). Als useCallback gewrapped, damit die Referenz nur bei
  // Änderung von clerkUserId neu erzeugt wird (Abhängigkeit von useEffect unten).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/collections`, {
        headers: clerkUserId ? { 'X-Clerk-User-Id': clerkUserId } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCollections(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clerkUserId]);

  // Initiales Laden der Sammlungsliste beim Mount bzw. wenn sich der Nutzer
  // (an/ab-)meldet und sich dadurch `load` ändert.
  useEffect(() => { load(); }, [load]);

  // Lädt die Detaildaten (inkl. aller enthaltenen Tier-Einträge) einer
  // Sammlung nach und schaltet die Ansicht auf die Detailansicht um. Spiegelt
  // die geöffnete Sammlung zusätzlich per Query-Parameter in der URL, damit ein
  // Zurücknavigieren (z.B. von der Tier-Detailseite) wieder in derselben
  // Sammlung landet statt in der Übersicht (siehe onBack unten).
  const openCollection = async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    if (router.query.collection !== String(id)) {
      router.push({ pathname: '/Sammlung', query: { collection: id } }, undefined, { shallow: true });
    }
    try {
      const res = await fetch(`${API}/api/collections/${id}`, {
        headers: clerkUserId ? { 'X-Clerk-User-Id': clerkUserId } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // Öffnet beim (Wieder-)Laden der Seite automatisch die Sammlung aus dem
  // Query-Parameter, z.B. nach dem Zurücknavigieren von /tier/[id].
  useEffect(() => {
    if (!router.isReady) return;
    const collectionId = parseInt(router.query.collection as string, 10);
    if (!isNaN(collectionId) && detail?.id !== collectionId) {
      openCollection(collectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.collection]);

  // Callback nach erfolgreichem Anlegen einer Sammlung: Modal schließen und
  // Liste neu laden, damit die neue Sammlung sofort sichtbar ist.
  const handleSaved = () => { setShowModal(false); load(); };

  // Client-seitige Filterung nach Tab (öffentlich vs. eigene) und Suchbegriff.
  // Die eigenen Sammlungen werden zusätzlich in privat/öffentlich unterteilt,
  // um sie in der "Meine Sammlungen"-Ansicht in zwei Abschnitten anzuzeigen.
  const publicCols = collections.filter(c =>
    c.isPublic && (search === '' || c.name.toLowerCase().includes(search.toLowerCase()))
  );
  const mineCols = collections.filter(c =>
    c.isOwner && (search === '' || c.name.toLowerCase().includes(search.toLowerCase()))
  );
  const myPrivate = mineCols.filter(c => !c.isPublic);
  const myPublic  = mineCols.filter(c =>  c.isPublic);

  return (
    <>
      {/* Komponenten-Styling (CSS-in-JS) für die gesamte Seite; Abschnitte sind unten mit „── ── " markiert. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f9fa; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: #202124; }

        .app-layout   { display: flex; height: 100vh; overflow: hidden; }
        .main-content { flex: 1; background: #fff; padding: 40px; display: flex; flex-direction: column; overflow-y: auto; }

        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; gap: 16px; }
        .page-title  { font-size: 26px; font-weight: 600; color: #1a2f1a; letter-spacing: -0.02em; }
        .page-sub    { font-size: 13px; color: #6b7280; margin-top: 4px; }

        .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
        .search-wrap { position: relative; flex: 1; max-width: 360px; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 15px; color: #9ca3af; pointer-events: none; }
        .search-input {
          width: 100%; padding: 10px 14px 10px 38px; border: 1px solid #e5e7eb; border-radius: 8px;
          font-family: inherit; font-size: 14px; color: #202124; outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .search-input:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,.1); }
        .search-input::placeholder { color: #9ca3af; }

        .btn-new {
          white-space: nowrap; padding: 10px 18px; background: #2d6a4f; color: #fff;
          border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .btn-new:hover { background: #1b4332; }

        .tabs { display: flex; gap: 2px; margin-bottom: 28px; border-bottom: 2px solid #e5e7eb; }
        .tab-btn {
          padding: 10px 20px; background: none; border: none; font-family: inherit;
          font-size: 14px; font-weight: 500; color: #6b7280; cursor: pointer;
          border-bottom: 2px solid transparent; margin-bottom: -2px;
          transition: color .15s, border-color .15s;
        }
        .tab-btn:hover { color: #2d6a4f; }
        .tab-btn.tab-active { color: #2d6a4f; border-bottom-color: #2d6a4f; font-weight: 600; }
        .tab-count {
          display: inline-block; background: #f3f4f6; color: #6b7280;
          font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 99px; margin-left: 6px;
        }
        .tab-active .tab-count { background: #d1fae5; color: #065f46; }

        .section-header {
          display: flex; align-items: center; gap: 10px;
          font-size: 13px; font-weight: 600; color: #374151;
          margin-bottom: 14px; margin-top: 24px;
        }
        .section-header:first-child { margin-top: 0; }
        .section-line { flex: 1; height: 1px; background: #e5e7eb; }

        .col-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }

        .col-card {
          display: flex; border-radius: 12px; border: 1.5px solid #e5e7eb;
          background: #fff; overflow: hidden; cursor: pointer;
          transition: box-shadow .2s, transform .2s; position: relative;
        }
        .col-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.09); transform: translateY(-2px); }

        .col-card-stripe { width: 5px; flex-shrink: 0; }
        .stripe-public  { background: #2d6a4f; }
        .stripe-private { background: #6366f1; }

        .col-card-body { flex: 1; padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 8px; }
        .col-card-top  { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .col-card-name { font-size: 15px; font-weight: 600; color: #1a1a1a; line-height: 1.3; flex: 1; }

        .col-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
        .badge-public  { background: #d1fae5; color: #065f46; }
        .badge-private { background: #ede9fe; color: #5b21b6; }

        .col-card-desc { font-size: 12px; color: #6b7280; line-height: 1.5; }
        .col-card-meta { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
        .col-meta-item { font-size: 11px; color: #9ca3af; }

        .col-delete-btn {
          position: absolute; top: 10px; right: 10px; z-index: 1;
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          background: #fee2e2; border: 1.5px solid #fca5a5; border-radius: 8px;
          color: #b91c1c; cursor: pointer; font-size: 14px;
          transition: background .15s, border-color .15s, transform .15s;
        }
        .col-delete-btn:hover { background: #fecaca; border-color: #f87171; transform: scale(1.06); }
        .col-delete-btn:disabled { opacity: .6; cursor: not-allowed; }

        /* ── Detail view ── */
        .detail-header {
          display: flex; align-items: flex-start; gap: 16px; margin-bottom: 28px;
        }
        .back-btn {
          display: flex; align-items: center; gap: 6px; white-space: nowrap;
          background: #f0fdf4; border: 1.5px solid #a7f3d0; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; font-weight: 500; color: #065f46;
          cursor: pointer; font-family: inherit; transition: background .15s; flex-shrink: 0;
        }
        .back-btn:hover { background: #dcfce7; }
        .detail-header-info { flex: 1; }
        .detail-title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
        .detail-meta-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
        .detail-owner { font-size: 12px; color: #6b7280; }
        .detail-count { font-size: 12px; color: #9ca3af; }
        .detail-desc  { font-size: 13px; color: #6b7280; margin-top: 4px; line-height: 1.5; }

        .item-list { display: flex; flex-direction: column; gap: 10px; }
        .item-row {
          display: flex; align-items: center; justify-content: space-between;
          border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px;
          background: #fff; transition: box-shadow .15s;
        }
        .item-row:hover { box-shadow: 0 2px 10px rgba(0,0,0,.07); }
        .item-row-left { display: flex; flex-direction: column; gap: 3px; }
        .item-name   { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .item-date   { font-size: 12px; color: #9ca3af; }
        .item-status { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }

        /* ── Common ── */
        .empty-state {
          text-align: center; padding: 60px 20px; color: #9ca3af; font-size: 14px;
          border: 1.5px dashed #e5e7eb; border-radius: 12px;
        }
        .empty-icon { font-size: 40px; margin-bottom: 12px; opacity: .5; }
        .status-msg { text-align: center; padding: 60px; color: #6b7280; font-size: 15px; }
        .error-box  { padding: 32px; border: 1px dashed #fca5a5; border-radius: 12px; background: #fff5f5; color: #b91c1c; font-size: 14px; text-align: center; }

        /* ── Modal ── */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: #fff; border-radius: 14px; padding: 28px; width: min(460px, 90vw); box-shadow: 0 8px 32px rgba(0,0,0,.18); }
        .modal-title { font-size: 17px; font-weight: 700; color: #1a1a1a; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #f0f0f0; }
        .modal-error { font-size: 12px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 11px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
        .required { color: #ea4335; }
        .form-input, .form-textarea { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #e5e7eb; font-size: 13px; color: #202124; font-family: inherit; outline: none; transition: border-color .2s, box-shadow .2s; }
        .form-input:focus, .form-textarea:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,.1); }
        .form-textarea { resize: vertical; min-height: 72px; }
        .visibility-toggle { display: flex; gap: 8px; }
        .vis-btn { flex: 1; padding: 10px; border-radius: 8px; border: 1.5px solid #e5e7eb; background: #f9fafb; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all .15s; }
        .vis-active-public  { border-color: #2d6a4f; background: #f0fdf4; color: #2d6a4f; }
        .vis-active-private { border-color: #6366f1; background: #f5f3ff; color: #5b21b6; }
        .vis-hint { font-size: 11px; color: #9ca3af; margin-top: 6px; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; padding-top: 16px; border-top: 1px solid #f1f3f4; }
        .btn-cancel { padding: 8px 18px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; font-size: 13px; color: #5f6368; cursor: pointer; font-weight: 500; font-family: inherit; transition: background .15s; }
        .btn-cancel:hover:not(:disabled) { background: #f8f9fa; }
        .btn-save { padding: 8px 20px; border-radius: 8px; border: none; background: #2d6a4f; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s; }
        .btn-save:hover:not(:disabled) { background: #1b4332; }
        .btn-cancel:disabled, .btn-save:disabled { opacity: .6; cursor: not-allowed; }

        /* ── Add-Animal Modal ── */
        .modal-wide { width: min(560px, 92vw); max-height: 90vh; overflow-y: auto; }
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

        /* ── Detail header with add button ── */
        .detail-title-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-bottom: 8px;
        }
        .btn-add-animal {
          white-space: nowrap; padding: 8px 16px;
          background: #2d6a4f; color: #fff; border: none; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: background .15s; flex-shrink: 0;
        }
        .btn-add-animal:hover { background: #1b4332; }

        .btn-loan-animal {
          margin-top: 10px; width: 100%; padding: 6px 10px;
          background: none; border: 1.5px solid #a7f3d0; border-radius: 8px;
          font-size: 12px; font-weight: 600; color: #065f46; cursor: pointer;
          font-family: inherit; transition: all .15s;
        }
        .btn-loan-animal:hover { background: #f0fdf4; border-color: #2d6a4f; }
        .btn-loan-animal--disabled {
          text-align: center; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed;
        }
        .btn-loan-animal--disabled:hover { background: none; border-color: #e5e7eb; }

        .animal-card-badge--loan { background: #fee2e2; color: #991b1b; margin-left: 6px; }

        /* ── Geliehene Tiere (Entleiher-Sicht) ── */
        .borrowed-item-row .item-status { background: #fef3c7; color: #92400e; }
        .borrowed-item-row .item-status--overdue { background: #fee2e2; color: #991b1b; }

        /* ── Animal card grid (detail view) ── */
        .animal-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
        }
        .animal-card {
          border-radius: 14px; border: 1px solid #e5e7eb; background: #fff;
          overflow: hidden; transition: box-shadow .2s, transform .2s;
          display: flex; flex-direction: column; position: relative; cursor: pointer;
        }
        .animal-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,.1); transform: translateY(-3px); }

        .animal-delete-btn {
          position: absolute; top: 8px; right: 8px; z-index: 1;
          display: flex; align-items: center; justify-content: center;
          width: 30px; height: 30px;
          background: #fee2e2; border: 1.5px solid #fca5a5; border-radius: 8px;
          color: #b91c1c; cursor: pointer; font-size: 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,.12);
          transition: background .15s, border-color .15s, transform .15s;
        }
        .animal-delete-btn:hover { background: #fecaca; border-color: #f87171; transform: scale(1.06); }
        .animal-delete-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }

        .animal-card-img-wrap {
          width: 100%; height: 180px; cursor: pointer; overflow: hidden;
          background: #f3f4f6; flex-shrink: 0;
        }
        .animal-card-img {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform .3s;
        }
        .animal-card-img-wrap:hover .animal-card-img { transform: scale(1.04); }
        .animal-card-img-placeholder {
          width: 100%; height: 100%; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 6px;
          color: #9ca3af; font-size: 32px;
        }
        .animal-card-img-hint { font-size: 11px; font-weight: 500; }
        .animal-card-img-placeholder:hover { background: #e9ecef; }

        .animal-card-body { padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .animal-card-name { font-size: 15px; font-weight: 700; color: #111827; }
        .animal-card-scientific { font-size: 12px; color: #6b7280; font-style: italic; }
        .animal-card-meta { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
        .animal-card-cat  { font-size: 12px; color: #6b7280; }
        .animal-card-loc  { font-size: 12px; color: #6b7280; }
        .animal-card-badge {
          display: inline-block; margin-top: 8px; align-self: flex-start;
          font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px;
        }

        /* ── GBIF Search ── */
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

          {/* ── Detail View ── */}
          {detail && !detailLoading && (
            <>
              <div className="page-header">
                <div>
                  <h1 className="page-title">📂 Sammlungen</h1>
                </div>
              </div>
              <CollectionDetailView
                detail={detail}
                onBack={() => {
                  setDetail(null);
                  router.push('/Sammlung', undefined, { shallow: true });
                }}
                onAnimalAdded={() => openCollection(detail.id)}
                isSignedIn={isSignedIn ?? false}
                clerkUserId={clerkUserId}
                getToken={getToken}
              />
            </>
          )}

          {detailLoading && <div className="status-msg">Sammlung wird geladen…</div>}

          {/* ── Collections Grid ── */}
          {!detail && !detailLoading && (
            <>
              <div className="page-header">
                <div>
                  <h1 className="page-title">📂 Sammlungen</h1>
                  <p className="page-sub">Öffentliche und private Sammlungen verwalten</p>
                </div>
              </div>

              <div className="toolbar">
                <div className="search-wrap">
                  <span className="search-icon">🔍</span>
                  <input type="text" className="search-input"
                    placeholder="Sammlung suchen…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {isSignedIn && (
                  <button className="btn-new" onClick={() => setShowModal(true)}>
                    + Neue Sammlung
                  </button>
                )}
              </div>

              <div className="tabs">
                <button className={`tab-btn${tab === 'public' ? ' tab-active' : ''}`} onClick={() => setTab('public')}>
                  🌍 Öffentlich <span className="tab-count">{publicCols.length}</span>
                </button>
                <button className={`tab-btn${tab === 'mine' ? ' tab-active' : ''}`} onClick={() => setTab('mine')}>
                  👤 Meine Sammlungen <span className="tab-count">{mineCols.length}</span>
                </button>
                {isSignedIn && (
                  <button className={`tab-btn${tab === 'borrowed' ? ' tab-active' : ''}`} onClick={() => setTab('borrowed')}>
                    📥 Geliehen <span className="tab-count">{borrowedItems.length}</span>
                  </button>
                )}
              </div>

              {loading && tab !== 'borrowed' && <div className="status-msg">Sammlungen werden geladen…</div>}
              {error   && tab !== 'borrowed' && <div className="error-box">⚠️ {error}</div>}

              {tab === 'borrowed' && (
                borrowedLoading ? (
                  <div className="status-msg">Geliehene Tiere werden geladen…</div>
                ) : borrowedItems.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📥</div>
                    Du hast dir aktuell keine Tiere von anderen Nutzern ausgeliehen.
                  </div>
                ) : (
                  <div className="item-list">
                    {borrowedItems.map(b => (
                      <div key={b.id} className="item-row borrowed-item-row">
                        <div className="item-row-left">
                          <span className="item-name">{b.objectName ?? `Eintrag #${b.objectId}`}</span>
                          <span className="item-date">
                            von {[b.lenderFirstName, b.lenderLastName].filter(Boolean).join(' ') || b.lenderName || '—'}
                            {' · '}bis {b.endDate ? new Date(b.endDate).toLocaleDateString('de-DE') : '—'}
                          </span>
                        </div>
                        <span className={`item-status${b.isOverdue ? ' item-status--overdue' : ''}`}>
                          {b.isOverdue ? 'überfällig' : 'aktiv'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {!loading && !error && (
                <>
                  {tab === 'public' && (
                    publicCols.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">📂</div>
                        {search ? `Keine Sammlungen für „${search}" gefunden.` : 'Keine öffentlichen Sammlungen vorhanden.'}
                      </div>
                    ) : (
                      <div className="col-grid">
                        {publicCols.map(col => (
                          <CollectionCard key={col.id} col={col} clerkUserId={clerkUserId}
                            onOpen={openCollection} onDeleted={load} />
                        ))}
                      </div>
                    )
                  )}

                  {tab === 'mine' && (
                    mineCols.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">📂</div>
                        Du hast noch keine eigenen Sammlungen. Klicke auf „+ Neue Sammlung".
                      </div>
                    ) : (
                      <>
                        {myPrivate.length > 0 && (
                          <>
                            <div className="section-header">
                              <span>🔒 Privat</span>
                              <div className="section-line" />
                              <span style={{ color: '#9ca3af', fontWeight: 400 }}>{myPrivate.length}</span>
                            </div>
                            <div className="col-grid" style={{ marginBottom: 24 }}>
                              {myPrivate
                                .filter(c => search === '' || c.name.toLowerCase().includes(search.toLowerCase()))
                                .map(col => (
                                  <CollectionCard key={col.id} col={col} clerkUserId={clerkUserId}
                                    onOpen={openCollection} onDeleted={load} />
                                ))}
                            </div>
                          </>
                        )}

                        {myPublic.length > 0 && (
                          <>
                            <div className="section-header">
                              <span>🌍 Öffentlich (meine)</span>
                              <div className="section-line" />
                              <span style={{ color: '#9ca3af', fontWeight: 400 }}>{myPublic.length}</span>
                            </div>
                            <div className="col-grid">
                              {myPublic
                                .filter(c => search === '' || c.name.toLowerCase().includes(search.toLowerCase()))
                                .map(col => (
                                  <CollectionCard key={col.id} col={col} clerkUserId={clerkUserId}
                                    onOpen={openCollection} onDeleted={load} />
                                ))}
                            </div>
                          </>
                        )}
                      </>
                    )
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
          clerkUserId={clerkUserId}
        />
      )}
    </>
  );
}
