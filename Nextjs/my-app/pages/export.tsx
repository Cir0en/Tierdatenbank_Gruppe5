// Route /export: "Einstellungen"-Seite (Profil-Übersicht, CSV-Export der eigenen
// Sammlung und Konto-Löschung/Gefahrenzone). Trotz des Dateinamens "export"
// enthält diese Seite die komplette Nutzer-Einstellungen-UI; der CSV-Export
// ist nur einer von mehreren Bereichen.
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser, useClerk, useReverification } from '@clerk/nextjs';
import { isReverificationCancelledError } from '@clerk/nextjs/errors';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';

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

  // Clerk verlangt für sicherheitsrelevante Aktionen wie einen Passwort-Wechsel eine
  // "frische" Session (Reverification). useReverification zeigt dafür bei Bedarf
  // automatisch ein Bestätigungs-Modal (erneutes Passwort/Code) und wiederholt den
  // Aufruf danach selbst — ohne diesen Wrapper schlägt updatePassword() mit
  // "You need to provide additional verification..." fehl.
  const updatePasswordWithReverification = useReverification(
    (params: { newPassword: string; currentPassword?: string }) => {
      if (!user) throw new Error('Nicht angemeldet.');
      return user.updatePassword(params);
    }
  );

  // Auch das Trennen einer OAuth-Verknüpfung ist sicherheitsrelevant und kann von
  // Clerk eine frische Session verlangen — daher ebenfalls über useReverification.
  const destroyExternalAccountWithReverification = useReverification(
    (account: NonNullable<typeof user>['externalAccounts'][number]) => account.destroy()
  );

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

  const [currentPassword, setCurrentPassword]       = useState('');
  const [newPassword, setNewPassword]               = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [pwSaving, setPwSaving]     = useState(false);
  const [pwError, setPwError]       = useState<string | null>(null);
  const [pwSuccess, setPwSuccess]   = useState(false);

  const [editingProfile, setEditingProfile]   = useState(false);
  const [editUsername, setEditUsername]       = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [profileSaving, setProfileSaving]     = useState(false);
  const [profileError, setProfileError]       = useState<string | null>(null);

  const [disconnecting, setDisconnecting]         = useState(false);
  const [disconnectError, setDisconnectError]     = useState<string | null>(null);

  // Schützt die Seite client-seitig: nicht angemeldete Nutzer werden zum Login geschickt
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/login');
  }, [isLoaded, isSignedIn, router]);

  // Lädt das eigene Nutzerprofil (Rolle, Institution, Registrierungsdatum, ...) aus der
  // Datenbank. Als useCallback definiert, damit handleSaveProfile nach dem Speichern
  // dieselbe Funktion erneut aufrufen kann, um die aktualisierten Daten nachzuladen.
  const loadProfile = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setProfile(await res.json());
    } catch {}
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) return;
    loadProfile();
  }, [isSignedIn, loadProfile]);

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

  // Ändert das Passwort über Clerks user.updatePassword(). Das aktuelle Passwort wird nur
  // verlangt, wenn der Account überhaupt eines hat (Nutzer, die sich nur per Google
  // registriert haben, haben passwordEnabled=false und setzen hier ihr erstes Passwort).
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (newPassword !== newPasswordConfirm) {
      setPwError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    setPwSaving(true);
    setPwError(null);
    setPwSuccess(false);
    try {
      await updatePasswordWithReverification({
        newPassword,
        currentPassword: user.passwordEnabled ? currentPassword : undefined,
      });
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
    } catch (err: any) {
      if (isReverificationCancelledError(err)) {
        setPwError('Bestätigung abgebrochen.');
      } else {
        setPwError(err.errors?.[0]?.longMessage || 'Passwort konnte nicht geändert werden.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  // Öffnet den Bearbeiten-Modus der Profil-Karte und befüllt die Felder mit den
  // aktuell geladenen Werten.
  const handleStartEditProfile = () => {
    setEditUsername(profile?.username ?? '');
    setEditInstitution(profile?.institution ?? '');
    setProfileError(null);
    setEditingProfile(true);
  };

  // Speichert Benutzername/Institution über PUT /api/users/me und lädt danach das
  // Profil neu, damit z.B. der Avatar (Initialen) und andere Anzeigen aktuell bleiben.
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: editUsername.trim(),
          institution: editInstitution.trim() || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fehler ${res.status}`);
      }
      await loadProfile();
      setEditingProfile(false);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  // Google-Verknüpfung (falls vorhanden) und Prüfung, ob nach dem Trennen noch ein
  // Anmeldeweg übrig bleibt (Passwort oder ein weiterer verknüpfter Account) — sonst
  // würde sich der Nutzer selbst aussperren.
  const googleAccount = user?.externalAccounts.find(a => a.provider === 'google') ?? null;
  const hasOtherSignInMethod =
    !!user?.passwordEnabled ||
    (user?.externalAccounts.filter(a => a.provider !== 'google').length ?? 0) > 0;

  // Trennt die Google-Verknüpfung über Clerks externalAccount.destroy(). Fragt vorher
  // nach Bestätigung (destruktive Aktion) und lädt danach den Nutzer neu, damit
  // externalAccounts aktuell bleibt.
  const handleDisconnectGoogle = async () => {
    if (!googleAccount || !user) return;
    if (!confirm('Verbindung zu Google wirklich trennen? Du kannst dich danach nur noch mit deinem Passwort anmelden.')) return;

    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await destroyExternalAccountWithReverification(googleAccount);
      await user.reload();
    } catch (err: any) {
      if (isReverificationCancelledError(err)) {
        setDisconnectError('Bestätigung abgebrochen.');
      } else {
        setDisconnectError(err.errors?.[0]?.longMessage || 'Verbindung konnte nicht getrennt werden.');
      }
    } finally {
      setDisconnecting(false);
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
        .card-head--row { display: flex; align-items: center; justify-content: space-between; }
        .btn-edit-link {
          background: none; border: none; cursor: pointer; font-family: inherit;
          font-size: 12px; font-weight: 600; color: #2d6a4f; padding: 2px 4px;
        }
        .btn-edit-link:hover { color: #1b4332; text-decoration: underline; }
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

        /* Passwort ändern */
        .pw-field { margin-bottom: 14px; }
        .pw-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .pw-input-wrap { position: relative; }
        .pw-input {
          width: 100%; padding: 9px 12px; border: 1px solid #e5e7eb; border-radius: 8px;
          font-size: 13px; font-family: inherit; outline: none; color: #111827;
          transition: border-color .2s, box-shadow .2s;
        }
        .pw-input.has-icon { padding-right: 40px; }
        .pw-input:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,.1); }
        .pw-icon-btn {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 15px; padding: 2px;
        }
        .pw-icon-btn:hover { color: #6b7280; }
        .pw-hint { font-size: 11px; color: #9ca3af; margin: -8px 0 14px; }
        .pw-success {
          margin-top: 14px; padding: 10px 12px; border-radius: 8px;
          background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 12px;
        }
        .btn-primary {
          padding: 9px 18px; border-radius: 8px; border: none;
          background: #2d6a4f; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .btn-primary:hover:not(:disabled) { background: #1b4332; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }

        /* Verbundene Konten */
        .connected-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .connected-info { display: flex; align-items: center; gap: 12px; }
        .connected-icon {
          width: 36px; height: 36px; border-radius: 50%; background: #f3f4f6;
          display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
        }
        .connected-name  { font-size: 13px; font-weight: 600; color: #111827; }
        .connected-email { font-size: 12px; color: #6b7280; margin-top: 1px; }
        .connected-status-off { font-size: 12px; color: #9ca3af; }
        .btn-disconnect {
          padding: 7px 14px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; color: #b91c1c; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all .15s; white-space: nowrap;
        }
        .btn-disconnect:hover:not(:disabled) { background: #fef2f2; border-color: #fecaca; }
        .btn-disconnect:disabled { opacity: .5; cursor: not-allowed; }
        .connected-hint { font-size: 11px; color: #9ca3af; margin-top: 10px; }

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
            <span className="topbar-title">Einstellungen</span>
          </header>

          <main className="content">
            <div className="settings-wrap">

              {/* Profil-Karte */}
              <div className="card">
                <div className="card-head card-head--row">
                  <span>Mein Profil</span>
                  {!editingProfile && (
                    <button type="button" className="btn-edit-link" onClick={handleStartEditProfile}>
                      ✏️ Bearbeiten
                    </button>
                  )}
                </div>
                <div className="card-body">
                  <div className="profile-row">
                    <div className="profile-avatar">{initials}</div>
                    <div>
                      <div className="profile-name">{displayName}</div>
                      <div className="profile-email">{profile?.email ?? user?.emailAddresses[0]?.emailAddress ?? '—'}</div>
                    </div>
                  </div>

                  {editingProfile ? (
                    <form onSubmit={handleSaveProfile}>
                      <div className="pw-field">
                        <label className="pw-label">Benutzername</label>
                        <input
                          type="text" className="pw-input"
                          value={editUsername} onChange={e => setEditUsername(e.target.value)}
                          required minLength={3} autoFocus
                        />
                      </div>
                      <div className="pw-field">
                        <label className="pw-label">Institution</label>
                        <input
                          type="text" className="pw-input"
                          placeholder="z. B. Universität Musterstadt"
                          value={editInstitution} onChange={e => setEditInstitution(e.target.value)}
                        />
                      </div>

                      {profileError && <div className="dialog-error" style={{ marginBottom: 14 }}>{profileError}</div>}

                      <div style={{ display: 'flex', gap: 10 }}>
                        <button type="submit" className="btn-primary" disabled={profileSaving}>
                          {profileSaving ? '⏳ Wird gespeichert…' : 'Speichern'}
                        </button>
                        <button
                          type="button" className="btn-cancel"
                          onClick={() => setEditingProfile(false)} disabled={profileSaving}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  ) : (
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Benutzername</label>
                      <span>{profile?.username ?? '—'}</span>
                    </div>
                    <div className="info-item">
                      <label>Rolle</label>
                      <span>
                        <span className={`role-badge role-badge--${(profile?.role ?? 'nutzer').toLowerCase()}`}>
                          {profile?.role ?? 'Nutzer'}
                        </span>
                      </span>
                    </div>
                    <div className="info-item">
                      <label>Institution</label>
                      <span>{profile?.institution ?? '—'}</span>
                    </div>
                    <div className="info-item">
                      <label>Registriert seit</label>
                      <span>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('de-DE') : '—'}</span>
                    </div>
                  </div>
                  )}
                </div>
              </div>

              {/* Passwort ändern */}
              {user && (
                <div className="card">
                  <div className="card-head">🔒 Passwort ändern</div>
                  <div className="card-body">
                    {!user.passwordEnabled ? (
                      // Konten ohne Passwort (bisher nur Google-Login) haben keinen bestehenden
                      // Faktor, mit dem Clerks Reverification-Modal sie bestätigen könnte
                      // ("No suitable authentication factor is configured") — daher hier kein
                      // direktes updatePassword(). Der E-Mail-Code-Flow von /passwort-vergessen
                      // läuft über Clerks signIn-API, die eine bereits aktive Session blockiert
                      // ("You're already signed in") — daher erst abmelden und direkt mit
                      // Redirect dorthin schicken, statt nur zu verlinken.
                      <>
                        <p className="export-desc" style={{ marginBottom: 14 }}>
                          Du hast bisher nur mit Google angemeldet und noch kein Passwort gesetzt.
                          Lege eins über den Code-Versand per E-Mail fest. Du wirst dafür kurz abgemeldet
                          und nach dem Festlegen automatisch wieder angemeldet.
                        </p>
                        <button
                          type="button"
                          className="btn-export"
                          onClick={() => signOut({
                            redirectUrl: `/passwort-vergessen?email=${encodeURIComponent(profile?.email ?? user.emailAddresses[0]?.emailAddress ?? '')}`,
                          })}
                        >
                          🔑 Passwort festlegen
                        </button>
                      </>
                    ) : (
                    <form onSubmit={handleChangePassword} noValidate>
                      <div className="pw-field">
                        <label className="pw-label">Aktuelles Passwort</label>
                        <input
                          type="password" className="pw-input"
                          value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                          autoComplete="current-password" required
                        />
                      </div>

                      <div className="pw-field">
                        <label className="pw-label">Neues Passwort</label>
                        <div className="pw-input-wrap">
                          <input
                            type={showPw ? 'text' : 'password'}
                            className="pw-input has-icon"
                            value={newPassword} onChange={e => setNewPassword(e.target.value)}
                            autoComplete="new-password" required minLength={8}
                          />
                          <button type="button" className="pw-icon-btn" onClick={() => setShowPw(v => !v)}>
                            {showPw ? '🙈' : '👁️'}
                          </button>
                        </div>
                      </div>

                      <div className="pw-field">
                        <label className="pw-label">Neues Passwort bestätigen</label>
                        <input
                          type={showPw ? 'text' : 'password'}
                          className="pw-input"
                          value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                          autoComplete="new-password" required minLength={8}
                        />
                      </div>

                      {pwError && <div className="dialog-error" style={{ marginBottom: 14 }}>{pwError}</div>}

                      <button type="submit" className="btn-primary" disabled={pwSaving}>
                        {pwSaving ? '⏳ Wird gespeichert…' : 'Passwort ändern'}
                      </button>

                      {pwSuccess && <div className="pw-success">✓ Passwort erfolgreich geändert.</div>}
                    </form>
                    )}
                  </div>
                </div>
              )}

              {/* Verbundene Konten */}
              {user && (
                <div className="card">
                  <div className="card-head">🔗 Verbundene Konten</div>
                  <div className="card-body">
                    <div className="connected-row">
                      <div className="connected-info">
                        <div className="connected-icon">
                          <img src="/google-brands-solid-full.svg" alt="" style={{ width: 16, height: 16 }} />
                        </div>
                        <div>
                          <div className="connected-name">Google</div>
                          {googleAccount ? (
                            <div className="connected-email">{googleAccount.emailAddress}</div>
                          ) : (
                            <div className="connected-status-off">Nicht verbunden</div>
                          )}
                        </div>
                      </div>
                      {googleAccount && (
                        <button
                          className="btn-disconnect"
                          onClick={handleDisconnectGoogle}
                          disabled={disconnecting || !hasOtherSignInMethod}
                          title={!hasOtherSignInMethod ? 'Lege zuerst ein Passwort fest, um dich nicht auszusperren.' : undefined}
                        >
                          {disconnecting ? '⏳ …' : 'Trennen'}
                        </button>
                      )}
                    </div>
                    {googleAccount && !hasOtherSignInMethod && (
                      <div className="connected-hint">
                        Google ist aktuell dein einziger Anmeldeweg. Lege oben zuerst ein Passwort fest, bevor du die Verbindung trennst.
                      </div>
                    )}
                    <div className="connected-hint">
                      Hinweis: "Trennen" entfernt nur die aktuelle Verknüpfung. Meldest du dich später erneut mit
                      demselben Google-Konto an, verbindet Clerk es automatisch wieder mit diesem Account,
                      da die E-Mail-Adresse übereinstimmt — das ist normales Verhalten und keine Sicherheitslücke.
                    </div>
                    {disconnectError && <div className="dialog-error" style={{ marginTop: 14 }}>{disconnectError}</div>}
                  </div>
                </div>
              )}

              {/* Export */}
              <div className="card">
                <div className="card-head">📤 Export</div>
                <div className="card-body">
                  <p className="export-desc">
                    Exportiere alle Sammlungsobjekte als CSV-Datei. Die Datei enthält Name, Status, Taxonomie, Fundort inkl. Koordinaten (Breitengrad/Laengengrad), Maße und weitere Felder.
                  </p>
                  <div className="export-row">
                    <button className="btn-export" onClick={handleCsvDownload} disabled={exporting}>
                      {exporting ? '⏳ Wird erstellt…' : '⬇ CSV herunterladen'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Import (nur Moderator/Admin) */}
              {canImport && (
                <div className="card">
                  <div className="card-head">📥 Import</div>
                  <div className="card-body">
                    <p className="export-desc">
                      Importiere Fundobjekte aus einer CSV-Datei (gleiches Spaltenformat wie der Export). Taxonomie, Sammlung und Fundort werden anhand des Namens wiederverwendet oder neu angelegt. Enthält die Datei die Spalten <strong>Breitengrad</strong> und <strong>Laengengrad</strong>, erscheinen die importierten Einträge auch auf der Karte.
                    </p>
                    <div className="export-row">
                      <button
                        className="btn-export"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                      >
                        {importing ? '⏳ Wird importiert…' : '⬆ CSV importieren'}
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

              {/* Gefahrenzone */}
              <div className="card card--danger">
                <div className="card-head card-head--danger">⚠ Gefahrenzone</div>
                <div className="card-body">
                  <p className="danger-text">Wenn du dein Konto löschst, werden alle deine persönlichen Daten unwiderruflich anonymisiert. Deine Sammlungseinträge und Taxonomie-Beiträge bleiben erhalten, sind aber nicht mehr dir zugeordnet.</p>
                  <button className="btn-open-delete" onClick={() => setShowDeleteDialog(true)}>
                    Konto löschen
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
              <span className="dialog-title">Konto wirklich löschen?</span>
              <button className="dialog-close" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>✕</button>
            </div>
            <div className="dialog-body">
              <p className="dialog-warn">Diese Aktion ist unwiderruflich. Dein Konto wird gelöscht und alle persönlichen Daten anonymisiert. Du wirst sofort abgemeldet.</p>
              <label className="confirm-label">Gib LÖSCHEN ein um zu bestätigen:</label>
              <input
                className="confirm-input"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="LÖSCHEN"
                disabled={deleting}
                autoFocus
              />
              {deleteError && <div className="dialog-error">{deleteError}</div>}
            </div>
            <div className="dialog-foot">
              <button className="btn-cancel" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>Abbrechen</button>
              <button
                className="btn-delete-confirm"
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'LÖSCHEN' || deleting}
              >
                {deleting ? '⏳ Wird gelöscht…' : 'Konto endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
