'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';

const API = 'http://localhost:5099';

type TabId = 'submissions' | 'requests' | 'reports';

interface Submission {
  id: number;
  reich: string;
  stamm: string;
  klasse: string;
  ordnung: string;
  familie: string;
  gattung: string;
  art: string;
  source: string;
  status: string;
  createdAt: string;
}

interface ReviewModal {
  submission: Submission;
  action: 'approve' | 'reject';
}

function SubmissionRow({ sub, onApprove, onReject }: {
  sub: Submission;
  onApprove: (sub: Submission) => void;
  onReject:  (sub: Submission) => void;
}) {
  return (
    <div className="sub-row">
      <div className="sub-icon">🌿</div>
      <div className="sub-info">
        <div className="sub-title">Neuer Taxonomie-Eintrag: <strong>{sub.art}</strong></div>
        <div className="sub-tax">
          {sub.gattung} · {sub.familie} · {sub.ordnung} · {sub.klasse}
        </div>
        <div className="sub-meta">
          Eingereicht am {new Date(sub.createdAt).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric'
          })}
          {sub.source === 'manual' ? ' · Manuell' : ' · GBIF'}
        </div>
      </div>
      <div className="sub-actions">
        <button className="btn-approve" onClick={() => onApprove(sub)}>Prüfen</button>
        <button className="btn-reject"  onClick={() => onReject(sub)}>Ablehnen</button>
      </div>
    </div>
  );
}

