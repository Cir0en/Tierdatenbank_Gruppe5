"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Navbar from "../components/Navbar";

const API = "http://localhost:5099";

// ═══════════════════════════════════════════════════════════════════════════
// Seite: /leihe
// Zweck: Verwaltung aller Leihvorgänge des eingeloggten Nutzers — sowohl als
//        Verleiher (eigene Objekte, die man verliehen hat) als auch als
//        Entleiher (Objekte, die man sich von anderen ausgeliehen hat).
//        Erlaubt Anlegen neuer Ausleihen, Markieren als zurückgegeben/aktiv
//        sowie Löschen (nur als Verleiher möglich).
// Rollen: Setzt einen eingeloggten Nutzer voraus; Aktionen (Status ändern,
//        löschen) sind nur für den Verleiher (isLender) der jeweiligen Leihe
//        sichtbar, unabhängig von der globalen Nutzerrolle.
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────────────
type Loan = {
  id: number;
  objectId: number | null;
  objectName: string | null;
  lenderId: number | null;
  lenderName: string | null;
  lenderFirstName: string | null;
  lenderLastName: string | null;
  borrowerId: number | null;
  borrowerName: string | null;
  borrowerFirstName: string | null;
  borrowerLastName: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  isOverdue: boolean;
};

type MyObject = { id: number; name: string | null; collectionName: string | null };
type LoanUser = { id: number; username: string; firstName: string | null; lastName: string | null; institution: string | null };

type FilterRole = "alle" | "verleiher" | "entleiher";
type FilterStatus = "alle" | "aktiv" | "ueberfaellig" | "zurueck";

// ── Helpers ────────────────────────────────────────────────────────────────

// Formatiert ein ISO-Datum als deutsches Datum; gibt "—" bei fehlendem Wert
// zurück und den Rohwert, falls das Parsen fehlschlägt.
function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
}

// Baut einen lesbaren Anzeigenamen (Vor-/Nachname, sonst Username, sonst "—").
function displayName(first: string | null, last: string | null, username: string | null): string {
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return username ?? "—";
}

// Übersetzt den rohen Backend-Status in den in der UI angezeigten Status.
// Überfällige Leihen haben Vorrang vor dem gespeicherten Status.
function effectiveStatus(loan: Loan): string {
  if (loan.isOverdue) return "überfällig";
  // DB speichert laufende Leihen als 'offen', UI zeigt 'aktiv'
  if (loan.status === "offen") return "aktiv";
  return loan.status ?? "—";
}

// Farbiges Status-Badge für eine einzelne Leihe (grün=aktiv, rot=überfällig,
// grau=zurückgegeben, gelb=offen als Fallback).
function StatusPill({ loan }: { loan: Loan }) {
  const s = effectiveStatus(loan);
  const cls: Record<string, string> = {
    aktiv:       "pill pill--green",
    überfällig:  "pill pill--red",
    "zurückgegeben": "pill pill--gray",
    offen:       "pill pill--amber",
  };
  return <span className={cls[s] ?? "pill pill--gray"}>{s}</span>;
}

// ── Modal: Neue Ausleihe ───────────────────────────────────────────────────

