'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';

const API = 'http://localhost:5099';

// ═══════════════════════════════════════════════════════════════════════════
// Seite: /admin
// Zweck: Administrationsbereich für Systemverantwortliche: Benutzerverwaltung
//        (Rolle ändern, Nutzer löschen, sperren/entsperren) sowie eine
//        Übersicht über System-Kennzahlen (Objekte, Arten, Nutzer, Ausleihen)
//        und eine (aktuell teilweise statische) Aktivitäts-Feed-Ansicht.
// Rollen: Ausschließlich für Rolle "Admin" zugänglich. Nicht eingeloggte
//        Nutzer werden zum Login umgeleitet; eingeloggte Nutzer ohne
//        Admin-Rolle sehen eine Debug-Info statt der Seite (kein Redirect,
//        vermutlich zu Diagnosezwecken während der Entwicklung).
// ═══════════════════════════════════════════════════════════════════════════

const ROLES = ['Nutzer', 'Moderator', 'Admin'] as const;
type Role = typeof ROLES[number];

// Ein Eintrag der Benutzerverwaltungs-Tabelle (/api/users).
interface UserEntry {
  id: number;
  clerkId: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  createdAt: string | null;
  isBanned: boolean;
}

// Aggregierte System-Kennzahlen für die Stat-Kacheln (/api/users/stats).
interface Stats {
  totalUsers: number;
  totalObjects: number;
  totalSpecies: number;
  totalLoans: number;
  pendingTax: number;
}

// Ordnet einer Nutzerrolle die passende Badge-CSS-Klasse zu (Farbe je Rolle).
function roleBadgeClass(role: string | null) {
  switch (role) {
    case 'Admin':     return 'rb rb--admin';
    case 'Moderator': return 'rb rb--mod';
    case 'Inaktiv':   return 'rb rb--inactive';
    default:          return 'rb rb--user';
  }
}

// Berechnet die Avatar-Initialen eines Nutzers (aus Vor-/Nachname, sonst
// aus den ersten beiden Zeichen des Usernamens).
function initials(u: UserEntry) {
  const fn = u.firstName ?? '';
  const ln = u.lastName  ?? '';
  if (fn || ln) return `${fn[0] ?? ''}${ln[0] ?? ''}`.toUpperCase();
  return u.username.slice(0, 2).toUpperCase();
}

