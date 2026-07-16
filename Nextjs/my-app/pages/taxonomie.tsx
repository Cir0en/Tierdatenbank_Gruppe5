'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import Navbar from '../components/Navbar';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ═══════════════════════════════════════════════════════════════════════════════
// Seite: /taxonomie
// Zweck: Durchsuchbarer, hierarchischer Baum der biologischen Taxonomie
//        (Reich → Stamm → Klasse → Ordnung → Familie → Gattung → Art) als
//        Kachel-Navigation. Klick auf einen Endknoten (Blatt ohne Kinder)
//        zeigt die zugeordneten Tier-Einträge. Erlaubt das Hinzufügen neuer
//        Taxonomie-Einträge per GBIF-Suche oder manueller Eingabe.
// Rollen: Lesend für alle Besucher sichtbar. Neue Einträge können nur
//        eingeloggte Nutzer anlegen (via GBIF sofort aktiv, manuelle
//        Einträge landen als Einreichung zur Moderation). Löschen von
//        Taxonomie-Knoten ist nur Moderator/Admin vorbehalten (canModerate).
// ═══════════════════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────────────────

// Ein Knoten im Taxonomie-Baum (z. B. eine Familie oder Art); parentId bildet
// die Baumstruktur ab (null = Wurzel/Reich).
interface TaxonomyEntry {
  id: number;
  parentId: number | null;
  name: string;
  rank: string | null;
  isApproved: boolean | null;
}

// Kurzform eines Tier-Eintrags, wie sie für die Zuordnung zu Taxonomie-Knoten
// benötigt wird (aus /api/animals/dashboard).
interface AnimalSummary {
  id: number | string;
  name: string | null;
  taxonomyId: number | null;
  status: string;
  findDate?: string | null;
  datum?: string | null;
}

// ── GBIF Types ─────────────────────────────────────────────────────────────────
// Typen für die Kommunikation mit der GBIF-Taxonomie-Suche im Create-Modal.

interface GbifTaxonomy {
  reich?: string;
  stamm?: string;
  klasse?: string;
  ordnung?: string;
  familie?: string;
  gattung?: string;
  art?: string;
}

interface GbifSuggestion {
  usageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  phylum?: string;
  className?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
}

interface GbifPreviewResult {
  status: 'match_found' | 'needs_confirmation';
  UsageKey?: number;
  confidence?: number;
  scientificName?: string;
  canonicalName?: string;
  taxonomy?: GbifTaxonomy;
  suggestions?: GbifSuggestion[];
}

// Schritte des Assistenten im "Neuer Eintrag"-Modal: erst Suche, dann je nach
// GBIF-Ergebnis Bestätigung eines Treffers oder Auswahl aus Vorschlägen,
// alternativ komplett manuelle Eingabe; "submitted" ist der Abschluss-Screen.
type ModalStep = 'search' | 'gbif_confirm' | 'gbif_suggestions' | 'manual' | 'submitted';

// ── Helpers ────────────────────────────────────────────────────────────────────

const RANKS = ['Reich', 'Stamm', 'Klasse', 'Ordnung', 'Familie', 'Gattung', 'Art'];

const RANK_STYLES: Record<string, { bg: string; color: string; accent: string }> = {
  Reich:   { bg: '#f5f3ff', color: '#6d28d9', accent: '#8b5cf6' },
  Stamm:   { bg: '#eff6ff', color: '#1d4ed8', accent: '#3b82f6' },
  Klasse:  { bg: '#ecfdf5', color: '#065f46', accent: '#10b981' },
  Ordnung: { bg: '#f0fdf4', color: '#166534', accent: '#22c55e' },
  Familie: { bg: '#fefce8', color: '#854d0e', accent: '#eab308' },
  Gattung: { bg: '#fff7ed', color: '#9a3412', accent: '#f97316' },
  Art:     { bg: '#fdf4ff', color: '#7e22ce', accent: '#a855f7' },
};
const DEFAULT_STYLE = { bg: '#f9fafb', color: '#374151', accent: '#6b7280' };

const RANK_EMOJIS: Record<string, string> = {
  Reich: '🌍', Stamm: '🔬', Klasse: '🧬',
  Ordnung: '📋', Familie: '🌿', Gattung: '🌱', Art: '🐾',
};