// Modal zum Anlegen einer neuen Ausleihe: Nutzer wählt eines seiner eigenen
// Objekte (`objects`, aus /api/loan/my-objects) sowie einen Entleiher
// (`users`, aus /api/loan/users) und einen Zeitraum aus.
function CreateLoanModal({
  objects, users, getToken,
  onCreated, onClose,
}: {
  objects: MyObject[];
  users: LoanUser[];
  getToken: () => Promise<string | null>;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [objectId, setObjectId]     = useState<number | "">("");
  const [borrowerId, setBorrowerId] = useState<number | "">("");
  const [startDate, setStartDate]   = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]       = useState<string>("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Validiert die Pflichtfelder und legt die Ausleihe im Backend an. Auth
  // erfolgt per Bearer-Token (LoanController erfordert [Authorize]), damit
  // das Backend den Verleiher (aktueller Nutzer) eindeutig und fälschungssicher
  // zuordnen kann. Fehler werden dem Nutzer im Formular angezeigt statt einer Exception.
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!objectId || !borrowerId || !startDate || !endDate) {
      setError("Bitte alle Felder ausfüllen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/loan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ objectId, borrowerId, startDate, endDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Fehler ${res.status}`);
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Neue Ausleihe anlegen</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <label className="form-label">Objekt</label>
          <select
            className="form-select"
            value={objectId}
            onChange={(e) => setObjectId(Number(e.target.value))}
            required
          >
            <option value="">— Objekt auswählen —</option>
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name ?? `Objekt #${o.id}`}
                {o.collectionName ? ` (${o.collectionName})` : ""}
              </option>
            ))}
          </select>

          <label className="form-label">Entleiher</label>
          <select
            className="form-select"
            value={borrowerId}
            onChange={(e) => setBorrowerId(Number(e.target.value))}
            required
          >
            <option value="">— Person auswählen —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u.firstName, u.lastName, u.username)}
                {u.institution ? ` · ${u.institution}` : ""}
              </option>
            ))}
          </select>

          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label className="form-label">Startdatum</label>
              <input
                className="form-input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Rückgabedatum</label>
              <input
                className="form-input"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Wird erstellt…" : "Ausleihe anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

