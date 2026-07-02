'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';

const API = 'http://localhost:5099';

// ═══════════════════════════════════════════════════════════════════════════
// Seite: /moderator
// Zweck: Interner Arbeitsbereich für Moderatoren/Admins. Zwei Tabs:
//        1) "Taxonomie-Prüfung": Liste ausstehender Taxonomie-Einreichungen
//           mit Freigabe-/Ablehnen-Workflow (inkl. Moderatorennotiz).
//        2) "Berichte": Kennzahlen-Dashboard (Taxonomie-, Sammlungs- und
//           Leihe-Statistiken sowie eine Nutzer-Aktivitätstabelle).
// Rollen: Nur für Rolle "Moderator" oder "Admin" zugänglich — die Rolle wird
//        aus den Clerk publicMetadata gelesen; andere Nutzer (inkl. Gäste)
//        werden per Redirect umgeleitet (siehe useEffect weiter unten).
// ═══════════════════════════════════════════════════════════════════════════

type TabId = 'submissions' | 'reports';

// Aggregierte Kennzahlen für den "Berichte"-Tab, wie vom Backend
// (/api/stats/moderator) geliefert.
interface ModStats {
  taxonomy: { taxPending: number; taxApproved: number; taxRejected: number; taxThisMonth: number };
  collection: { colTotal: number; colFreigegeben: number; colAusstehend: number; colAbgelehnt: number };
  loans: { loansTotal: number; loansActive: number; loansOverdue: number };
  overview: { taxTotal: number; taxSpecies: number };
  recentDecisions: { id: number; art: string; gattung: string; status: string; moderatorNote: string | null; reviewedAt: string }[];
}

// Zeile der Nutzer-Aktivitätstabelle im Berichte-Tab (/api/stats/moderator/users).
interface UserActivity {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string | null;
  createdAt: string | null;
  taxPending: number;
  taxApproved: number;
  taxRejected: number;
  loansActive: number;
  loansOverdue: number;
  lastSubmission: string | null;
}

// Eine ausstehende Taxonomie-Einreichung (manuell oder via GBIF-Vorschlag).
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

// Zustand des Freigabe-/Ablehnen-Dialogs: welche Einreichung und welche Aktion.
interface ReviewModal {
  submission: Submission;
  action: 'approve' | 'reject';
}

// Einzeilige Darstellung einer ausstehenden Taxonomie-Einreichung mit
// "Prüfen"/"Ablehnen"-Buttons, die den ReviewDialog öffnen.
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