// Liefert Hintergrund-/Textfarbe für die Kachel eines Taxonomie-Rangs
// (Reich, Stamm, Klasse, …); unbekannte Ränge bekommen einen neutralen Stil.
function getRankStyle(rank: string | null) {
  return RANK_STYLES[rank ?? ''] ?? DEFAULT_STYLE;
}

// Liefert das Emoji-Icon passend zum Taxonomie-Rang.
function getEmoji(rank: string | null) {
  return RANK_EMOJIS[rank ?? ''] ?? '📌';
}

// Sammelt per Breitensuche alle Nachfahren-IDs (inkl. der Wurzel selbst) eines
// Taxonomie-Knotens. Wird benutzt, um allen Tieren einer Gruppe (z. B. einer
// Familie) auch die Tiere ihrer Unter-Ränge (Gattungen, Arten) zuzurechnen.
function getSubtreeIds(rootId: number, all: TaxonomyEntry[]): Set<number> {
  const result = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    all.filter(e => e.parentId === id).forEach(e => {
      result.add(e.id);
      queue.push(e.id);
    });
  }
  return result;
}

// Ordnet dem Freigabe-/Sichtbarkeitsstatus eines Tiers Farbe und Anzeigetext zu.
function statusBadge(status: string): { bg: string; color: string; label: string } {
  switch ((status ?? '').toLowerCase()) {
    case 'freigegeben':
    case 'aktiv':
      return { bg: '#d1fae5', color: '#065f46', label: status };
    case 'ausstehend':
      return { bg: '#fef3c7', color: '#92400e', label: 'Ausstehend' };
    case 'abgelehnt':
      return { bg: '#fee2e2', color: '#991b1b', label: 'Abgelehnt' };
    default:
      return { bg: '#f3f4f6', color: '#374151', label: status || 'Unbekannt' };
  }
}

// ── Create-Modal ───────────────────────────────────────────────────────────────

// Zeigt eine GBIF-Taxonomie als horizontale Kette von Rang-Wert-Paaren
// (Reich › Stamm › Klasse › … ), lässt fehlende Ränge einfach weg.
function TaxChain({ tax }: { tax: GbifTaxonomy }) {
  const levels = [
    { label: 'Reich',   val: tax.reich ?? 'Animalia' },
    { label: 'Stamm',   val: tax.stamm },
    { label: 'Klasse',  val: tax.klasse },
    { label: 'Ordnung', val: tax.ordnung },
    { label: 'Familie', val: tax.familie },
    { label: 'Gattung', val: tax.gattung },
    { label: 'Art',     val: tax.art },
  ].filter(l => l.val);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 0', alignItems: 'center', padding: '8px 0' }}>
      {levels.map((l, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{l.label}</span>
          <span style={{ fontSize: 13, fontStyle: 'italic', color: '#111827' }}>{l.val}</span>
          {i < levels.length - 1 && <span style={{ color: '#d1d5db', fontSize: 14, margin: '0 4px' }}>›</span>}
        </span>
      ))}
    </div>
  );
}