function ReviewDialog({ modal, onClose, onDone }: {
  modal: ReviewModal;
  onClose: () => void;
  onDone:  (id: number, action: 'approve' | 'reject') => void;
}) {
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const { submission, action } = modal;

  const handle = async () => {
    setSaving(true);
    setError(null);
    try {
      const endpoint = action === 'approve'
        ? `${API}/api/taxonomy/submissions/${submission.id}/approve`
        : `${API}/api/taxonomy/submissions/${submission.id}/reject`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moderatorNote: note }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      onDone(submission.id, action);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  const isApprove = action === 'approve';

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            {isApprove ? '✅ Taxonomie freigeben' : '❌ Taxonomie ablehnen'}
          </span>
          <button className="modal-close" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="modal-body">
          <div className="tax-detail-grid">
            <div className="tax-row"><span className="tax-key">Art</span><span className="tax-val">{submission.art}</span></div>
            <div className="tax-row"><span className="tax-key">Gattung</span><span className="tax-val">{submission.gattung}</span></div>
            <div className="tax-row"><span className="tax-key">Familie</span><span className="tax-val">{submission.familie}</span></div>
            <div className="tax-row"><span className="tax-key">Ordnung</span><span className="tax-val">{submission.ordnung}</span></div>
            <div className="tax-row"><span className="tax-key">Klasse</span><span className="tax-val">{submission.klasse}</span></div>
            <div className="tax-row"><span className="tax-key">Stamm</span><span className="tax-val">{submission.stamm}</span></div>
            <div className="tax-row"><span className="tax-key">Reich</span><span className="tax-val">{submission.reich}</span></div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <label className="note-label">
            Moderatorennotiz {isApprove ? '(optional)' : '(empfohlen)'}
          </label>
          <textarea
            className="note-input"
            placeholder={isApprove ? 'Anmerkung zur Freigabe…' : 'Grund für Ablehnung…'}
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className="modal-footer">
          <button className="btn-cancel-md" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button
            className={isApprove ? 'btn-do-approve' : 'btn-do-reject'}
            onClick={handle}
            disabled={saving}
          >
            {saving ? '⏳ Wird verarbeitet…' : isApprove ? '✅ Freigeben' : '❌ Ablehnen'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ModeratorPage() {
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [tab, setTab]             = useState<TabId>('submissions');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [modal, setModal]         = useState<ReviewModal | null>(null);

  const currentRole = (user?.publicMetadata?.role as string) ?? '';

  useEffect(() => {
    if (isSignedIn === false) { router.replace('/login'); return; }
    if (isSignedIn && currentRole && currentRole !== 'Moderator' && currentRole !== 'Admin') {
      router.replace('/');
    }
  }, [isSignedIn, currentRole, router]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/taxonomy/submissions/pending`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmissions(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  const handleDone = (id: number) => {
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setModal(null);
  };

  if (!isSignedIn || (currentRole !== 'Moderator' && currentRole !== 'Admin')) return null;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'submissions', label: 'Objekte zur Prüfung', count: submissions.length },
    { id: 'requests',    label: 'Benutzeranfragen' },
    { id: 'reports',     label: 'Berichte' },
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #f8f9fa; font-family: 'Inter', system-ui, sans-serif; font-size: 13px; overflow: hidden; }

        .app-shell { display: flex; height: 100vh; overflow: hidden; }
        .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        /* Top bar */
        .topbar {
          height: 56px; display: flex; align-items: center; padding: 0 24px;
          background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; gap: 12px;
        }
        .topbar-title { font-size: 16px; font-weight: 700; color: #111827; }
        .topbar-badge {
          padding: 3px 10px; border-radius: 99px; background: #dbeafe;
          color: #1e40af; font-size: 11px; font-weight: 600;
        }

        /* Content */
        .content { flex: 1; overflow-y: auto; padding: 24px; }

        /* Tabs */
        .tab-bar {
          display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 20px;
        }
        .tab-btn {
          padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent;
          font-size: 13px; font-weight: 500; color: #6b7280; cursor: pointer;
          font-family: inherit; margin-bottom: -2px; transition: color .15s, border-color .15s;
          display: flex; align-items: center; gap: 8px;
        }
        .tab-btn:hover { color: #111827; }
        .tab-btn.active { color: #059669; border-bottom-color: #059669; }
        .tab-count {
          background: #d1fae5; color: #065f46; padding: 1px 7px;
          border-radius: 99px; font-size: 11px; font-weight: 600;
        }
        .tab-count--empty { background: #f3f4f6; color: #9ca3af; }

        /* Submission list */
        .sub-list { display: flex; flex-direction: column; gap: 12px; }
        .sub-row {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 16px 20px; display: flex; align-items: center; gap: 16px;
          transition: box-shadow .15s;
        }
        .sub-row:hover { box-shadow: 0 2px 12px rgba(0,0,0,.06); }
        .sub-icon {
          width: 52px; height: 52px; border-radius: 10px; background: #d1fae5;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; flex-shrink: 0;
        }
        .sub-info { flex: 1; min-width: 0; }
        .sub-title { font-size: 13px; font-weight: 500; color: #111827; margin-bottom: 3px; }
        .sub-tax   { font-size: 12px; color: #6b7280; margin-bottom: 3px; font-style: italic; }
        .sub-meta  { font-size: 11px; color: #9ca3af; }
        .sub-actions { display: flex; gap: 8px; flex-shrink: 0; }

        /* Buttons */
        .btn-approve {
          padding: 8px 18px; border-radius: 7px; border: none;
          background: #059669; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .btn-approve:hover { background: #047857; }
        .btn-reject {
          padding: 8px 14px; border-radius: 7px; border: 1px solid #e5e7eb;
          background: #fff; color: #6b7280; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .btn-reject:hover { border-color: #fca5a5; color: #dc2626; background: #fff5f5; }

        /* Empty state */
        .empty-state {
          text-align: center; padding: 60px 20px; color: #9ca3af;
        }
        .empty-icon { font-size: 48px; margin-bottom: 12px; }
        .empty-text { font-size: 14px; }

        /* Placeholder tab content */
        .placeholder-tab {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 60px; text-align: center; color: #9ca3af; font-size: 13px;
        }

        /* Error */
        .error-banner {
          padding: 10px 16px; background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; color: #b91c1c; font-size: 12px; margin-bottom: 16px;
        }

        /* Modal */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.45);
          z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .modal {
          background: #fff; border-radius: 14px; width: min(520px, 100%);
          display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,.2);
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 22px 16px; border-bottom: 1px solid #f0f0f0;
        }
        .modal-title { font-size: 15px; font-weight: 700; color: #111827; }
        .modal-close {
          background: none; border: none; font-size: 16px; color: #9ca3af;
          cursor: pointer; padding: 2px 6px; border-radius: 4px;
        }
        .modal-close:hover:not(:disabled) { background: #f3f4f6; }
        .modal-body { padding: 20px 22px; }
        .modal-footer {
          display: flex; gap: 10px; justify-content: flex-end;
          padding: 14px 22px 18px; border-top: 1px solid #f0f0f0;
        }

        .tax-detail-grid { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
        .tax-row { display: flex; gap: 12px; align-items: baseline; }
        .tax-key { font-size: 11px; font-weight: 600; color: #6b7280; width: 72px; flex-shrink: 0; text-transform: uppercase; letter-spacing: .04em; }
        .tax-val { font-size: 13px; color: #111827; font-style: italic; }

        .modal-error { margin-bottom: 14px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #b91c1c; font-size: 12px; }

        .note-label { display: block; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
        .note-input { width: 100%; padding: 8px 12px; border-radius: 7px; border: 1px solid #e5e7eb; font-size: 13px; font-family: inherit; resize: vertical; outline: none; }
        .note-input:focus { border-color: #6ee7b7; }

        .btn-cancel-md {
          padding: 8px 18px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; color: #374151; font-size: 13px; cursor: pointer; font-family: inherit;
        }
        .btn-do-approve {
          padding: 8px 20px; border-radius: 8px; border: none;
          background: #059669; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .btn-do-approve:hover:not(:disabled) { background: #047857; }
        .btn-do-reject {
          padding: 8px 20px; border-radius: 8px; border: none;
          background: #dc2626; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .btn-do-reject:hover:not(:disabled) { background: #b91c1c; }
        .btn-cancel-md:disabled, .btn-do-approve:disabled, .btn-do-reject:disabled { opacity: .6; cursor: not-allowed; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #d1fae5; border-radius: 2px; }
      `}</style>

      <div className="app-shell">
        <Navbar activeNav="moderator" />

        <div className="main-area">
          <header className="topbar">
            <span className="topbar-title">Moderator Bereich</span>
            <span className="topbar-badge">Moderation</span>
          </header>

          <main className="content">
            {error && <div className="error-banner">{error}</div>}

            {/* Tabs */}
            <div className="tab-bar">
              {tabs.map(t => (
                <button
                  key={t.id}
                  className={`tab-btn${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.count !== undefined && (
                    <span className={`tab-count${t.count === 0 ? ' tab-count--empty' : ''}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'submissions' && (
              loading ? (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, textAlign: 'center' }}>Wird geladen…</div>
              ) : submissions.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <div className="empty-text">Keine ausstehenden Einträge — alles erledigt!</div>
                </div>
              ) : (
                <>
                  <div className="sub-list">
                    {submissions.map(sub => (
                      <SubmissionRow
                        key={sub.id}
                        sub={sub}
                        onApprove={s => setModal({ submission: s, action: 'approve' })}
                        onReject={s  => setModal({ submission: s, action: 'reject'  })}
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: 12, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                    {submissions.length} Einträge ausstehend · Alle anzeigen
                  </div>
                </>
              )
            )}

            {tab === 'requests' && (
              <div className="placeholder-tab">
                Benutzeranfragen werden hier angezeigt.<br />
                <span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>Noch nicht implementiert</span>
              </div>
            )}

            {tab === 'reports' && (
              <div className="placeholder-tab">
                Berichte und Statistiken werden hier angezeigt.<br />
                <span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>Noch nicht implementiert</span>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Review modal */}
      {modal && (
        <ReviewDialog
          modal={modal}
          onClose={() => setModal(null)}
          onDone={id => handleDone(id)}
        />
      )}
    </>
  );
}
