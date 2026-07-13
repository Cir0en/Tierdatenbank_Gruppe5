"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Navbar from "../components/Navbar";

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ═══════════════════════════════════════════════════════════════════════════
// Seite: /leihe
// Zweck: Verwaltung aller Leihvorgänge des eingeloggten Nutzers — sowohl als
//        Verleiher (eigene Objekte, die man verliehen hat) als auch als
//        Entleiher (Objekte, die man sich von anderen ausgeliehen hat).
//        Erlaubt Anlegen neuer Ausleihen, Rückgabe, Verlängern des
//        Rückgabedatums sowie Löschen (jeweils nur als Verleiher möglich).
// Rollen: Setzt einen eingeloggten Nutzer voraus; Aktionen (zurückgeben,
//        verlängern, löschen) sind nur für den Verleiher (isLender) der
//        jeweiligen Leihe sichtbar, unabhängig von der globalen Nutzerrolle.
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

type MyObject = { id: number; name: string | null; collectionName: string | null; isOnLoan: boolean };
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
function effectiveStatus(loan: Loan): "aktiv" | "überfällig" | "zurückgegeben" {
  if (loan.isOverdue) return "überfällig";
  if (loan.status === "zurückgegeben") return "zurückgegeben";
  return "aktiv"; // DB speichert laufende Leihen als 'offen', UI zeigt 'aktiv'
}

// Farbiges Status-Badge für eine einzelne Leihe.
function StatusPill({ loan }: { loan: Loan }) {
  const s = effectiveStatus(loan);
  const cls: Record<string, string> = {
    "aktiv": "pill pill--green",
    "überfällig": "pill pill--red",
    "zurückgegeben": "pill pill--gray",
  };
  return <span className={cls[s]}>{s}</span>;
}

// ── Modal: Neue Ausleihe ───────────────────────────────────────────────────