// Hauptkomponente der Admin-Seite: regelt Rollen-/Zugriffsschutz, lädt
// Nutzerliste und Statistiken, und bietet Aktionen zum Ändern von Rollen,
// Sperren/Entsperren und Löschen von Nutzern.
export default function AdminPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, getToken } = useAuth();
  const router = useRouter();

  const [users, setUsers]   = useState<UserEntry[]>([]);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Zentraler Fetch-Wrapper für alle Admin-API-Aufrufe: hängt automatisch das
  // Clerk-Bearer-Token an (Auth-Muster dieser Seite, im Gegensatz zum
  // 'X-Clerk-User-Id'-Header, der z. B. in Sammlung.tsx/leihe.tsx verwendet wird)
  // und setzt bei vorhandenem Body den Content-Type-Header.
  const apiFetch = useCallback(
  async (
    path: string,
    options: RequestInit = {}
  ) => {
    const token = await getToken();

    if (!token) {
      throw new Error(
        'Es konnte kein Anmeldetoken geladen werden.'
      );
    }

    const headers = new Headers(options.headers);

    headers.set(
      'Authorization',
      `Bearer ${token}`
    );

    if (options.body) {
      headers.set(
        'Content-Type',
        'application/json'
      );
    }

    return fetch(`${API}${path}`, {
      ...options,
      headers,
    });
  },
  [getToken]
);

  const [dbRole, setDbRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  // Rolle aus Neon-DB holen — Clerk publicMetadata ist nicht zuverlässig
  // nach einer Admin-Rollenänderung (Clerk-Cache-Problem).
  useEffect(() => {
    if (!userLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setDbRole(data.role ?? null);
      } catch {
        // ignore, roleLoaded wird trotzdem true
      } finally {
        if (!cancelled) setRoleLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userLoaded, isSignedIn, getToken]);

  // DB-Rolle hat Vorrang; Fallback auf Clerk publicMetadata
  const currentRole = dbRole ?? (user?.publicMetadata?.role as string) ?? '';

  // Redirect nur wenn Clerk vollständig geladen hat
  useEffect(() => {
    if (!userLoaded) return;
    if (!isSignedIn) { router.replace('/login'); return; }
  }, [userLoaded, isSignedIn, router]);

  // Lädt Nutzerliste und System-Statistiken parallel; wird nur für
  // bestätigte Admins aufgerufen (siehe useEffect direkt darunter).
  const fetchData = useCallback(async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        apiFetch(`/api/users`),
        apiFetch(`/api/users/stats`),
      ]);
      
      if (!usersRes.ok) {
        throw new Error(
          `Benutzer konnten nicht geladen werden: ${usersRes.status}`
        );
      }

      if (!statsRes.ok) {
        throw new Error(
          `Statistiken konnten nicht geladen werden: ${statsRes.status}`
        );
      }

      setUsers(await usersRes.json());
      setStats(await statsRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  // Lädt die Verwaltungsdaten erst, sobald sowohl Clerk als auch die
  // DB-Rollenprüfung abgeschlossen sind und der Nutzer tatsächlich Admin ist.
  useEffect(() => {
    if (
      userLoaded &&
      isSignedIn &&
      currentRole === 'Admin'
    ) {
      void fetchData();
    }
  }, [
    userLoaded,
    isSignedIn,
    currentRole,
    fetchData
  ]);

  // Ändert die Rolle eines Nutzers und aktualisiert die lokale Liste
  // optimistisch, sobald das Backend die Änderung bestätigt hat.
  const handleRoleChange = async (userId: number, role: Role) => {
    setSaving(userId);
    try {
      const res = await apiFetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  // Sperrt/entsperrt einen Nutzer über die ban/unban-Endpunkte (Aktion wird
  // anhand des aktuellen isBanned-Werts bestimmt) und aktualisiert die
  // lokale Liste entsprechend. Wird über den "Sperren"/"Entsperren"-Button
  // in der Aktionen-Spalte der Tabelle ausgelöst.
  const handleBanChange = async (
  userId: number,
  currentlyBanned: boolean
) => {
  setSaving(userId);
  setError(null);

  try {
    const action =
      currentlyBanned ? 'unban' : 'ban';

    const res = await apiFetch(
      `/api/users/${userId}/${action}`,
      {
        method: 'POST',
      }
    );

    if (!res.ok) {
      const message = await res.text();

      throw new Error(
        message || 'Statusänderung fehlgeschlagen'
      );
    }

    setUsers(previous =>
      previous.map(user =>
        user.id === userId
          ? {
              ...user,
              isBanned: !currentlyBanned,
            }
          : user
      )
    );
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : 'Statusänderung fehlgeschlagen'
    );
  } finally {
    setSaving(null);
  }
};

  // Löscht einen Nutzer endgültig (nach Bestätigung über die deleteConfirm-
  // Inline-UI in der Tabelle) und entfernt ihn aus der lokalen Liste.
  const handleDelete = async (userId: number) => {
    try {
      const res = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Solange Clerk-Nutzerdaten oder die DB-Rollenprüfung noch laufen, nur
  // einen Ladehinweis anzeigen statt verfrüht Zugriff zu verweigern.
  if (!userLoaded || !roleLoaded) return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Laden…</div>
  );
  if (!isSignedIn) return null;

  // DEBUG-Seite: zeigt was Clerk zurückgibt
  // Statt eines stillen Redirects wird hier absichtlich eine Debug-Ansicht
  // gerendert, die Rolle/Metadata offenlegt — hilfreich zur Fehlersuche bei
  // Rollenzuweisungsproblemen, sollte aber vor Produktivbetrieb überprüft werden.
  if (currentRole !== 'Admin') return (
    <div style={{ padding: 40, fontFamily: 'monospace', fontSize: 14 }}>
      <h2 style={{ marginBottom: 16 }}>⛔ Kein Admin-Zugriff — Debug-Info:</h2>
      <p><strong>isSignedIn:</strong> {String(isSignedIn)}</p>
      <p><strong>currentRole:</strong> &quot;{currentRole}&quot;</p>
      <p><strong>publicMetadata:</strong> {JSON.stringify(user?.publicMetadata)}</p>
      <p style={{ marginTop: 16, color: '#666' }}>
        Erwartet: role = &quot;Admin&quot; (exakt so, mit großem A)
      </p>
    </div>
  );

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
          background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
          gap: 12px;
        }
        .topbar-title { font-size: 16px; font-weight: 700; color: #111827; }
        .topbar-badge {
          padding: 3px 10px; border-radius: 99px; background: #fef3c7;
          color: #92400e; font-size: 11px; font-weight: 600;
        }

        /* Content */
        .content { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }

        /* Stats */
        .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .stat-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 18px 20px; display: flex; align-items: center; gap: 14px;
        }
        .stat-icon {
          width: 44px; height: 44px; border-radius: 10px; display: flex;
          align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;
        }
        .stat-icon--green  { background: #d1fae5; }
        .stat-icon--blue   { background: #dbeafe; }
        .stat-icon--amber  { background: #fef3c7; }
        .stat-icon--purple { background: #ede9fe; }
        .stat-value { font-size: 26px; font-weight: 700; color: #111827; line-height: 1; }
        .stat-label { font-size: 12px; color: #6b7280; margin-top: 2px; }

        /* Cards */
        .card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;
        }
        .card-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid #f3f4f6;
        }
        .card-title { font-size: 14px; font-weight: 600; color: #111827; }
        .card-count { font-size: 12px; color: #9ca3af; }

        /* Two column */
        .two-col { display: grid; grid-template-columns: 1fr 340px; gap: 16px; }

        /* User table */
        .user-table { width: 100%; border-collapse: collapse; }
        .user-table th {
          text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600;
          color: #6b7280; text-transform: uppercase; letter-spacing: .05em;
          border-bottom: 1px solid #f3f4f6; background: #fafafa;
        }
        .user-table td { padding: 11px 16px; border-bottom: 1px solid #f9fafb; }
        .user-table tr:last-child td { border-bottom: none; }
        .user-table tr:hover td { background: #f9fafb; }

        .user-info { display: flex; align-items: center; gap: 10px; }
        .avatar {
          width: 34px; height: 34px; border-radius: 50%; background: #2e7d32;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600; color: #fff; flex-shrink: 0;
        }
        .user-name { font-size: 13px; font-weight: 500; color: #111827; }
        .user-email { font-size: 11px; color: #9ca3af; }

        /* Role badges */
        .rb { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
        .rb--admin    { background: #fee2e2; color: #991b1b; }
        .rb--mod      { background: #dbeafe; color: #1e40af; }
        .rb--user     { background: #f3f4f6; color: #374151; }
        .rb--inactive { background: #fef3c7; color: #92400e; }

        /* Role select */
        .role-select {
          padding: 5px 8px; border-radius: 6px; border: 1px solid #e5e7eb;
          font-size: 12px; color: #374151; background: #fff; cursor: pointer;
          font-family: inherit; transition: border-color .15s;
        }
        .role-select:focus { outline: none; border-color: #6ee7b7; }
        .role-select:disabled { opacity: .5; cursor: not-allowed; }

        /* Delete button */
        .btn-del {
          padding: 5px 12px; border-radius: 6px; border: 1px solid #fecaca;
          background: #fff; color: #dc2626; font-size: 11px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .btn-del:hover { background: #fef2f2; }

        /* Confirm dialog */
        .confirm-row td { background: #fff7ed !important; }
        .confirm-btns { display: flex; gap: 8px; }
        .btn-confirm {
          padding: 5px 12px; border-radius: 6px; border: none;
          background: #dc2626; color: #fff; font-size: 11px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .btn-cancel-sm {
          padding: 5px 12px; border-radius: 6px; border: 1px solid #e5e7eb;
          background: #fff; color: #374151; font-size: 11px; cursor: pointer; font-family: inherit;
        }

        /* Activity feed */
        .activity-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px 16px; border-bottom: 1px solid #f9fafb;
        }
        .activity-item:last-child { border-bottom: none; }
        .activity-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #6ee7b7;
          margin-top: 4px; flex-shrink: 0;
        }
        .activity-dot--amber { background: #fcd34d; }
        .activity-dot--red   { background: #fca5a5; }
        .activity-dot--blue  { background: #93c5fd; }
        .activity-text { font-size: 12px; color: #374151; line-height: 1.5; }
        .activity-time { font-size: 11px; color: #9ca3af; margin-top: 2px; }

        /* Error banner */
        .error-banner {
          padding: 10px 16px; background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; color: #b91c1c; font-size: 12px;
          display: flex; align-items: center; justify-content: space-between;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #d1fae5; border-radius: 2px; }
      `}</style>

      <div className="app-shell">
        <Navbar activeNav="admin" />

        <div className="main-area">
          <header className="topbar">
            <span className="topbar-title">Admin Bereich</span>
            <span className="topbar-badge">Administrator</span>
          </header>

          <main className="content">
            {error && (
              <div className="error-banner">
                {error}
                <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>✕</button>
              </div>
            )}

            {/* Stats */}
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-icon stat-icon--green">🗂</div>
                <div>
                  <div className="stat-value">{stats?.totalObjects ?? '—'}</div>
                  <div className="stat-label">Gesamtobjekte</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon stat-icon--blue">🌿</div>
                <div>
                  <div className="stat-value">{stats?.totalSpecies ?? '—'}</div>
                  <div className="stat-label">Tierarten</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon stat-icon--amber">👤</div>
                <div>
                  <div className="stat-value">{stats?.totalUsers ?? '—'}</div>
                  <div className="stat-label">Benutzer</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon stat-icon--purple">⇄</div>
                <div>
                  <div className="stat-value">{stats?.totalLoans ?? '—'}</div>
                  <div className="stat-label">Ausleihen</div>
                </div>
              </div>
            </div>

            <div className="two-col">
              {/* User management table */}
              <div className="card">
                <div className="card-head">
                  <span className="card-title">Benutzerverwaltung</span>
                  <span className="card-count">{users.length} Nutzer</span>
                </div>
                {loading ? (
                  <div style={{ padding: 24, color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>Wird geladen…</div>
                ) : (
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>Benutzer</th>
                        <th>Rolle</th>
                        <th>Beigetreten</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <>
                          <tr key={u.id} className={deleteConfirm === u.id ? 'confirm-row' : ''}>
                            <td>
                              <div className="user-info">
                                <div className="avatar">{initials(u)}</div>
                                <div>
                                  <div className="user-name">
                                    {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                                    {u.isBanned && <span className="rb rb--inactive" style={{ marginLeft: 6 }}>Gesperrt</span>}
                                  </div>
                                  <div className="user-email">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              {deleteConfirm === u.id ? (
                                <span className={roleBadgeClass(u.role)}>{u.role ?? 'Nutzer'}</span>
                              ) : (
                                <select
                                  className="role-select"
                                  value={u.role ?? 'Nutzer'}
                                  disabled={saving === u.id}
                                  onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                                >
                                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              )}
                            </td>
                            <td style={{ color: '#9ca3af', fontSize: 12 }}>
                              {u.createdAt
                                ? new Date(u.createdAt).toLocaleDateString('de-DE')
                                : '—'}
                            </td>
                            <td>
                              {deleteConfirm === u.id ? (
                                <div className="confirm-btns">
                                  <button className="btn-confirm" onClick={() => handleDelete(u.id)}>Löschen bestätigen</button>
                                  <button className="btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
                                </div>
                              ) : (
                                <div className="confirm-btns">
                                  <button
                                    className="btn-cancel-sm"
                                    disabled={saving === u.id}
                                    onClick={() => handleBanChange(u.id, u.isBanned)}
                                  >
                                    {u.isBanned ? 'Entsperren' : 'Sperren'}
                                  </button>
                                  <button className="btn-del" disabled={saving === u.id} onClick={() => setDeleteConfirm(u.id)}>Löschen</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* System activity */}
              <div className="card" style={{ alignSelf: 'start' }}>
                <div className="card-head">
                  <span className="card-title">Systemaktivität</span>
                </div>
                <div className="activity-item">
                  <div className="activity-dot" />
                  <div>
                    <div className="activity-text">Neues Objekt hinzugefügt</div>
                    <div className="activity-time">Vor 2 Minuten</div>
                  </div>
                </div>
                <div className="activity-item">
                  <div className="activity-dot activity-dot--blue" />
                  <div>
                    <div className="activity-text">Benutzer registriert</div>
                    <div className="activity-time">Vor 15 Minuten</div>
                  </div>
                </div>
                <div className="activity-item">
                  <div className="activity-dot activity-dot--amber" />
                  <div>
                    <div className="activity-text">Ausleihe erstellt</div>
                    <div className="activity-time">Vor 1 Stunde</div>
                  </div>
                </div>
                <div className="activity-item">
                  <div className="activity-dot activity-dot--red" />
                  <div>
                    <div className="activity-text">Objekt bearbeitet</div>
                    <div className="activity-time">Vor 3 Stunden</div>
                  </div>
                </div>
                {stats?.pendingTax ? (
                  <div className="activity-item">
                    <div className="activity-dot activity-dot--amber" />
                    <div>
                      <div className="activity-text">
                        {stats.pendingTax} Taxonomie-Einträge warten auf Freigabe
                      </div>
                      <div className="activity-time">
                        <a href="/moderator" style={{ color: '#059669', textDecoration: 'none' }}>→ Zum Moderationsbereich</a>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
