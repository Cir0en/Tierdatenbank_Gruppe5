'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import Navbar from '../components/Navbar';

// ── Typen ─────────────────────────────────────────────────────────────────────

interface Animal {
  id: number;
  name: string | null;
  status: string | null;
  findDate: string | null;
  sex: string | null;
  ageClass: string | null;
  description: string | null;
  bodyMassGram: number | null;
  bodyLengthMm: number | null;
}

interface NewAnimalForm {
  name: string;
  description: string;
  findDate: string;
  sex: string;
  ageClass: string;
  bodyMassGram: string;
  bodyLengthMm: string;
}

const FORM_INITIAL: NewAnimalForm = {
  name: '',
  description: '',
  findDate: '',
  sex: 'Unbekannt',
  ageClass: '',
  bodyMassGram: '',
  bodyLengthMm: '',
};

// ── Hilfsfunktion: Status → CSS-Klasse ────────────────────────────────────────

function badgeClass(status: string | null): string {
  switch ((status ?? '').toLowerCase()) {
    case 'ausstehend': return 'badge-ausstehend';
    case 'aktiv':      return 'badge-aktiv';
    case 'archiviert': return 'badge-archiviert';
    default:           return 'badge-default';
  }
}

// ── AnimalCard: memo verhindert Re-Render wenn die Liste sich nicht ändert ────

const AnimalCard = memo(function AnimalCard({ animal }: { animal: Animal }) {
  return (
    <div className="animal-card">
      <div className="card-id">#{animal.id}</div>
      <div className="card-title">{animal.name ?? '—'}</div>
      {animal.description  && <div className="card-detail">{animal.description}</div>}
      {animal.findDate     && <div className="card-detail">Funddatum: {animal.findDate}</div>}
      {animal.sex          && <div className="card-detail">Geschlecht: {animal.sex}</div>}
      {animal.ageClass     && <div className="card-detail">Altersklasse: {animal.ageClass}</div>}
      {animal.bodyLengthMm && <div className="card-detail">Länge: {animal.bodyLengthMm} mm</div>}
      {animal.bodyMassGram && <div className="card-detail">Gewicht: {animal.bodyMassGram} g</div>}
      <span className={`badge ${badgeClass(animal.status)}`}>
        {animal.status ?? 'Unbekannt'}
      </span>
    </div>
  );
});

// ── AnimalModal: eigener State-Scope → Re-Renders bleiben im Modal ─────────────
// Eltern-Component (SammlungPage) wird bei Formularänderungen NICHT neu gerendert.