// Modal zum Anlegen einer neuen Ausleihe: Nutzer wählt eines seiner eigenen
// Objekte (`objects`, aus /api/loan/my-objects) sowie einen Entleiher
// (`users`, aus /api/loan/users) und einen Zeitraum aus. Bereits verliehene
// Objekte werden in der Auswahl deaktiviert (statt erst beim Absenden mit
// einem 409-Konflikt zu enden), eine Suche filtert die Objektliste bei vielen
// Einträgen.
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
  const [objectSearch, setObjectSearch] = useState("");
  const [objectId, setObjectId]     = useState<number | "">("");
  const [borrowerId, setBorrowerId] = useState<number | "">("");
  const [startDate, setStartDate]   = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]       = useState<string>("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const filteredObjects = objects.filter((o) => {
    const q = objectSearch.trim().toLowerCase();
    if (!q) return true;
    return (o.name ?? "").toLowerCase().includes(q) || (o.collectionName ?? "").toLowerCase().includes(q);
  });

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

          <div>
            <label className="form-label">Objekt</label>
            <input
              className="form-input"
              type="text"
              placeholder="Objekt suchen…"
              value={objectSearch}
              onChange={(e) => setObjectSearch(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            <select
              className="form-select"
              value={objectId}
              onChange={(e) => setObjectId(Number(e.target.value))}
              required
              size={Math.min(6, Math.max(4, filteredObjects.length + 1))}
            >
              <option value="">— Objekt auswählen —</option>
              {filteredObjects.map((o) => (
                <option key={o.id} value={o.id} disabled={o.isOnLoan}>
                  {o.name ?? `Objekt #${o.id}`}
                  {o.collectionName ? ` (${o.collectionName})` : ""}
                  {o.isOnLoan ? " — bereits verliehen" : ""}
                </option>
              ))}
              {filteredObjects.length === 0 && <option disabled>Keine Objekte gefunden</option>}
            </select>
          </div>

          <div>
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
          </div>

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

// ── Modal: Ausleihe verlängern ─────────────────────────────────────────────

// Modal zum Verlängern des Rückgabedatums einer aktiven Ausleihe. Das neue
// Datum muss nach dem bisherigen liegen (serverseitig zusätzlich geprüft).
function ExtendLoanModal({
  loan, getToken, onExtended, onClose,
}: {
  loan: Loan;
  getToken: () => Promise<string | null>;
  onExtended: () => void;
  onClose: () => void;
}) {
  const minDate = loan.endDate
    ? new Date(new Date(loan.endDate).getTime() + 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [newEndDate, setNewEndDate] = useState<string>(minDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/loan/${loan.id}/extend`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ newEndDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Fehler ${res.status}`);
      }
      onExtended();
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
          <span className="modal-title">Ausleihe verlängern</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <p style={{ fontSize: 13, color: "#374151" }}>
            <strong>{loan.objectName ?? `Objekt #${loan.objectId}`}</strong> ist derzeit bis <strong>{fmt(loan.endDate)}</strong> verliehen.
          </p>
          <div>
            <label className="form-label">Neues Rückgabedatum</label>
            <input
              className="form-input"
              type="date"
              value={newEndDate}
              min={minDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Wird gespeichert…" : "Verlängern"}
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
// Aktionen zum Zurückgeben, Verlängern bzw. Löschen einzelner Leihen an.
export default function LeihePage() {
  const { userId: clerkId, getToken } = useAuth();

  const [loans, setLoans]         = useState<Loan[]>([]);
  const [objects, setObjects]     = useState<MyObject[]>([]);
  const [users, setUsers]         = useState<LoanUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [extendLoan, setExtendLoan] = useState<Loan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [filterRole, setFilterRole]     = useState<FilterRole>("alle");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("alle");

  // Baut den Authorization-Header für alle Leihe-Anfragen (Bearer-Token aus
  // Clerk) — der LoanController erfordert eine gültige JWT-Authentifizierung
  // ([Authorize]), ein einfacher Nutzer-Id-Header genügt hier bewusst nicht.
  const authHeaders = async (): Promise<Record<string, string> | undefined> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  // Lädt die eigene numerische DB-Id (nicht die Clerk-Id), um pro Leihe zu
  // bestimmen, ob der aktuelle Nutzer Verleiher oder Entleiher ist — loan.lenderName
  // ist für jede Leihe gesetzt (jede Leihe hat einen Verleiher), taugt also nicht
  // als Unterscheidungsmerkmal für die eigene Rolle.
  const fetchCurrentUser = async () => {
    if (!clerkId) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/users/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const me = await res.json();
        setCurrentUserId(me.id ?? null);
      }
    } catch {
      // currentUserId bleibt null; Rollen-Kennzeichnung/Aktionsbuttons werden dann ausgeblendet
    }
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
    fetchCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkId]);

  // Markiert eine Leihe als zurückgegeben (nur Verleiher, nur aus Status "offen").
  const handleReturn = async (loanId: number) => {
    if (!clerkId) return;
    setActionError(null);
    setBusyId(loanId);
    try {
      const auth = await authHeaders();
      const res = await fetch(`${API}/api/loan/${loanId}/return`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...auth },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.message ?? `Fehler ${res.status} — Rückgabe konnte nicht vermerkt werden.`);
      }
    } catch {
      setActionError("Server nicht erreichbar — Rückgabe konnte nicht vermerkt werden.");
    } finally {
      setBusyId(null);
      fetchLoans();
      fetchSupportData();
    }
  };

  // Löscht eine Leihe nach Bestätigungsdialog (nur für den Verleiher sichtbar/möglich).
  const handleDelete = async (loanId: number) => {
    if (!clerkId) return;
    if (!confirm("Leihe wirklich löschen?")) return;
    setActionError(null);
    setBusyId(loanId);
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
      setBusyId(null);
      fetchLoans();
      fetchSupportData();
    }
  };

  // Filter
  // Wendet die Rollen- (Verleiher/Entleiher) und Status-Filter der Toolbar
  // client-seitig auf die geladene Leihenliste an; nutzt effectiveStatus()
  // für den Statusabgleich, damit "aktiv"/"überfällig" korrekt greifen.
  const filtered = loans.filter((l) => {
    const roleOk =
      filterRole === "alle" ||
      (filterRole === "verleiher" && currentUserId != null && l.lenderId === currentUserId) ||
      (filterRole === "entleiher" && currentUserId != null && l.borrowerId === currentUserId);

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
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #f8f9fa; font-family: 'Inter', system-ui, sans-serif; font-size: 13px; overflow: hidden; }

        .app-shell { display: flex; height: 100vh; overflow: hidden; }
        .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        .topbar { height: 56px; display: flex; align-items: center; padding: 0 24px; background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; gap: 12px; }
        .topbar-title { font-size: 16px; font-weight: 700; color: #111827; }
        .topbar-spacer { flex: 1; }

        .content { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 18px; }

        /* Stats */
        .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .stat-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; }
        .stat-value { font-size: 26px; font-weight: 700; color: #111827; line-height: 1; }
        .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }

        /* Filter bar */
        .filter-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .filter-group { display: flex; gap: 6px; }
        .filter-btn { background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 6px 14px; font-size: 12px; color: #6b7280; cursor: pointer; transition: all .15s; font-family: inherit; }
        .filter-btn:hover { border-color: #6ee7b7; color: #111827; }
        .filter-btn.active { background: #f0fdf4; border-color: #059669; color: #065f46; font-weight: 600; }
        .filter-spacer { flex: 1; }

        /* Card + Table */
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
        .card-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #f3f4f6; }
        .card-title { font-size: 13px; font-weight: 700; color: #111827; }
        .card-count { font-size: 12px; color: #9ca3af; }

        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #f3f4f6; background: #fafafa; }
        .tbl td { padding: 11px 16px; font-size: 13px; color: #374151; border-bottom: 1px solid #f9fafb; vertical-align: middle; }
        .tbl tr:last-child td { border-bottom: none; }
        .tbl tr:hover td { background: #f9fafb; }
        .td-name { color: #111827; font-weight: 500; }
        .td-id { color: #9ca3af; font-size: 11px; }
        .td-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

        .tbl-btn { font-size: 11px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 10px; color: #374151; cursor: pointer; font-family: inherit; transition: all .15s; white-space: nowrap; }
        .tbl-btn:hover { border-color: #6ee7b7; background: #f0fdf4; }
        .tbl-btn:disabled { opacity: .5; cursor: not-allowed; }
        .tbl-btn--danger { color: #dc2626; border-color: #fecaca; }
        .tbl-btn--danger:hover { background: #fef2f2; border-color: #fca5a5; }

        /* Pills */
        .pill { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .pill--green { background: #d1fae5; color: #065f46; }
        .pill--red   { background: #fee2e2; color: #991b1b; }
        .pill--gray  { background: #f3f4f6; color: #6b7280; }

        .role-chip { display: inline-flex; align-items: center; font-size: 10px; padding: 2px 7px; border-radius: 999px; font-weight: 600; margin-left: 6px; }
        .role-chip--lender   { background: #dbeafe; color: #1e40af; }
        .role-chip--borrower { background: #d1fae5; color: #065f46; }

        /* Empty state */
        .empty { padding: 40px; text-align: center; color: #9ca3af; font-size: 13px; }

        /* Buttons */
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all .15s; }
        .btn--primary { background: #059669; color: #fff; }
        .btn--primary:hover { background: #047857; }
        .btn--primary:disabled { opacity: .6; cursor: not-allowed; }
        .btn--ghost { background: #fff; border: 1px solid #e5e7eb; color: #374151; }
        .btn--ghost:hover { border-color: #6ee7b7; }

        /* Modal */
        .modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .modal { background: #fff; border-radius: 12px; width: 460px; max-width: 100%; box-shadow: 0 12px 40px rgba(0,0,0,.2); }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
        .modal-title { font-size: 14px; font-weight: 700; color: #111827; }
        .modal-close { background: none; border: none; font-size: 16px; color: #9ca3af; cursor: pointer; }
        .modal-close:hover { color: #111827; }
        .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding-top: 4px; }

        /* Form */
        .form-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; display: block; margin-bottom: 5px; }
        .form-select, .form-input {
          width: 100%; padding: 8px 10px; background: #fff;
          border: 1px solid #e5e7eb; border-radius: 8px;
          font-family: inherit; font-size: 13px; color: #111827;
          outline: none; transition: border-color .15s;
        }
        .form-select:focus, .form-input:focus { border-color: #059669; }
        .form-row { display: flex; gap: 12px; }
        .form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 12px; color: #b91c1c; }

        /* Error banner */
        .error-banner { padding: 10px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #b91c1c; font-size: 12px; display: flex; align-items: center; justify-content: space-between; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #d1fae5; border-radius: 2px; }
      `}</style>

      <div className="app-shell">
        <Navbar activeNav="leihe" />

        <div className="main-area">
          <header className="topbar">
            <span className="topbar-title">Ausleihe</span>
            <div className="topbar-spacer" />
            <button className="btn btn--primary" onClick={() => setShowModal(true)}>
              + Neue Ausleihe
            </button>
          </header>

          <main className="content">

            {/* Stats */}
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-value">{loans.length}</div>
                <div className="stat-label">Leihen gesamt</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{activeCount}</div>
                <div className="stat-label">Aktiv</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: overdueCount > 0 ? "#dc2626" : undefined }}>{overdueCount}</div>
                <div className="stat-label">Überfällig</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{returnedCount}</div>
                <div className="stat-label">Zurückgegeben</div>
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

            {actionError && (
              <div className="error-banner">
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer" }}>✕</button>
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
                      // Eigene Rolle in dieser konkreten Leihe: Vergleich gegen die eigene
                      // numerische DB-Id, nicht gegen die (immer gesetzten) Namensfelder.
                      const isLender = currentUserId != null && loan.lenderId === currentUserId;
                      const isBorrower = currentUserId != null && loan.borrowerId === currentUserId;
                      return (
                        <tr key={loan.id}>
                          <td><span className="td-id">LEI-{String(loan.id).padStart(3, "0")}</span></td>
                          <td><span className="td-name">{loan.objectName ?? `Objekt #${loan.objectId}`}</span></td>
                          <td>
                            {displayName(loan.lenderFirstName, loan.lenderLastName, loan.lenderName)}
                            {isLender && <span className="role-chip role-chip--lender">Ich</span>}
                          </td>
                          <td>
                            {displayName(loan.borrowerFirstName, loan.borrowerLastName, loan.borrowerName)}
                            {isBorrower && <span className="role-chip role-chip--borrower">Ich</span>}
                          </td>
                          <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                            {fmt(loan.startDate)} → {fmt(loan.endDate)}
                          </td>
                          <td><StatusPill loan={loan} /></td>
                          <td>
                            <div className="td-actions">
                              {isLender && loan.status === "offen" && (
                                <>
                                  <button
                                    className="tbl-btn"
                                    disabled={busyId === loan.id}
                                    onClick={() => handleReturn(loan.id)}
                                    title="Als zurückgegeben markieren"
                                  >
                                    Zurückgeben
                                  </button>
                                  <button
                                    className="tbl-btn"
                                    disabled={busyId === loan.id}
                                    onClick={() => setExtendLoan(loan)}
                                    title="Rückgabedatum verlängern"
                                  >
                                    Verlängern
                                  </button>
                                </>
                              )}
                              {isLender && (
                                <button
                                  className="tbl-btn tbl-btn--danger"
                                  disabled={busyId === loan.id}
                                  onClick={() => handleDelete(loan.id)}
                                  title="Leihe löschen"
                                >
                                  Löschen
                                </button>
                              )}
                              {!isLender && <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>}
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
        </div>
      </div>

      {showModal && clerkId && (
        <CreateLoanModal
          objects={objects}
          users={users}
          getToken={getToken}
          onCreated={() => { setShowModal(false); fetchLoans(); fetchSupportData(); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {extendLoan && (
        <ExtendLoanModal
          loan={extendLoan}
          getToken={getToken}
          onExtended={() => { setExtendLoan(null); fetchLoans(); }}
          onClose={() => setExtendLoan(null)}
        />
      )}
    </>
  );
}