// Modal zum Freigeben/Ablehnen einer Taxonomie-Einreichung inkl. optionaler
// bzw. empfohlener Moderatorennotiz (bei Ablehnung sollte ein Grund angegeben werden).
function ReviewDialog({ modal, onClose, onDone }: {
  modal: ReviewModal;
  onClose: () => void;
  onDone:  (id: number, action: 'approve' | 'reject') => void;
}) {
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const { submission, action } = modal;

  // Sendet die Entscheidung (approve/reject) mit Notiz ans Backend. Der
  // Endpunkt wird abhängig von der gewählten Aktion dynamisch ausgewählt.
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

// Hauptkomponente der Moderator-Seite: regelt den Rollen-Zugriffsschutz,
// lädt Einreichungen sowie Berichtsdaten je nach aktivem Tab, und verwaltet
// den Freigabe-/Ablehnen-Dialog.
export default function ModeratorPage() {
  const { user } = useUser();
  const { isSignedIn, getToken } = useAuth();
  const router = useRouter();

  const [tab, setTab]               = useState<TabId>('submissions');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [modal, setModal]           = useState<ReviewModal | null>(null);
  const [stats, setStats]           = useState<ModStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);

  // Rolle wird aus den Clerk publicMetadata gelesen (nicht per Backend-Call);
  // steht clientseitig sofort zur Verfügung und dient hier nur der Zugriffskontrolle.
  const currentRole = (user?.publicMetadata?.role as string) ?? '';

  // Zugriffsschutz: nicht eingeloggte Nutzer werden zum Login geschickt,
  // eingeloggte Nutzer ohne Moderator-/Admin-Rolle zur Startseite.
  useEffect(() => {
    if (isSignedIn === false) { router.replace('/login'); return; }
    if (isSignedIn && currentRole && currentRole !== 'Moderator' && currentRole !== 'Admin') {
      router.replace('/');
    }
  }, [isSignedIn, currentRole, router]);

  // Lädt die Liste ausstehender Taxonomie-Einreichungen (öffentlicher
  // Endpunkt, kein Auth-Header nötig — die Seite selbst ist aber geschützt).
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

  // Lädt die Berichtsdaten (Statistiken + Nutzer-Aktivität) für den
  // "Berichte"-Tab. Nutzt hier Bearer-Token-Auth (getToken()), da die
  // Stats-Endpunkte serverseitig die Moderator-/Admin-Rolle verifizieren müssen.
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API}/api/stats/moderator`, { headers }),
        fetch(`${API}/api/stats/moderator/users`, { headers }),
      ]);
      if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);
      setStats(await statsRes.json());
      if (usersRes.ok) setUserActivity(await usersRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStatsLoading(false);
    }
  }, [getToken]);

  // Lädt die Berichtsdaten erst, wenn der Nutzer tatsächlich auf den
  // "Berichte"-Tab wechselt (lazy loading), und nur einmal (solange `stats` gesetzt ist).
  useEffect(() => {
    if (tab === 'reports' && !stats) fetchStats();
  }, [tab, stats, fetchStats]);

  // Entfernt die bearbeitete Einreichung optimistisch aus der lokalen Liste
  // und schließt den Dialog, sobald Freigabe/Ablehnung erfolgreich war.
  const handleDone = (id: number) => {
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setModal(null);
  };

  // Rendert nichts, solange der Redirect (siehe useEffect oben) noch nicht
  // gegriffen hat bzw. für Nutzer ohne passende Rolle.
  if (!isSignedIn || (currentRole !== 'Moderator' && currentRole !== 'Admin')) return null;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'submissions', label: 'Taxonomie-Prüfung', count: submissions.length },
    { id: 'reports',     label: 'Berichte' },
  ];

  return (
    <>
      {/* Komponenten-Styling (CSS-in-JS) für die gesamte Seite. */}
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

        /* ── Reports ── */
        .reports-wrap { display: flex; flex-direction: column; gap: 20px; }
        .report-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
        .report-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 18px 16px; text-align: center;
        }
        .rc-value { font-size: 32px; font-weight: 700; color: #111827; line-height: 1; }
        .rc-green  { color: #059669; }
        .rc-red    { color: #dc2626; }
        .rc-label  { font-size: 12px; font-weight: 600; color: #374151; margin-top: 6px; }
        .rc-sub    { font-size: 10px; color: #9ca3af; margin-top: 2px; }

        .reports-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .report-section {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px;
        }
        .rs-title { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 12px; letter-spacing: .03em; }
        .rs-row {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12px; color: #6b7280; padding: 4px 0;
          border-bottom: 1px solid #f3f4f6; gap: 8px;
        }
        .rs-row:last-of-type { border-bottom: none; }
        .rs-row strong { color: #111827; font-weight: 600; }
        .rs-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .rs-dot--green { background: #059669; }
        .rs-dot--amber { background: #d97706; }
        .rs-dot--red   { background: #dc2626; }
        .rs-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #f3f4f6; margin-top: 12px; }
        .rs-bar-fill { height: 100%; transition: width .3s; }
        .rs-bar--green { background: #059669; }
        .rs-bar--amber { background: #d97706; }
        .rs-bar--red   { background: #dc2626; }

        .rd-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .rd-row:last-child { border-bottom: none; }
        .rd-badge { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .rd-badge--green { background: #d1fae5; color: #059669; }
        .rd-badge--red   { background: #fee2e2; color: #dc2626; }
        .rd-name  { font-size: 12px; font-weight: 600; color: #111827; font-style: italic; }
        .rd-note  { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .rd-date  { font-size: 11px; color: #9ca3af; flex-shrink: 0; white-space: nowrap; }

        /* ── User activity table ── */
        .ua-table { display: flex; flex-direction: column; margin-top: 10px; font-size: 12px; }
        .ua-head, .ua-row {
          display: grid;
          grid-template-columns: 2fr 1fr repeat(5, 60px) 1fr;
          gap: 8px; align-items: center; padding: 7px 4px;
        }
        .ua-head { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
        .ua-row { border-bottom: 1px solid #f3f4f6; }
        .ua-row:last-child { border-bottom: none; }
        .ua-row:hover { background: #f9fafb; border-radius: 6px; }
        .ua-user { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .ua-avatar { width: 28px; height: 28px; border-radius: 50%; background: #d1fae5; color: #065f46; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ua-name { display: flex; flex-direction: column; min-width: 0; }
        .ua-name strong { font-size: 12px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ua-name span { font-size: 10px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ua-role { padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; }
        .ua-role--admin     { background: #fef3c7; color: #92400e; }
        .ua-role--moderator { background: #dbeafe; color: #1e40af; }
        .ua-role--nutzer    { background: #f3f4f6; color: #6b7280; }
        .ua-num { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; border-radius: 99px; font-size: 11px; font-weight: 700; padding: 0 5px; }
        .ua-num--green { background: #d1fae5; color: #059669; }
        .ua-num--amber { background: #fef3c7; color: #d97706; }
        .ua-num--red   { background: #fee2e2; color: #dc2626; }
        .ua-zero { color: #d1d5db; }
        .ua-date { font-size: 11px; color: #6b7280; }

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

            {tab === 'reports' && (
              statsLoading ? (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, textAlign: 'center' }}>Wird geladen…</div>
              ) : !stats ? (
                <div className="empty-state"><div className="empty-icon">📊</div><div className="empty-text">Keine Daten verfügbar</div></div>
              ) : (
                <div className="reports-wrap">
                  {/* Stat cards row */}
                  <div className="report-cards">
                    <div className="report-card">
                      <div className="rc-value">{stats.taxonomy.taxPending}</div>
                      <div className="rc-label">Ausstehend</div>
                      <div className="rc-sub">Taxonomie-Einreichungen</div>
                    </div>
                    <div className="report-card">
                      <div className="rc-value rc-green">{stats.taxonomy.taxApproved}</div>
                      <div className="rc-label">Freigegeben</div>
                      <div className="rc-sub">Taxonomien gesamt</div>
                    </div>
                    <div className="report-card">
                      <div className="rc-value rc-red">{stats.taxonomy.taxRejected}</div>
                      <div className="rc-label">Abgelehnt</div>
                      <div className="rc-sub">Taxonomie-Einreichungen</div>
                    </div>
                    <div className="report-card">
                      <div className="rc-value">{stats.taxonomy.taxThisMonth}</div>
                      <div className="rc-label">Bearbeitet</div>
                      <div className="rc-sub">Diesen Monat</div>
                    </div>
                  </div>

                  <div className="reports-grid">
                    {/* Sammlung */}
                    <div className="report-section">
                      <div className="rs-title">🗂 Sammlungsobjekte</div>
                      <div className="rs-row"><span>Gesamt</span><strong>{stats.collection.colTotal}</strong></div>
                      <div className="rs-row"><span className="rs-dot rs-dot--green" />Freigegeben<strong>{stats.collection.colFreigegeben}</strong></div>
                      <div className="rs-row"><span className="rs-dot rs-dot--amber" />Ausstehend<strong>{stats.collection.colAusstehend}</strong></div>
                      <div className="rs-row"><span className="rs-dot rs-dot--red" />Abgelehnt<strong>{stats.collection.colAbgelehnt}</strong></div>
                      <div className="rs-bar">
                        <div className="rs-bar-fill rs-bar--green" style={{ width: stats.collection.colTotal ? `${(stats.collection.colFreigegeben / stats.collection.colTotal) * 100}%` : '0%' }} />
                        <div className="rs-bar-fill rs-bar--amber" style={{ width: stats.collection.colTotal ? `${(stats.collection.colAusstehend / stats.collection.colTotal) * 100}%` : '0%' }} />
                        <div className="rs-bar-fill rs-bar--red"   style={{ width: stats.collection.colTotal ? `${(stats.collection.colAbgelehnt  / stats.collection.colTotal) * 100}%` : '0%' }} />
                      </div>
                    </div>

                    {/* Ausleihen */}
                    <div className="report-section">
                      <div className="rs-title">⇄ Ausleihen</div>
                      <div className="rs-row"><span>Gesamt</span><strong>{stats.loans.loansTotal}</strong></div>
                      <div className="rs-row"><span className="rs-dot rs-dot--green" />Aktiv<strong>{stats.loans.loansActive}</strong></div>
                      <div className="rs-row"><span className="rs-dot rs-dot--red" />Überfällig<strong>{stats.loans.loansOverdue}</strong></div>
                    </div>

                    {/* Taxonomie-Datenbank */}
                    <div className="report-section">
                      <div className="rs-title">🌿 Taxonomie-Datenbank</div>
                      <div className="rs-row"><span>Einträge gesamt</span><strong>{stats.overview.taxTotal}</strong></div>
                      <div className="rs-row"><span>Davon Arten (Art)</span><strong>{stats.overview.taxSpecies}</strong></div>
                    </div>
                  </div>

                  {/* Nutzer-Aktivität */}
                  {userActivity.length > 0 && (
                    <div className="report-section">
                      <div className="rs-title">👥 Nutzer-Aktivität</div>
                      <div className="ua-table">
                        <div className="ua-head">
                          <span>Nutzer</span>
                          <span>Rolle</span>
                          <span style={{ textAlign: 'center' }}>Eingereicht</span>
                          <span style={{ textAlign: 'center' }}>Genehmigt</span>
                          <span style={{ textAlign: 'center' }}>Abgelehnt</span>
                          <span style={{ textAlign: 'center' }}>Leihen</span>
                          <span style={{ textAlign: 'center' }}>Überfällig</span>
                          <span>Letzte Einreichung</span>
                        </div>
                        {userActivity.map(u => {
                          const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
                          const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                          return (
                            <div key={u.id} className="ua-row">
                              <span className="ua-user">
                                <span className="ua-avatar">{initials}</span>
                                <span className="ua-name">
                                  <strong>{name}</strong>
                                  <span>{u.email}</span>
                                </span>
                              </span>
                              <span><span className={`ua-role ua-role--${(u.role ?? 'nutzer').toLowerCase()}`}>{u.role ?? 'Nutzer'}</span></span>
                              <span style={{ textAlign: 'center' }}>{u.taxPending > 0 ? <span className="ua-num ua-num--amber">{u.taxPending}</span> : <span className="ua-zero">—</span>}</span>
                              <span style={{ textAlign: 'center' }}>{u.taxApproved > 0 ? <span className="ua-num ua-num--green">{u.taxApproved}</span> : <span className="ua-zero">—</span>}</span>
                              <span style={{ textAlign: 'center' }}>{u.taxRejected > 0 ? <span className="ua-num ua-num--red">{u.taxRejected}</span> : <span className="ua-zero">—</span>}</span>
                              <span style={{ textAlign: 'center' }}>{u.loansActive > 0 ? <span className="ua-num">{u.loansActive}</span> : <span className="ua-zero">—</span>}</span>
                              <span style={{ textAlign: 'center' }}>{u.loansOverdue > 0 ? <span className="ua-num ua-num--red">{u.loansOverdue}</span> : <span className="ua-zero">—</span>}</span>
                              <span className="ua-date">{u.lastSubmission ? new Date(u.lastSubmission).toLocaleDateString('de-DE') : <span className="ua-zero">—</span>}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Letzte Entscheidungen */}
                  {stats.recentDecisions.length > 0 && (
                    <div className="report-section" style={{ marginTop: 0 }}>
                      <div className="rs-title">🕐 Letzte Entscheidungen</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                        {stats.recentDecisions.map(d => (
                          <div key={d.id} className="rd-row">
                            <span className={`rd-badge ${d.status === 'approved' ? 'rd-badge--green' : 'rd-badge--red'}`}>
                              {d.status === 'approved' ? '✓' : '✕'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="rd-name">{d.art} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({d.gattung})</span></div>
                              {d.moderatorNote && <div className="rd-note">„{d.moderatorNote}"</div>}
                            </div>
                            <div className="rd-date">{d.reviewedAt ? new Date(d.reviewedAt).toLocaleDateString('de-DE') : '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
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