interface ModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AnimalModal({ onClose, onSaved }: ModalProps) {
  const [form, setForm]       = useState<NewAnimalForm>(FORM_INITIAL);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setField = (field: keyof NewAnimalForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setSaveError('Bitte einen Artnamen eingeben.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    const payload = {
      name:         form.name.trim(),
      description:  form.description.trim() || null,
      findDate:     form.findDate || null,
      sex:          form.sex === 'Unbekannt' ? null : form.sex,
      ageClass:     form.ageClass || null,
      bodyMassGram: form.bodyMassGram ? parseFloat(form.bodyMassGram) : null,
      bodyLengthMm: form.bodyLengthMm ? parseFloat(form.bodyLengthMm) : null,
      status:       'ausstehend',
    };

    try {
      const res = await fetch('http://localhost:5099/api/animals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      onSaved(); // Liste in der Eltern-Komponente neu laden
    } catch (err) {
      setSaveError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">🐾 Neues Tier erfassen</div>

        {saveError && <div className="modal-error">{saveError}</div>}

        {/* Artname – Pflichtfeld */}
        <div className="form-group">
          <label className="form-label">
            Artname <span className="required">*</span>
          </label>
          <input
            type="text"
            className={`form-input${!form.name && saveError ? ' input-error' : ''}`}
            placeholder="z. B. Papilio machaon"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </div>

        {/* Beschreibung */}
        <div className="form-group">
          <label className="form-label">Beschreibung</label>
          <textarea
            className="form-textarea"
            placeholder="Kurze Beschreibung des Fundes…"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
        </div>

        {/* Funddatum */}
        <div className="form-group">
          <label className="form-label">Funddatum</label>
          <input
            type="date"
            className="form-input"
            value={form.findDate}
            onChange={(e) => setField('findDate', e.target.value)}
          />
        </div>

        {/* Geschlecht: native radio inputs für sofortige Reaktion ohne Re-Render der Seite */}
        <div className="form-group">
          <label className="form-label">Geschlecht</label>
          <div className="radio-group">
            {(['Männlich', 'Weiblich', 'Unbekannt'] as const).map((g) => (
              <label key={g} className="radio-label">
                <input
                  type="radio"
                  name="sex"
                  value={g}
                  checked={form.sex === g}
                  onChange={() => setField('sex', g)}
                />
                {g === 'Männlich' ? '♂ Männlich' : g === 'Weiblich' ? '♀ Weiblich' : '◉ Unbekannt'}
              </label>
            ))}
          </div>
        </div>

        {/* Altersklasse */}
        <div className="form-group">
          <label className="form-label">Altersklasse</label>
          <select
            className="form-select"
            value={form.ageClass}
            onChange={(e) => setField('ageClass', e.target.value)}
          >
            <option value="">— nicht angegeben —</option>
            <option value="Juvenile">Juvenil (Jungtier)</option>
            <option value="Subadult">Subadult</option>
            <option value="Adult">Adult (Erwachsen)</option>
            <option value="Senior">Senior</option>
          </select>
        </div>

        {/* Körpermasse + Körperlänge nebeneinander */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Körpermasse</label>
            <div className="input-unit-wrap">
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                className="form-input input-unit"
                value={form.bodyMassGram}
                onChange={(e) => setField('bodyMassGram', e.target.value)}
              />
              <span className="unit-label">g</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Körperlänge</label>
            <div className="input-unit-wrap">
              <input
                type="number" min="0" step="0.1" placeholder="0.0"
                className="form-input input-unit"
                value={form.bodyLengthMm}
                onChange={(e) => setField('bodyLengthMm', e.target.value)}
              />
              <span className="unit-label">mm</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" disabled={saving} onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-save" disabled={saving} onClick={handleSave}>
            {saving ? '⏳ Wird gespeichert…' : '💾 Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────────
// Verwaltet nur: Tierliste, Suchbegriff und ob das Modal offen ist.
// Formular-State lebt komplett in AnimalModal.

export default function SammlungPage() {
  const [animals, setAnimals]       = useState<Animal[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);

  const loadAnimals = useCallback(() => {
    setLoading(true);
    fetch('http://localhost:5099/api/animals')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Animal[]) => { setAnimals(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => { loadAnimals(); }, [loadAnimals]);

  // Nach erfolgreichem Speichern: Modal schließen + Liste neu laden
  const handleSaved = useCallback(() => {
    setShowModal(false);
    loadAnimals();
  }, [loadAnimals]);

  const filtered = animals.filter((a) =>
    (a.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.status ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f9fa; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: #202124; }

        .app-layout   { display: flex; height: 100vh; overflow: hidden; }
        .main-content { flex: 1; background: #fff; padding: 40px; display: flex; flex-direction: column; overflow-y: auto; }

        .header      { margin-bottom: 32px; }
        .breadcrumbs { font-size: 12px; font-weight: 500; color: #70757a; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px; }
        .page-title  { font-size: 28px; font-weight: 500; color: #202124; letter-spacing: -0.02em; }

        .toolbar     { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
        .search-wrap { position: relative; width: min(400px, 100%); }
        .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; color: #70757a; pointer-events: none; }
        .search-input {
          width: 100%; background: #fff; border: 1px solid #dadce0; border-radius: 6px;
          padding: 12px 15px 12px 40px; font-family: inherit; font-size: 14px; color: #202124;
          outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .search-input:focus        { border-color: #1a73e8; box-shadow: 0 0 0 1px #1a73e8; }
        .search-input::placeholder { color: #70757a; }

        .btn-add {
          white-space: nowrap; padding: 0 20px; height: 44px;
          background: #1a73e8; color: #fff; border: none; border-radius: 6px;
          font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
          transition: background .2s;
        }
        .btn-add:hover { background: #1558b0; }

        .animal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .animal-card {
          border: 1px solid #dadce0; border-radius: 8px; padding: 20px;
          background: #fff; transition: box-shadow .2s ease, transform .2s ease;
          display: flex; flex-direction: column; gap: 6px;
        }
        .animal-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); transform: translateY(-2px); }

        .card-id     { font-size: 11px; color: #80868b; }
        .card-title  { font-size: 16px; font-weight: 600; color: #202124; }
        .card-detail { font-size: 13px; color: #5f6368; }

        .badge            { display: inline-block; font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 4px; margin-top: 6px; }
        .badge-ausstehend { background: #fef7e0; color: #b06000; }
        .badge-aktiv      { background: #e6f4ea; color: #137333; }
        .badge-archiviert { background: #f1f3f4; color: #5f6368; }
        .badge-default    { background: #e8f0fe; color: #1a73e8; }

        .status-message { text-align: center; padding: 48px; color: #70757a; font-size: 15px; }
        .error-message  { text-align: center; padding: 48px; color: #c5221f; font-size: 15px; border: 1px dashed #f28b82; border-radius: 8px; }
        .empty-state    { grid-column: 1 / -1; text-align: center; padding: 48px; color: #70757a; border: 1px dashed #dadce0; border-radius: 8px; }

        /* ── Modal ── */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.4);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal {
          background: #fff; border-radius: 12px; padding: 28px;
          width: min(480px, 90vw); max-height: 90vh; overflow-y: auto;
          box-shadow: 0 8px 30px rgba(0,0,0,.2);
        }
        .modal-title {
          font-size: 18px; font-weight: 600; color: #202124;
          margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #e0e0e0;
        }

        .form-group { margin-bottom: 14px; }
        .form-row   { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .form-row .form-group { margin-bottom: 0; }

        .form-label {
          display: block; font-size: 11px; font-weight: 600; color: #5f6368;
          text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px;
        }
        .required { color: #ea4335; }

        .form-input, .form-select, .form-textarea {
          width: 100%; padding: 9px 11px; border-radius: 6px;
          border: 1px solid #dadce0; font-size: 13px; color: #202124;
          font-family: inherit; outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,.1);
        }
        .form-input.input-error { border-color: #ea4335; }
        .form-textarea { resize: vertical; min-height: 68px; }
        .form-select   { cursor: pointer; }

        .input-unit-wrap { position: relative; display: flex; align-items: center; }
        .input-unit      { padding-right: 30px !important; }
        .unit-label      { position: absolute; right: 10px; font-size: 11px; color: #9aa0a6; pointer-events: none; }

        /* Native radio inputs mit custom Styling */
        .radio-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .radio-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: #202124; cursor: pointer;
          background: #f8f9fa; border: 1px solid #dadce0;
          border-radius: 20px; padding: 5px 12px;
          transition: all .15s; user-select: none;
        }
        .radio-label:hover { border-color: #1a73e8; background: #e8f0fe; }
        /* Input verstecken – Label-Styling übernimmt das visuelle Feedback */
        .radio-label input[type="radio"] {
          appearance: none; -webkit-appearance: none;
          position: absolute; opacity: 0; width: 0; height: 0;
        }
        .radio-label:has(input:checked) {
          background: #e8f0fe; border-color: #1a73e8; color: #1a73e8; font-weight: 500;
        }

        .modal-error {
          font-size: 12px; color: #c5221f; background: #fce8e6;
          padding: 8px 10px; border-radius: 4px; margin-bottom: 12px;
        }

        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f1f3f4; }
        .btn-cancel {
          padding: 8px 18px; border-radius: 6px; border: 1px solid #dadce0;
          background: #fff; font-size: 13px; color: #5f6368; cursor: pointer;
          font-weight: 500; font-family: inherit; transition: background .15s;
        }
        .btn-cancel:hover:not(:disabled) { background: #f1f3f4; }
        .btn-save {
          padding: 8px 20px; border-radius: 6px; border: none;
          background: #1a73e8; color: #fff; font-size: 13px;
          font-weight: 600; cursor: pointer; font-family: inherit;
          transition: background .15s;
        }
        .btn-save:hover:not(:disabled) { background: #1558b0; }
        .btn-save:disabled, .btn-cancel:disabled { opacity: .6; cursor: not-allowed; }
      `}</style>

      <div className="app-layout">
        <Navbar activeNav="sammlungen" />

        <main className="main-content">
          <header className="header">
            <div className="breadcrumbs">Übersicht / Sammlung</div>
            <h1 className="page-title">Sammlung</h1>
          </header>

          <div className="toolbar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Suche nach Name oder Status…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="btn-add" onClick={() => setShowModal(true)}>
              + Tier hinzufügen
            </button>
          </div>

          {loading && <div className="status-message">Lade Tiere…</div>}
          {error   && <div className="error-message">Fehler beim Laden: {error}</div>}

          {!loading && !error && (
            <div className="animal-grid">
              {filtered.length > 0
                ? filtered.map((a) => <AnimalCard key={a.id} animal={a} />)
                : (
                  <div className="empty-state">
                    {searchTerm
                      ? `Keine Tiere für „${searchTerm}" gefunden.`
                      : 'Noch keine Einträge vorhanden.'}
                  </div>
                )
              }
            </div>
          )}
        </main>
      </div>

      {/* Modal wird nur gerendert wenn es offen ist */}
      {showModal && (
        <AnimalModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