// Hauptkomponente der Leihverwaltungs-Seite: lädt Leihen sowie Hilfsdaten
// (eigene Objekte, mögliche Entleiher), bietet Filter nach Rolle/Status und
// Aktionen zum Statuswechsel bzw. Löschen einzelner Leihen an.
export default function LeihePage() {
  const { userId: clerkId, getToken } = useAuth();

  const [loans, setLoans]         = useState<Loan[]>([]);
  const [objects, setObjects]     = useState<MyObject[]>([]);
  const [users, setUsers]         = useState<LoanUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [filterRole, setFilterRole]     = useState<FilterRole>("alle");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("alle");

  // Baut den Authorization-Header für alle Leihe-Anfragen (Bearer-Token aus
  // Clerk) — der LoanController erfordert eine gültige JWT-Authentifizierung
  // ([Authorize]), ein einfacher Nutzer-Id-Header genügt hier bewusst nicht.
  const authHeaders = async (): Promise<Record<string, string> | undefined> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  // Lädt alle Leihen, an denen der Nutzer als Verleiher oder Entleiher beteiligt ist.
  const fetchLoans = async () => {
    if (!clerkId) return;
    try {
      const res = await fetch(`${API}/api/loan`, { headers: await authHeaders() });
      if (res.ok) setLoans(await res.json());
      else setActionError(`Fehler ${res.status} — Leihen konnten nicht geladen werden.`);
    } catch {
      setActionError("Server nicht erreichbar — Leihen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  // Lädt die Hilfsdaten für das "Neue Ausleihe"-Modal: eigene ausleihbare
  // Objekte und die Liste möglicher Entleiher (parallel per Promise.all).
  const fetchSupportData = async () => {
    if (!clerkId) return;
    try {
      const headers = await authHeaders();
      const [objRes, usrRes] = await Promise.all([
        fetch(`${API}/api/loan/my-objects`, { headers }),
        fetch(`${API}/api/loan/users`, { headers }),
      ]);
      if (objRes.ok) setObjects(await objRes.json());
      if (usrRes.ok) setUsers(await usrRes.json());
    } catch {
      setActionError("Server nicht erreichbar — Objekte/Nutzer konnten nicht geladen werden.");
    }
  };

  // Initiales Laden bzw. Neuladen, sobald sich der eingeloggte Nutzer ändert.
  useEffect(() => {
    fetchLoans();
    fetchSupportData();
  }, [clerkId]);

  // Ändert den Status einer Leihe (z. B. "zurückgegeben" oder Reaktivierung
  // auf "offen"). Nur der Verleiher darf das (serverseitig geprüft); Fehler
  // werden im actionError-Banner angezeigt. Die Liste wird danach immer neu
  // geladen, um konsistente isOverdue-Werte vom Server zu bekommen.
  const handleStatusChange = async (loanId: number, status: string) => {
    if (!clerkId) return;
    setActionError(null);
    try {
      const auth = await authHeaders();
      const res = await fetch(`${API}/api/loan/${loanId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.message ?? `Fehler ${res.status} — Status konnte nicht gesetzt werden.`);
      }
    } catch {
      setActionError("Server nicht erreichbar — Status konnte nicht gesetzt werden.");
    } finally {
      fetchLoans();
    }
  };

  // Löscht eine Leihe nach Bestätigungsdialog (nur für den Verleiher sichtbar/möglich).
  const handleDelete = async (loanId: number) => {
    if (!clerkId) return;
    if (!confirm("Leihe wirklich löschen?")) return;
    setActionError(null);
    try {
      const res = await fetch(`${API}/api/loan/${loanId}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.message ?? `Fehler ${res.status} — Leihe konnte nicht gelöscht werden.`);
      }
    } catch {
      setActionError("Server nicht erreichbar — Leihe konnte nicht gelöscht werden.");
    } finally {
      fetchLoans();
    }
  };

  // Filter
  // Wendet die Rollen- (Verleiher/Entleiher) und Status-Filter der Toolbar
  // client-seitig auf die geladene Leihenliste an; nutzt effectiveStatus()
  // für den Statusabgleich, damit "aktiv"/"überfällig" korrekt greifen.
  const filtered = loans.filter((l) => {
    const roleOk =
      filterRole === "alle" ||
      (filterRole === "verleiher" && l.lenderId != null) ||
      (filterRole === "entleiher" && l.borrowerId != null);

    const eff = effectiveStatus(l);
    const statusOk =
      filterStatus === "alle" ||
      (filterStatus === "aktiv"        && eff === "aktiv")      ||
      (filterStatus === "ueberfaellig" && eff === "überfällig") ||
      (filterStatus === "zurueck"      && eff === "zurückgegeben");

    return roleOk && statusOk;
  });

  // Kennzahlen für die Stat-Kacheln oben auf der Seite (ungefiltert, über alle Leihen).
  const activeCount   = loans.filter((l) => l.status === "offen" && !l.isOverdue).length;
  const overdueCount  = loans.filter((l) => l.isOverdue).length;
  const returnedCount = loans.filter((l) => l.status === "zurückgegeben").length;

  return (
    <>
      {/* Komponenten-Styling (CSS-in-JS) für die gesamte Seite. */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:         #ffffff;
          --bg-surface: #f8f9fa;
          --bg-card:    #ffffff;
          --primary:    #1a73e8;
          --primary-dim: rgba(26,115,232,0.1);
          --green:      #4a6e3d;
          --green-dim:  rgba(74,110,61,0.3);
          --green-glow: rgba(74,110,61,0.04);
          --text-hi:    #202124;
          --text-mid:   #5f6368;
          --text-lo:    #70757a;
          --amber:      #f9ab00;
          --red:        #d93025;
          --border:     #dadce0;
          --ff-mono:    'Roboto Mono', monospace;
          --ff-serif:   'Cormorant Garamond', serif;
          --sidebar-w:  240px;
          --top-h:      64px;
        }
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Mono:wght@300;400&display=swap');

        html, body { height: 100%; background: var(--bg); color: var(--text-hi); font-family: var(--ff-mono); font-size: 13px; overflow: hidden; }

        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
        .bg-glow::before { content: ''; position: absolute; top: -20%; left: -10%; width: 60%; height: 60%; background: radial-gradient(ellipse, rgba(74,110,61,0.09) 0%, transparent 70%); animation: driftA 22s ease-in-out infinite alternate; }
        .bg-glow::after { content: ''; position: absolute; bottom: -20%; right: -10%; width: 50%; height: 50%; background: radial-gradient(ellipse, rgba(100,70,30,0.07) 0%, transparent 70%); animation: driftB 28s ease-in-out infinite alternate; }
        @keyframes driftA { from { transform: translate(0,0); } to { transform: translate(3%,2%); } }
        @keyframes driftB { from { transform: translate(0,0); } to { transform: translate(-2%,-3%); } }
        .grid-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 0; background-image: linear-gradient(rgba(74,110,61,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(74,110,61,0.035) 1px, transparent 1px); background-size: 48px 48px; }

        .app { position: relative; z-index: 10; display: flex; height: 100vh; overflow: hidden; }
        .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        /* Topbar */
        .topbar { height: var(--top-h); display: flex; align-items: center; gap: 16px; padding: 0 20px; border-bottom: 1px solid var(--border); background: var(--bg-surface); flex-shrink: 0; }
        .topbar-title { font-family: var(--ff-serif); font-size: 18px; font-weight: 300; color: var(--text-hi); letter-spacing: 0.02em; }
        .topbar-title em { font-style: italic; color: var(--text-mid); }
        .topbar-spacer { flex: 1; }

        /* Content */
        .content { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }

        /* Stat grid */
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 2px; padding: 14px 16px; position: relative; overflow: hidden; }
        .stat-card::before { content: ''; position: absolute; top: -1px; left: -1px; width: 14px; height: 14px; border-top: 1.5px solid var(--green-dim); border-left: 1.5px solid var(--green-dim); }
        .stat-value { display: block; font-family: var(--ff-serif); font-size: 32px; font-weight: 300; color: var(--text-hi); line-height: 1; margin-bottom: 4px; }
        .stat-label { display: block; font-size: 10px; letter-spacing: 0.12em; color: var(--text-mid); text-transform: uppercase; }
        .stat-sub { display: block; font-size: 9px; color: var(--text-lo); margin-top: 3px; }

        /* Filter bar */
        .filter-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .filter-group { display: flex; gap: 4px; }
        .filter-btn { background: none; border: 1px solid var(--border); border-radius: 2px; padding: 5px 12px; font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.08em; color: var(--text-mid); cursor: pointer; transition: all 0.15s; }
        .filter-btn:hover { border-color: var(--green-dim); color: var(--text-hi); }
        .filter-btn.active { background: rgba(74,110,61,0.1); border-color: var(--green-dim); color: var(--green); }
        .filter-sep { width: 1px; background: var(--border); margin: 0 4px; }
        .filter-spacer { flex: 1; }

        /* Card + Table */
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 2px; overflow: hidden; }
        .card-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border); }
        .card-title { font-size: 10px; letter-spacing: 0.15em; color: var(--text-mid); text-transform: uppercase; }
        .card-count { font-size: 10px; color: var(--text-lo); }

        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th { text-align: left; padding: 8px 12px; font-size: 9px; letter-spacing: 0.12em; color: var(--text-lo); text-transform: uppercase; border-bottom: 1px solid var(--border); font-weight: 400; }
        .tbl td { padding: 9px 12px; font-size: 11px; color: var(--text-mid); border-bottom: 1px solid rgba(74,110,61,0.07); vertical-align: middle; }
        .tbl tr:hover td { background: var(--green-glow); }
        .tbl tr:last-child td { border-bottom: none; }
        .td-name { color: var(--text-hi); font-style: italic; }
        .td-id { color: var(--text-lo); font-size: 10px; }
        .td-actions { display: flex; gap: 6px; align-items: center; }
        .tbl-btn { font-size: 9px; letter-spacing: 0.06em; background: none; border: 1px solid var(--border); border-radius: 2px; padding: 3px 8px; color: var(--text-lo); cursor: pointer; font-family: var(--ff-mono); transition: all 0.15s; white-space: nowrap; }
        .tbl-btn:hover { border-color: var(--green-dim); color: var(--text-mid); }
        .tbl-btn--danger:hover { border-color: rgba(180,60,60,0.4); color: var(--red); }

        /* Pills */
        .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 9px; letter-spacing: 0.1em; padding: 2px 7px; border-radius: 2px; text-transform: uppercase; white-space: nowrap; }
        .pill::before { content: ''; width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; }
        .pill--green  { background: rgba(74,110,61,0.12); color: rgba(120,180,90,0.85); }
        .pill--green::before  { background: rgba(100,180,80,0.7); }
        .pill--amber  { background: rgba(180,130,40,0.12); color: var(--amber); }
        .pill--amber::before  { background: var(--amber); }
        .pill--red    { background: rgba(180,60,60,0.12); color: var(--red); }
        .pill--red::before    { background: var(--red); }
        .pill--gray   { background: rgba(100,100,100,0.1); color: rgba(140,140,140,0.6); }
        .pill--gray::before   { background: rgba(140,140,140,0.4); }

        .role-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; padding: 2px 6px; border-radius: 2px; letter-spacing: 0.06em; }
        .role-chip--lender  { background: rgba(26,115,232,0.1); color: var(--primary); }
        .role-chip--borrower { background: rgba(74,110,61,0.1); color: var(--green); }

        /* Empty state */
        .empty { padding: 40px; text-align: center; color: var(--text-lo); font-size: 12px; letter-spacing: 0.1em; }

        /* Buttons */
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 2px; font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.08em; cursor: pointer; border: none; transition: all 0.15s; }
        .btn--primary { background: var(--primary); color: #fff; }
        .btn--primary:hover { background: #1557b0; }
        .btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn--ghost { background: none; border: 1px solid var(--border); color: var(--text-mid); }
        .btn--ghost:hover { border-color: var(--green-dim); }

        /* Modal */
        .modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
        .modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; width: 480px; max-width: 95vw; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
        .modal-title { font-size: 12px; letter-spacing: 0.12em; color: var(--text-hi); text-transform: uppercase; }
        .modal-close { background: none; border: none; font-size: 14px; color: var(--text-lo); cursor: pointer; padding: 2px 6px; border-radius: 2px; }
        .modal-close:hover { color: var(--text-hi); background: var(--bg-surface); }
        .modal-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .modal-footer { display: flex; gap: 8px; justify-content: flex-end; padding-top: 6px; }

        /* Form */
        .form-label { font-size: 10px; letter-spacing: 0.1em; color: var(--text-mid); text-transform: uppercase; display: block; margin-bottom: 5px; }
        .form-select, .form-input {
          width: 100%; padding: 7px 10px; background: var(--bg-surface);
          border: 1px solid var(--border); border-radius: 2px;
          font-family: var(--ff-mono); font-size: 12px; color: var(--text-hi);
          outline: none; transition: border-color 0.15s;
        }
        .form-select:focus, .form-input:focus { border-color: var(--primary); }
        .form-row { display: flex; gap: 12px; }
        .form-error { background: rgba(180,60,60,0.08); border: 1px solid rgba(180,60,60,0.3); border-radius: 2px; padding: 8px 12px; font-size: 11px; color: var(--red); }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 2px; }

        /* Status bar */
        .statusbar { height: 30px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-top: 1px solid var(--border); background: rgba(12,15,10,0.9); flex-shrink: 0; font-size: 10px; letter-spacing: 0.1em; color: var(--text-lo); }
        .status-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: rgba(74,110,61,0.7); margin-right: 6px; animation: pulse 2.5s ease infinite; vertical-align: middle; }
        @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; box-shadow: 0 0 5px rgba(74,110,61,0.5); } }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .card { animation: fadeUp 0.4s ease both; }
      `}</style>

      <div className="bg-glow" />
      <div className="grid-overlay" />

      <div className="app">
        <Navbar activeNav="leihe" />

        <div className="main">
          {/* Topbar */}
          <header className="topbar">
            <h1 className="topbar-title">Ausleihe <em>/ Leihverwaltung</em></h1>
            <div className="topbar-spacer" />
            <button className="btn btn--primary" onClick={() => setShowModal(true)}>
              ＋ Neue Ausleihe
            </button>
          </header>

          <main className="content">

            {/* Stats */}
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-value">{loans.length}</span>
                <span className="stat-label">Leihen gesamt</span>
                <span className="stat-sub">alle Zeiträume</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{activeCount}</span>
                <span className="stat-label">Aktiv</span>
                <span className="stat-sub">laufende Ausleihen</span>
              </div>
              <div className="stat-card">
                <span className="stat-value" style={{ color: overdueCount > 0 ? "var(--red)" : undefined }}>{overdueCount}</span>
                <span className="stat-label">Überfällig</span>
                <span className="stat-sub">Rückgabe ausstehend</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{returnedCount}</span>
                <span className="stat-label">Zurückgegeben</span>
                <span className="stat-sub">abgeschlossen</span>
              </div>
            </div>

            {/* Filter */}
            <div className="filter-bar">
              <div className="filter-group">
                {(["alle", "verleiher", "entleiher"] as FilterRole[]).map((r) => (
                  <button
                    key={r}
                    className={`filter-btn${filterRole === r ? " active" : ""}`}
                    onClick={() => setFilterRole(r)}
                  >
                    {r === "alle" ? "Alle Rollen" : r === "verleiher" ? "Als Verleiher" : "Als Entleiher"}
                  </button>
                ))}
              </div>
              <div className="filter-sep" />
              <div className="filter-group">
                {(["alle", "aktiv", "ueberfaellig", "zurueck"] as FilterStatus[]).map((s) => (
                  <button
                    key={s}
                    className={`filter-btn${filterStatus === s ? " active" : ""}`}
                    onClick={() => setFilterStatus(s)}
                  >
                    {s === "alle" ? "Alle Status" : s === "aktiv" ? "Aktiv" : s === "ueberfaellig" ? "Überfällig" : "Zurückgegeben"}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {actionError && (
              <div style={{ background: "rgba(180,60,60,0.08)", border: "1px solid rgba(180,60,60,0.3)", borderRadius: 2, padding: "10px 14px", fontSize: 11, color: "var(--red)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>⚠ {actionError}</span>
                <button onClick={() => setActionError(null)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            )}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Leihvorgänge</span>
                <span className="card-count">{filtered.length} Einträge</span>
              </div>
              {loading ? (
                <div className="empty">Lade Leihdaten…</div>
              ) : filtered.length === 0 ? (
                <div className="empty">Keine Leihen gefunden.</div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Objekt</th>
                      <th>Verleiher</th>
                      <th>Entleiher</th>
                      <th>Zeitraum</th>
                      <th>Status</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((loan) => {
                      const isLender = loan.lenderName != null;
                      return (
                        <tr key={loan.id}>
                          <td><span className="td-id">LEI-{String(loan.id).padStart(3, "0")}</span></td>
                          <td><span className="td-name">{loan.objectName ?? `Objekt #${loan.objectId}`}</span></td>
                          <td>
                            {displayName(loan.lenderFirstName, loan.lenderLastName, loan.lenderName)}
                            {isLender && <span className="role-chip role-chip--lender" style={{ marginLeft: 6 }}>Ich</span>}
                          </td>
                          <td>
                            {displayName(loan.borrowerFirstName, loan.borrowerLastName, loan.borrowerName)}
                            {!isLender && <span className="role-chip role-chip--borrower" style={{ marginLeft: 6 }}>Ich</span>}
                          </td>
                          <td style={{ whiteSpace: "nowrap", fontSize: 10 }}>
                            {fmt(loan.startDate)} → {fmt(loan.endDate)}
                          </td>
                          <td><StatusPill loan={loan} /></td>
                          <td>
                            <div className="td-actions">
                              {isLender && loan.status === "offen" && (
                                <button
                                  className="tbl-btn"
                                  onClick={() => handleStatusChange(loan.id, "zurückgegeben")}
                                  title="Als zurückgegeben markieren"
                                >
                                  ✓ Zurück
                                </button>
                              )}
                              {isLender && loan.status === "zurückgegeben" && (
                                <button
                                  className="tbl-btn"
                                  onClick={() => handleStatusChange(loan.id, "offen")}
                                  title="Als aktiv markieren"
                                >
                                  ↩ Reaktivieren
                                </button>
                              )}
                              {isLender && (
                                <button
                                  className="tbl-btn tbl-btn--danger"
                                  onClick={() => handleDelete(loan.id)}
                                  title="Leihe löschen"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </main>

          <footer className="statusbar">
            <span><span className="status-dot" />System online</span>
            <span>Collectio Zoologica · Leihverwaltung</span>
            <span>TLS 1.3 · Verschlüsselt</span>
          </footer>
        </div>
      </div>

      {showModal && clerkId && (
        <CreateLoanModal
          objects={objects}
          users={users}
          getToken={getToken}
          onCreated={() => { setShowModal(false); fetchLoans(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