// Mehrstufiges Modal zum Anlegen eines neuen Taxonomie-Eintrags. Führt den
// Nutzer durch: (1) Artname eingeben und per GBIF suchen, (2a) bei
// eindeutigem Treffer direkt bestätigen, (2b) bei mehreren Kandidaten einen
// auswählen, oder (3) komplett manuell erfassen (landet als Einreichung zur
// Moderation). onSuccess(refreshTree) signalisiert dem Elternteil, ob der
// Taxonomie-Baum neu geladen werden muss (nur bei sofort aktiven GBIF-Einträgen).
function CreateModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: (refreshTree: boolean) => void;
}) {
  const { getToken } = useAuth();
  const [step, setStep] = useState<ModalStep>('search');
  const [speciesName, setSpeciesName] = useState('');
  const [searching, setSearching] = useState(false);
  const [gbifResult, setGbifResult] = useState<GbifPreviewResult | null>(null);
  const [manual, setManual] = useState({ stamm: '', klasse: '', ordnung: '', familie: '', gattung: '', art: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fragt GBIF mit dem eingegebenen Artnamen ab und schaltet je nach Ergebnis
  // zum Bestätigungs- oder Vorschlags-Schritt weiter.
  const handleSearch = async () => {
    const name = speciesName.trim();
    if (!name) { setError('Bitte einen Artnamen eingeben.'); return; }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/taxonomy/gbif?speciesName=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GbifPreviewResult = await res.json();
      setGbifResult(data);
      setStep(data.status === 'match_found' ? 'gbif_confirm' : 'gbif_suggestions');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  };

  // Übernimmt einen GBIF-Treffer/-Vorschlag per usageKey: das Backend legt
  // daraus sofort einen (bereits freigegebenen) Taxonomie-Eintrag an, daher
  // wird onSuccess(true) aufgerufen, um den Baum neu zu laden.
  const handleGbifConfirm = async (usageKey: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/taxonomy/gbif/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageKey }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      onSuccess(true);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  // Reicht eine manuell erfasste Taxonomie als Vorschlag ein (Bearer-Token-
  // Auth, da die Einreichung dem einreichenden Nutzer zugeordnet werden
  // muss). Der Eintrag ist erst nach Moderator-Freigabe sichtbar, daher wird
  // hier nur der "submitted"-Abschluss-Screen gezeigt statt der Baum neu geladen.
  const handleManualSubmit = async () => {
    const { stamm, klasse, ordnung, familie, gattung, art } = manual;
    if (!stamm.trim() || !klasse.trim() || !ordnung.trim() || !familie.trim() || !gattung.trim() || !art.trim()) {
      setError('Alle Felder sind erforderlich.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/taxonomy/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          stamm: stamm.trim(), klasse: klasse.trim(), ordnung: ordnung.trim(),
          familie: familie.trim(), gattung: gattung.trim(), art: art.trim(),
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      setStep('submitted');
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  // Kleiner Helper, der ein einzelnes Formularfeld für den manuellen
  // Eingabe-Schritt rendert (Reduziert Wiederholung für die 6 Rang-Felder unten).
  const mf = (field: keyof typeof manual, label: string, placeholder: string) => (
    <div className="form-group">
      <label className="form-label">{label} <span className="required">*</span></label>
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={manual[field]}
        onChange={e => setManual(prev => ({ ...prev, [field]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        {step === 'search' && (
          <>
            <div className="modal-title">🔍 Neue Art hinzufügen</div>
            {error && <div className="modal-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Artname (wissenschaftlich oder deutsch)</label>
              <input
                type="text"
                className="form-input"
                placeholder="z. B. Panthera leo oder Löwe"
                value={speciesName}
                onChange={e => setSpeciesName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !searching && handleSearch()}
                autoFocus
              />
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
              GBIF liefert validierte wissenschaftliche Taxonomiedaten.
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setError(null); setStep('manual'); }}>Manuell eintragen</button>
              <button className="btn-save" onClick={handleSearch} disabled={searching}>
                {searching ? '⏳ Suche läuft…' : '🔍 GBIF suchen'}
              </button>
            </div>
          </>
        )}

        {step === 'gbif_confirm' && gbifResult?.taxonomy && (
          <>
            <div className="modal-title">✅ Vorgeschlagene Taxonomie übernehmen?</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              GBIF-Übereinstimmung für <em>„{speciesName}"</em>
              {gbifResult.confidence != null && (
                <span style={{ marginLeft: 8, background: '#d1fae5', color: '#065f46', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                  {gbifResult.confidence}% Konfidenz
                </span>
              )}
            </div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <TaxChain tax={gbifResult.taxonomy} />
            </div>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setError(null); setStep('manual'); }}>Manuell eintragen</button>
              <button className="btn-save" onClick={() => gbifResult.UsageKey && handleGbifConfirm(gbifResult.UsageKey)} disabled={saving}>
                {saving ? '⏳ Wird übernommen…' : '✅ Taxonomie übernehmen'}
              </button>
            </div>
          </>
        )}

        {step === 'gbif_suggestions' && (
          <>
            <div className="modal-title">🔎 Meintest du…?</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              Keine eindeutige Übereinstimmung für <em>„{speciesName}"</em>. Bitte wähle einen Vorschlag:
            </div>
            {gbifResult?.suggestions && gbifResult.suggestions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
                {gbifResult.suggestions.filter(s => s.usageKey).map(s => {
                  const tax: GbifTaxonomy = {
                    stamm: s.phylum, klasse: s.className, ordnung: s.order,
                    familie: s.family, gattung: s.genus,
                    art: s.species ?? s.canonicalName ?? s.scientificName,
                  };
                  return (
                    <button
                      key={s.usageKey}
                      disabled={saving}
                      onClick={() => handleGbifConfirm(s.usageKey!)}
                      style={{
                        background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 8,
                        padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#6ee7b7')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', fontStyle: 'italic', marginBottom: 4 }}>
                        {s.canonicalName ?? s.scientificName}
                      </div>
                      <TaxChain tax={tax} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>Keine Vorschläge verfügbar.</div>
            )}
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setError(null); setStep('search'); }}>← Zurück</button>
              <button className="btn-save" style={{ background: '#6b7280' }} onClick={() => { setError(null); setStep('manual'); }}>Manuell eintragen</button>
            </div>
          </>
        )}

        {step === 'manual' && (
          <>
            <div className="modal-title">✏️ Manuelle Eingabe</div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              Dieser Eintrag wird zur Prüfung eingereicht und erst nach Freigabe durch einen Moderator für alle sichtbar.
            </div>
            <div className="form-group">
              <label className="form-label">Reich</label>
              <input className="form-input" value="Animalia" disabled style={{ background: '#f3f4f6', color: '#9ca3af' }} />
            </div>
            {mf('stamm',   'Stamm',   'z. B. Chordata')}
            {mf('klasse',  'Klasse',  'z. B. Mammalia')}
            {mf('ordnung', 'Ordnung', 'z. B. Carnivora')}
            {mf('familie', 'Familie', 'z. B. Felidae')}
            {mf('gattung', 'Gattung', 'z. B. Panthera')}
            {mf('art',     'Art',     'z. B. Panthera leo')}
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setError(null); setStep('search'); }}>← Zurück</button>
              <button className="btn-save" onClick={handleManualSubmit} disabled={saving}>
                {saving ? '⏳ Wird eingereicht…' : '📋 Zur Prüfung einreichen'}
              </button>
            </div>
          </>
        )}

        {step === 'submitted' && (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Eintrag eingereicht</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                Dein Taxonomie-Vorschlag wurde zur Prüfung eingereicht.<br />
                Nach Freigabe durch einen Moderator ist er für alle sichtbar.
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-save" onClick={() => onSuccess(false)}>Schließen</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

// Hauptkomponente der Taxonomie-Seite: verwaltet den Baum-Navigationszustand
// (Breadcrumb), lädt Taxonomie- und Tierdaten, und stellt Aktionen zum
// Anlegen/Löschen von Taxonomie-Einträgen bereit.
export default function TaxonomiePage() {
  const { isSignedIn, getToken, userId: clerkId } = useAuth();
  const [taxonomies, setTaxonomies] = useState<TaxonomyEntry[]>([]);
  const [animals, setAnimals] = useState<AnimalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('Nutzer');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Navigation state
  const [breadcrumb, setBreadcrumb] = useState<TaxonomyEntry[]>([]);
  const [showAnimals, setShowAnimals] = useState<{
    node: TaxonomyEntry;
    items: AnimalSummary[];
  } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Lädt den kompletten (flachen) Taxonomie-Baum vom Backend; wird sowohl
  // beim initialen Laden als auch nach dem Anlegen eines neuen Eintrags aufgerufen.
  const loadTaxonomies = () =>
    fetch(`${API}/api/taxonomy`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<TaxonomyEntry[]>;
    });

  // Fetch role
  // Lädt die Rolle des eingeloggten Nutzers per Bearer-Token, um zu
  // entscheiden, ob Löschen-Buttons (canModerate) angezeigt werden.
  useEffect(() => {
    if (!clerkId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setUserRole(data.role ?? 'Nutzer');
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [clerkId, getToken]);

  // Load taxonomy + animals in parallel
  // Initiales Laden von Taxonomie-Baum und Tierliste (einmalig beim Mount);
  // beide werden gebraucht, um pro Taxonomie-Knoten die Tieranzahl zu berechnen.
  useEffect(() => {
    Promise.all([
      loadTaxonomies(),
      fetch(`${API}/api/animals/dashboard`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([tax, anim]) => {
        setTaxonomies(tax);
        setAnimals(anim);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Which node is currently active
  // Der zuletzt angeklickte Breadcrumb-Eintrag bestimmt die aktuelle Ebene;
  // visibleNodes sind alle direkten Kinder dieses Knotens (null = oberste Ebene/Reich).
  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;
  const visibleNodes = taxonomies.filter(t => (t.parentId ?? null) === currentParentId);

  // Anzahl direkter Unter-Knoten (für die "X Untergruppen"-Anzeige auf der Kachel).
  const childCount = (nodeId: number) => taxonomies.filter(t => t.parentId === nodeId).length;

  // Anzahl Tiere, die diesem Knoten ODER einem seiner Nachfahren zugeordnet
  // sind (nutzt getSubtreeIds, damit z. B. eine Familie alle Tiere ihrer Arten mitzählt).
  const animalCount = (nodeId: number) => {
    const ids = getSubtreeIds(nodeId, taxonomies);
    return animals.filter(a => a.taxonomyId != null && ids.has(a.taxonomyId)).length;
  };

  // Navigiert in den Baum hinein: hat der Knoten Kinder, wird nur der
  // Breadcrumb erweitert (nächste Kachel-Ebene wird angezeigt); ist es ein
  // Blattknoten (keine Kinder mehr, z. B. eine Art), werden stattdessen die
  // zugeordneten Tiere geladen und die Tierliste angezeigt.
  const handleNodeClick = (node: TaxonomyEntry) => {
    const hasChildren = taxonomies.some(t => t.parentId === node.id);
    if (hasChildren) {
      setBreadcrumb(prev => [...prev, node]);
      setShowAnimals(null);
    } else {
      const ids = getSubtreeIds(node.id, taxonomies);
      const items = animals.filter(a => a.taxonomyId != null && ids.has(a.taxonomyId));
      setBreadcrumb(prev => [...prev, node]);
      setShowAnimals({ node, items });
    }
  };

  // Springt beim Klick auf einen Breadcrumb-Eintrag zurück auf diese Ebene
  // (index < 0 = zurück zur Wurzel "Alle Taxa") und verlässt die Tieransicht.
  const handleBreadcrumbNav = (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
    } else {
      setBreadcrumb(prev => prev.slice(0, index + 1));
    }
    setShowAnimals(null);
  };

  // Nur Moderator/Admin dürfen Taxonomie-Knoten löschen (steuert die
  // Sichtbarkeit des Löschen-Buttons auf den Kacheln).
  const canModerate = userRole === 'Moderator' || userRole === 'Admin';

  // Löscht einen Taxonomie-Knoten nach Bestätigungsdialog. Befindet sich der
  // gelöschte Knoten am Ende des aktuellen Breadcrumbs, wird eine Ebene
  // zurücknavigiert, damit die Ansicht konsistent bleibt.
  const handleDelete = async (e: React.MouseEvent, node: TaxonomyEntry) => {
    e.stopPropagation();
    setDeleteError(null);
    if (!confirm(`„${node.name}" (${node.rank}) wirklich löschen?`)) return;
    try {
      const res = await fetch(`${API}/api/taxonomy/${node.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        setDeleteError(text || `Fehler ${res.status}`);
        return;
      }
      setTaxonomies(prev => prev.filter(t => t.id !== node.id));
      if (breadcrumb[breadcrumb.length - 1]?.id === node.id) {
        setBreadcrumb(prev => prev.slice(0, -1));
        setShowAnimals(null);
      }
    } catch (err: any) {
      setDeleteError(err.message);
    }
  };

  // Schließt das Create-Modal und lädt bei Bedarf (refreshTree=true, also nur
  // bei sofort aktiven GBIF-Einträgen) den Taxonomie-Baum neu, damit der neue
  // Knoten direkt sichtbar wird.
  const handleModalSuccess = async (refreshTree: boolean) => {
    setShowCreateModal(false);
    if (refreshTree) {
      try {
        const tax = await loadTaxonomies();
        setTaxonomies(tax);
      } catch {}
    }
  };

  return (
    <>
      {/* Komponenten-Styling (CSS-in-JS) für die gesamte Seite; Abschnitte sind unten mit „── ── " markiert. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f9fa; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: #202124; }

        .app-layout   { display: flex; height: 100vh; overflow: hidden; }
        .main-content { flex: 1; background: #fff; padding: 40px; display: flex; flex-direction: column; overflow-y: auto; }

        /* ── Header ── */
        .page-header  { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; gap: 16px; }
        .page-header-left {}
        .page-title   { font-size: 26px; font-weight: 600; color: #1a2f1a; letter-spacing: -0.02em; }
        .page-sub     { font-size: 13px; color: #6b7280; margin-top: 4px; }

        .btn-add-entry {
          display: flex; align-items: center; gap: 7px; white-space: nowrap;
          padding: 9px 18px; background: #2d6a4f; color: #fff;
          border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
          flex-shrink: 0;
        }
        .btn-add-entry:hover { background: #1b4332; }
        .add-entry-hint {
          display: flex; align-items: center; gap: 7px; white-space: nowrap;
          padding: 9px 16px; background: #f8f9fa; color: #6b7280;
          border: 1px dashed #d1d5db; border-radius: 8px; font-size: 12px;
          flex-shrink: 0;
        }
        .add-entry-hint a { color: #2d6a4f; font-weight: 600; text-decoration: none; }
        .add-entry-hint a:hover { text-decoration: underline; }

        /* ── Breadcrumb ── */
        .breadcrumb {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          margin-bottom: 28px; font-size: 13px;
        }
        .bc-btn {
          background: none; border: none; cursor: pointer; font-size: 13px;
          font-family: inherit; padding: 4px 8px; border-radius: 6px;
          color: #2d6a4f; font-weight: 500; transition: background .15s;
        }
        .bc-btn:hover { background: #f0fdf4; }
        .bc-btn.bc-root { color: #6b7280; font-weight: 400; }
        .bc-sep { color: #d1d5db; font-size: 14px; }
        .bc-current { color: #1a2f1a; font-weight: 600; padding: 4px 8px; }

        /* ── Taxonomy grid ── */
        .tax-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 16px;
        }

        .tax-card {
          border: 1.5px solid #e5e7eb; border-radius: 14px;
          background: #fff; overflow: hidden; cursor: pointer;
          transition: box-shadow .2s, transform .2s, border-color .2s;
          display: flex; flex-direction: column;
        }
        .tax-card:hover {
          box-shadow: 0 6px 20px rgba(0,0,0,.1);
          transform: translateY(-3px);
          border-color: #a7f3d0;
        }

        .tax-card-header {
          height: 68px; display: flex; align-items: center; justify-content: center;
          font-size: 32px; flex-shrink: 0; position: relative;
        }
        .tax-card-rank {
          position: absolute; top: 8px; right: 8px;
          font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 99px;
          text-transform: uppercase; letter-spacing: .06em;
        }

        .tax-card-delete {
          position: absolute; top: 8px; left: 8px;
          background: rgba(255,255,255,0.85); border: none; border-radius: 6px;
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          font-size: 14px; cursor: pointer; opacity: 0; transition: opacity .15s;
          z-index: 1;
        }
        .tax-card:hover .tax-card-delete { opacity: 1; }
        .tax-card-delete:hover { background: #fee2e2; }

        .tax-card-body { padding: 12px 14px 14px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .tax-card-name { font-size: 15px; font-weight: 600; color: #1a1a1a; line-height: 1.3; }
        .tax-card-stats {
          display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; padding-top: 6px;
        }
        .tax-stat {
          font-size: 11px; color: #6b7280; display: flex; align-items: center; gap: 4px;
        }
        .tax-stat-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* ── Animals view ── */
        .animals-header {
          display: flex; align-items: center; gap: 16px; margin-bottom: 24px;
        }
        .back-btn {
          display: flex; align-items: center; gap: 6px;
          background: #f0fdf4; border: 1.5px solid #a7f3d0; border-radius: 8px;
          padding: 7px 14px; font-size: 13px; font-weight: 500; color: #065f46;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .back-btn:hover { background: #dcfce7; }
        .animals-title { font-size: 20px; font-weight: 600; color: #1a1a1a; }
        .animals-sub   { font-size: 13px; color: #6b7280; margin-top: 2px; }

        .animal-list { display: flex; flex-direction: column; gap: 10px; }
        .animal-row {
          display: flex; align-items: center; justify-content: space-between;
          border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px;
          background: #fff; transition: box-shadow .15s;
        }
        .animal-row:hover { box-shadow: 0 2px 10px rgba(0,0,0,.07); }
        .animal-row-left { display: flex; flex-direction: column; gap: 3px; }
        .animal-name  { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .animal-date  { font-size: 12px; color: #9ca3af; }
        .status-chip  { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }

        .empty-state {
          text-align: center; padding: 60px 20px; color: #9ca3af; font-size: 14px;
          border: 1.5px dashed #e5e7eb; border-radius: 12px;
        }
        .empty-icon { font-size: 40px; margin-bottom: 12px; opacity: .5; }

        .status-msg { text-align: center; padding: 60px; color: #6b7280; font-size: 15px; }
        .error-box  {
          text-align: center; padding: 32px; border: 1px dashed #fca5a5;
          border-radius: 12px; background: #fff5f5; color: #b91c1c; font-size: 14px;
        }

        /* ── Modal ── */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.4);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal {
          background: #fff; border-radius: 14px; padding: 28px;
          width: min(480px, 90vw); max-height: 90vh; overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0,0,0,.18);
        }
        .modal-title {
          font-size: 17px; font-weight: 700; color: #1a1a1a;
          margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #f0f0f0;
        }
        .modal-parent-hint {
          font-size: 12px; background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; color: #065f46;
        }
        .modal-error {
          font-size: 12px; color: #b91c1c; background: #fef2f2;
          border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px;
        }
        .form-group { margin-bottom: 14px; }
        .form-label {
          display: block; font-size: 11px; font-weight: 600; color: #5f6368;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px;
        }
        .required { color: #ea4335; }
        .form-input, .form-select {
          width: 100%; padding: 9px 11px; border-radius: 8px;
          border: 1px solid #e5e7eb; font-size: 13px; color: #202124;
          font-family: inherit; outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .form-input:focus, .form-select:focus {
          border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,.12);
        }
        .form-select { cursor: pointer; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; padding-top: 16px; border-top: 1px solid #f1f3f4; }
        .btn-cancel {
          padding: 8px 18px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; font-size: 13px; color: #5f6368; cursor: pointer;
          font-weight: 500; font-family: inherit; transition: background .15s;
        }
        .btn-cancel:hover:not(:disabled) { background: #f8f9fa; }
        .btn-save {
          padding: 8px 20px; border-radius: 8px; border: none;
          background: #2d6a4f; color: #fff; font-size: 13px;
          font-weight: 600; cursor: pointer; font-family: inherit;
          transition: background .15s;
        }
        .btn-save:hover:not(:disabled) { background: #1b4332; }
        .btn-cancel:disabled, .btn-save:disabled { opacity: .6; cursor: not-allowed; }
      `}</style>

      <div className="app-layout">
        <Navbar activeNav="taxonomie" />

        <main className="main-content">
          {/* Header */}
          <div className="page-header">
            <div className="page-header-left">
              <h1 className="page-title">🌿 Taxonomie</h1>
              <p className="page-sub">Hierarchische Klassifizierung der erfassten Arten</p>
            </div>
            {!showAnimals && (
              isSignedIn ? (
                <button className="btn-add-entry" onClick={() => setShowCreateModal(true)}>
                  + Neuer Eintrag
                </button>
              ) : (
                // Nicht eingeloggte Besucher können keine Taxonomien anlegen — statt den Button
                // kommentarlos zu verstecken, erklären, warum, und direkt zum Login verlinken.
                <span className="add-entry-hint">
                  🔒 <Link href="/login">Anmelden</Link>, um neue Einträge hinzuzufügen
                </span>
              )
            )}
          </div>

          {/* Breadcrumb */}
          <div className="breadcrumb">
            <button
              className="bc-btn bc-root"
              onClick={() => { setBreadcrumb([]); setShowAnimals(null); }}
            >
              Alle Taxa
            </button>
            {breadcrumb.map((node, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <span key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="bc-sep">›</span>
                  {isLast && !showAnimals ? (
                    <span className="bc-current">{node.name}</span>
                  ) : (
                    <button className="bc-btn" onClick={() => handleBreadcrumbNav(i)}>
                      {node.name}
                    </button>
                  )}
                </span>
              );
            })}
            {showAnimals && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="bc-sep">›</span>
                <span className="bc-current">Tiere</span>
              </span>
            )}
          </div>

          {/* Delete error banner */}
          {deleteError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠ {deleteError}</span>
              <button onClick={() => setDeleteError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16, padding: '0 4px' }}>✕</button>
            </div>
          )}

          {/* Loading / Error */}
          {loading && <div className="status-msg">Taxonomie wird geladen…</div>}
          {error   && (
            <div className="error-box">
              <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
              {error}
            </div>
          )}

          {/* Animals view */}
          {!loading && !error && showAnimals && (
            <div>
              <div className="animals-header">
                <button
                  className="back-btn"
                  onClick={() => {
                    setBreadcrumb(prev => prev.slice(0, -1));
                    setShowAnimals(null);
                  }}
                >
                  ← Zurück
                </button>
                <div>
                  <div className="animals-title">
                    {getEmoji(showAnimals.node.rank)} {showAnimals.node.name}
                  </div>
                  <div className="animals-sub">
                    {showAnimals.items.length === 0
                      ? 'Keine Tiere in dieser Gruppe erfasst'
                      : `${showAnimals.items.length} Tier${showAnimals.items.length !== 1 ? 'e' : ''} erfasst`}
                  </div>
                </div>
              </div>

              {showAnimals.items.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🐾</div>
                  Für <strong>{showAnimals.node.name}</strong> wurden noch keine Tiere erfasst.<br />
                  Weise Tiere dieser Art in der Sammlung zu.
                </div>
              ) : (
                <div className="animal-list">
                  {showAnimals.items.map(a => {
                    const badge = statusBadge(a.status);
                    const date = a.findDate ?? a.datum;
                    return (
                      <div key={a.id} className="animal-row">
                        <div className="animal-row-left">
                          <div className="animal-name">{a.name ?? `Tier #${a.id}`}</div>
                          {date && <div className="animal-date">Funddatum: {date}</div>}
                        </div>
                        <span className="status-chip" style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Taxonomy grid */}
          {!loading && !error && !showAnimals && (
            <>
              {visibleNodes.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🌿</div>
                  {breadcrumb.length === 0
                    ? 'Noch keine Taxonomie-Einträge vorhanden. Klicke auf „+ Neuer Eintrag".'
                    : 'Diese Gruppe hat noch keine Untergruppen. Klicke auf „+ Neuer Eintrag".'}
                </div>
              ) : (
                <div className="tax-grid">
                  {visibleNodes.map(node => {
                    const style = getRankStyle(node.rank);
                    const emoji = getEmoji(node.rank);
                    const children = childCount(node.id);
                    const animals_ = animalCount(node.id);

                    return (
                      <div
                        key={node.id}
                        className="tax-card"
                        onClick={() => handleNodeClick(node)}
                        title={node.rank ? `${node.rank}: ${node.name}` : node.name}
                      >
                        <div className="tax-card-header" style={{ background: style.bg }}>
                          <span style={{ fontSize: 34 }}>{emoji}</span>
                          {node.rank && (
                            <span
                              className="tax-card-rank"
                              style={{ background: style.accent + '22', color: style.color }}
                            >
                              {node.rank}
                            </span>
                          )}
                          {canModerate && node.name !== 'Animalia' && (
                            <button
                              className="tax-card-delete"
                              onClick={e => handleDelete(e, node)}
                              title="Eintrag löschen"
                            >
                              🗑
                            </button>
                          )}
                        </div>

                        <div className="tax-card-body">
                          <div className="tax-card-name">{node.name}</div>
                          <div className="tax-card-stats">
                            {children > 0 && (
                              <span className="tax-stat">
                                <span className="tax-stat-dot" style={{ background: style.accent }} />
                                {children} Untergruppe{children !== 1 ? 'n' : ''}
                              </span>
                            )}
                            <span className="tax-stat">
                              <span className="tax-stat-dot" style={{ background: '#2d6a4f' }} />
                              {animals_} Tier{animals_ !== 1 ? 'e' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
}
