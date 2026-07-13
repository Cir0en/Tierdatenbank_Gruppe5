// Route /export: "Einstellungen"-Seite (Profil-Übersicht, CSV-Export der eigenen
// Sammlung, Sprachwahl und Konto-Löschung/Gefahrenzone). Trotz des Dateinamens
// "export" enthält diese Seite die komplette Nutzer-Einstellungen-UI; der
// CSV-Export ist nur einer von mehreren Bereichen.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth, useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import { useLanguage, type Lang } from '../contexts/LanguageContext';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

interface UserProfile {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string | null;
  institution: string | null;
  createdAt: string | null;
}

export default function EinstellungenPage() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  const { t, lang, setLang } = useLanguage();
  const s = t.settings;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Kann CSV-Daten importieren: nur Moderator/Admin, analog zur Backend-Prüfung in
  // AnimalsController.ImportCsv (GetModOrAdminAsync).
  const canImport = profile?.role === 'Admin' || profile?.role === 'Moderator';

  // Lädt eine ausgewählte CSV-Datei zum Import-Endpunkt hoch (gleiches Spaltenformat wie
  // der Export) und zeigt danach an, wie viele Zeilen importiert/übersprungen wurden.
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // erlaubt erneuten Upload derselben Datei
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API}/api/animals/import/csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      setImportResult(await res.json());
    } catch (e: any) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  };

  // Lädt die gesamte Sammlung als CSV-Datei herunter: ruft den Export-Endpunkt
  // auf, wandelt die Antwort in einen Blob um und stößt darüber einen
  // client-seitigen Datei-Download mit datiertem Dateinamen an.
  const handleCsvDownload = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/animals/export/csv`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sammlung_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  };
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Schützt die Seite client-seitig: nicht angemeldete Nutzer werden zum Login geschickt
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/login');
  }, [isLoaded, isSignedIn, router]);

  // Lädt das eigene Nutzerprofil (Rolle, Institution, Registrierungsdatum, ...)
  // aus der Datenbank, sobald der Nutzer angemeldet ist.
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setProfile(await res.json());
      } catch {}
    })();
  }, [isSignedIn, getToken]);

  // Löscht das eigene Konto endgültig (nur möglich nach Eingabe des Bestätigungs-
  // Schlüsselworts "LÖSCHEN"). Meldet den Nutzer bei Erfolg über Clerk ab und
  // leitet zur Login-Seite weiter.
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'LÖSCHEN') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/users/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fehler ${res.status}`);
      }
      await signOut();
      router.replace('/login');
    } catch (e: any) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  // Anzeigename mit Fallback-Kette (Clerk-Vollname -> Vorname -> DB-Username) und
  // daraus abgeleitete Initialen für den Avatar
  const displayName = user?.fullName ?? user?.firstName ?? profile?.username ?? '—';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  if (!isLoaded || !isSignedIn) return null;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #f8f9fa; font-family: 'Inter', system-ui, sans-serif; font-size: 13px; overflow: hidden; }
        .app-shell { display: flex; height: 100vh; overflow: hidden; }
        .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
        .topbar { height: 56px; display: flex; align-items: center; padding: 0 24px; background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; gap: 12px; }
        .topbar-title { font-size: 16px; font-weight: 700; color: #111827; }
        .content { flex: 1; overflow-y: auto; padding: 28px 32px; }

        .settings-wrap { max-width: 620px; display: flex; flex-direction: column; gap: 20px; }

        .card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;
        }
        .card-head {
          padding: 16px 20px; border-bottom: 1px solid #f3f4f6;
          font-size: 13px; font-weight: 700; color: #111827;
        }
        .card-body { padding: 20px; }

        /* Profile */
        .profile-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
        .profile-avatar {
          width: 56px; height: 56px; border-radius: 50%; background: #d1fae5; color: #065f46;
          font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .profile-name { font-size: 16px; font-weight: 700; color: #111827; }
        .profile-email { font-size: 12px; color: #6b7280; margin-top: 2px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .info-item label { display: block; font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .info-item span { font-size: 13px; color: #374151; }
        .role-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
        .role-badge--admin     { background: #fef3c7; color: #92400e; }
        .role-badge--moderator { background: #dbeafe; color: #1e40af; }
        .role-badge--nutzer    { background: #f3f4f6; color: #6b7280; }

        /* Danger zone */
        .card--danger { border-color: #fecaca; }
        .card-head--danger { background: #fff5f5; color: #b91c1c; border-bottom-color: #fecaca; }
        .danger-text { font-size: 13px; color: #374151; line-height: 1.6; margin-bottom: 16px; }
        .btn-open-delete {
          padding: 9px 18px; border-radius: 8px; border: 1px solid #fca5a5;
          background: #fff; color: #dc2626; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .btn-open-delete:hover { background: #fee2e2; }

        /* Export */
        .export-desc { font-size: 13px; color: #374151; line-height: 1.6; margin-bottom: 16px; }
        .export-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn-export {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 8px; border: 1px solid #d1d5db;
          background: #fff; color: #374151; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all .15s; text-decoration: none;
        }
        .btn-export:hover { border-color: #059669; color: #059669; background: #f0fdf4; }
        .btn-export:disabled { opacity: .5; cursor: not-allowed; }

        /* Import */
        .import-result { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 12px; }
        .import-error-list { margin: 8px 0 0; padding-left: 18px; color: #92400e; }
        .import-error-list li { margin-bottom: 2px; }

        /* Language selector */
        .lang-label { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
        .lang-options { display: flex; gap: 10px; }
        .lang-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; color: #374151; font-size: 13px; cursor: pointer;
          font-family: inherit; transition: all .15s;
        }
        .lang-btn:hover { border-color: #6ee7b7; }
        .lang-btn--active { border-color: #059669; background: #f0fdf4; color: #065f46; font-weight: 600; }
        .lang-flag { font-size: 18px; line-height: 1; }

        /* Delete dialog overlay */
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.45);
          z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .dialog {
          background: #fff; border-radius: 14px; width: min(460px, 100%);
          box-shadow: 0 12px 40px rgba(0,0,0,.2); overflow: hidden;
        }
        .dialog-head {
          padding: 18px 22px 14px; border-bottom: 1px solid #fecaca;
          background: #fff5f5; display: flex; justify-content: space-between; align-items: center;
        }
        .dialog-title { font-size: 15px; font-weight: 700; color: #b91c1c; }
        .dialog-close { background: none; border: none; font-size: 18px; color: #9ca3af; cursor: pointer; }
        .dialog-body { padding: 20px 22px; }
        .dialog-warn { font-size: 13px; color: #374151; line-height: 1.6; margin-bottom: 16px; }
        .dialog-warn strong { color: #b91c1c; }
        .confirm-label { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block; }
        .confirm-input {
          width: 100%; padding: 9px 12px; border: 1px solid #e5e7eb; border-radius: 8px;
          font-size: 13px; font-family: inherit; outline: none;
        }
        .confirm-input:focus { border-color: #fca5a5; }
        .dialog-error { margin-top: 10px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #b91c1c; font-size: 12px; }
        .dialog-foot { padding: 14px 22px 18px; border-top: 1px solid #f3f4f6; display: flex; justify-content: flex-end; gap: 10px; }
        .btn-cancel {
          padding: 8px 18px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; color: #374151; font-size: 13px; cursor: pointer; font-family: inherit;
        }
        .btn-delete-confirm {
          padding: 8px 20px; border-radius: 8px; border: none;
          background: #dc2626; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .btn-delete-confirm:disabled { opacity: .5; cursor: not-allowed; }
        .btn-delete-confirm:not(:disabled):hover { background: #b91c1c; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #d1fae5; border-radius: 2px; }
      `}</style>

      <div className="app-shell">
        <Navbar activeNav="export" />

        <div className="main-area">
          <header className="topbar">
            <span className="topbar-title">{s.title}</span>
          </header>

          <main className="content">
            <div className="settings-wrap">

              {/* Profil-Karte */}
              <div className="card">
                <div className="card-head">{s.profile}</div>
                <div className="card-body">
                  <div className="profile-row">
                    <div className="profile-avatar">{initials}</div>
                    <div>
                      <div className="profile-name">{displayName}</div>
                      <div className="profile-email">{profile?.email ?? user?.emailAddresses[0]?.emailAddress ?? '—'}</div>
                    </div>
                  </div>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>{s.username}</label>
                      <span>{profile?.username ?? '—'}</span>
                    </div>
                    <div className="info-item">
                      <label>{s.role}</label>
                      <span>
                        <span className={`role-badge role-badge--${(profile?.role ?? 'nutzer').toLowerCase()}`}>
                          {profile?.role ?? t.common.roles.nutzer}
                        </span>
                      </span>
                    </div>
                    <div className="info-item">
                      <label>{s.institution}</label>
                      <span>{profile?.institution ?? '—'}</span>
                    </div>
                    <div className="info-item">
                      <label>{s.registeredSince}</label>
                      <span>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE') : '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Export */}
              <div className="card">
                <div className="card-head">📤 {s.exportTitle}</div>
                <div className="card-body">
                  <p className="export-desc">
                    {s.exportDesc}
                  </p>
                  <div className="export-row">
                    <button className="btn-export" onClick={handleCsvDownload} disabled={exporting}>
                      {exporting ? s.exportBtnBusy : s.exportBtn}
                    </button>
                  </div>
                </div>
              </div>

              {/* Import (nur Moderator/Admin) */}
              {canImport && (
                <div className="card">
                  <div className="card-head">📥 {s.importTitle}</div>
                  <div className="card-body">
                    <p className="export-desc">
                      {s.importDesc}
                    </p>
                    <div className="export-row">
                      <button
                        className="btn-export"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                      >
                        {importing ? s.importBtnBusy : s.importBtn}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: 'none' }}
                        onChange={handleCsvImport}
                      />
                    </div>
                    {importError && <div className="dialog-error" style={{ marginTop: 14 }}>{importError}</div>}
                    {importResult && (
                      <div className="import-result">
                        {importResult.imported} Objekt(e) importiert, {importResult.skipped} Zeile(n) übersprungen.
                        {importResult.errors.length > 0 && (
                          <ul className="import-error-list">
                            {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sprache */}
              <div className="card">
                <div className="card-head">{s.languageSection}</div>
                <div className="card-body">
                  <p className="lang-label">{s.languageLabel}</p>
                  <div className="lang-options">
                    {(['de', 'en'] as Lang[]).map(l => (
                      <button
                        key={l}
                        className={`lang-btn${lang === l ? ' lang-btn--active' : ''}`}
                        onClick={() => setLang(l)}
                      >
                        <span className="lang-flag">{l === 'de' ? '🇩🇪' : '🇬🇧'}</span>
                        {l === 'de' ? s.german : s.english}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Gefahrenzone */}
              <div className="card card--danger">
                <div className="card-head card-head--danger">{s.dangerZone}</div>
                <div className="card-body">
                  <p className="danger-text">{s.deleteWarning}</p>
                  <button className="btn-open-delete" onClick={() => setShowDeleteDialog(true)}>
                    {s.deleteAccount}
                  </button>
                </div>
              </div>

            </div>
          </main>
        </div>
      </div>

      {/* Bestätigungs-Dialog */}
      {showDeleteDialog && (
        <div className="overlay" onClick={() => !deleting && setShowDeleteDialog(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-head">
              <span className="dialog-title">{s.dialogTitle}</span>
              <button className="dialog-close" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>✕</button>
            </div>
            <div className="dialog-body">
              <p className="dialog-warn">{s.dialogWarn}</p>
              <label className="confirm-label">{s.confirmLabel}</label>
              <input
                className="confirm-input"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder={s.confirmPlaceholder}
                disabled={deleting}
                autoFocus
              />
              {deleteError && <div className="dialog-error">{deleteError}</div>}
            </div>
            <div className="dialog-foot">
              <button className="btn-cancel" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>{s.cancel}</button>
              <button
                className="btn-delete-confirm"
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== s.confirmKeyword || deleting}
              >
                {deleting ? s.deleting : s.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
