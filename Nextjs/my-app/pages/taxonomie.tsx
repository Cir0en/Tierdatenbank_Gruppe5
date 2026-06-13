'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import Navbar from '../components/Navbar';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaxonomyEntry {
  id: number;
  parentId: number | null;
  name: string;
  rank: string | null;
  isApproved: boolean | null;
}

interface AnimalSummary {
  id: number | string;
  name: string | null;
  taxonomyId: number | null;
  status: string;
  findDate?: string | null;
  datum?: string | null;
}

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

function getRankStyle(rank: string | null) {
  return RANK_STYLES[rank ?? ''] ?? DEFAULT_STYLE;
}

function getEmoji(rank: string | null) {
  return RANK_EMOJIS[rank ?? ''] ?? '📌';
}

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

interface CreateModalProps {
  parentNode: TaxonomyEntry | null;
  onClose: () => void;
  onCreated: (entry: TaxonomyEntry) => void;
}

function CreateModal({ parentNode, onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    if (!rank)        { setError('Bitte einen Rang auswählen.'); return; }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:5099/api/taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rank,
          parentId: parentNode?.id ?? null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const created: TaxonomyEntry = await res.json();
      onCreated(created);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          🌿 Neuen Taxonomie-Eintrag anlegen
        </div>

        {parentNode && (
          <div className="modal-parent-hint">
            Untergeordnet zu: <strong>{parentNode.name}</strong>
            {parentNode.rank && ` (${parentNode.rank})`}
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Name <span className="required">*</span></label>
          <input
            type="text"
            className="form-input"
            placeholder="z. B. Arthropoda"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Rang <span className="required">*</span></label>
          <select
            className="form-select"
            value={rank}
            onChange={e => setRank(e.target.value)}
          >
            <option value="">— Rang wählen —</option>
            {RANKS.map(r => (
              <option key={r} value={r}>{getEmoji(r)} {r}</option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" disabled={saving} onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-save" disabled={saving} onClick={handleSave}>
            {saving ? '⏳ Wird gespeichert…' : '✓ Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TaxonomiePage() {
  const { isSignedIn } = useAuth();
  const [taxonomies, setTaxonomies] = useState<TaxonomyEntry[]>([]);
  const [animals, setAnimals] = useState<AnimalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [breadcrumb, setBreadcrumb] = useState<TaxonomyEntry[]>([]);
  const [showAnimals, setShowAnimals] = useState<{
    node: TaxonomyEntry;
    items: AnimalSummary[];
  } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadTaxonomies = () =>
    fetch('http://localhost:5099/api/taxonomy').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<TaxonomyEntry[]>;
    });

  // Load taxonomy + animals in parallel
  useEffect(() => {
    Promise.all([
      loadTaxonomies(),
      fetch('http://localhost:5099/api/animals/dashboard').then(r => {
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
  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;
  const visibleNodes = taxonomies.filter(t => (t.parentId ?? null) === currentParentId);

  const childCount = (nodeId: number) => taxonomies.filter(t => t.parentId === nodeId).length;

  const animalCount = (nodeId: number) => {
    const ids = getSubtreeIds(nodeId, taxonomies);
    return animals.filter(a => a.taxonomyId != null && ids.has(a.taxonomyId)).length;
  };

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

  const handleBreadcrumbNav = (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
    } else {
      setBreadcrumb(prev => prev.slice(0, index + 1));
    }
    setShowAnimals(null);
  };

  const handleCreated = (entry: TaxonomyEntry) => {
    setTaxonomies(prev => [...prev, entry]);
    setShowCreateModal(false);
    // If we're in animals-view and just created a child, go back to taxonomy view
    if (showAnimals) {
      setShowAnimals(null);
    }
  };

  // The "parent" for the create modal is the last breadcrumb entry
  const createParent = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : null;

  return (
    <>
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
          width: min(440px, 90vw);
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
            {!showAnimals && isSignedIn && (
              <button className="btn-add-entry" onClick={() => setShowCreateModal(true)}>
                + Neuer Eintrag
              </button>
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
          parentNode={createParent}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
