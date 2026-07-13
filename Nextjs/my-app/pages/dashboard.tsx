"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { formatDate } from "../utils/date";
import Navbar from "../components/Navbar";
import { Map, MapStyle, config, Marker } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

const API = "http://localhost:5099";

// ═══════════════════════════════════════════════════════════════════════════
// Seite: /dashboard
// Zweck: Alternative/ältere Variante des Übersichts-Dashboards (siehe auch
//        pages/index.tsx, das dieselbe Funktion für Gäste + eingeloggte
//        Nutzer übernimmt). Zeigt Kennzahlen, zuletzt erfasste Objekte,
//        aktive Leihen (live aus dem Backend statt Mock-Daten), eine
//        Mini-Kartenvorschau und ein rollenbasiertes Benachrichtigungs-Panel.
// Rollen: Setzt einen eingeloggten Nutzer voraus (kein Gast-Modus wie bei
//        index.tsx); Inhalte variieren je nach Rolle (Nutzer/Moderator/Admin).
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────────────
type Specimen = {
  id: string; name: string; taxon?: string; fundort?: string;
  datum?: string; findDate?: string; sammlung?: string; status: "freigegeben" | "ausstehend" | "abgelehnt";
};
type Loan = {
  id: number;
  objectId: number | null;
  objectName: string | null;
  borrowerFirstName: string | null;
  borrowerLastName: string | null;
  borrowerName: string | null;
  endDate: string | null;
  status: string | null;
  isOverdue: boolean;
};









// ── Sub-components ─────────────────────────────────────────────────────────

// Kleine Kennzahlen-Kachel (z. B. "Objekte gesamt", "Aktive Leihen").
function StatCard({ value, label, sub, accent }: { value: string | number; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`stat-card${accent ? " stat-card--accent" : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

// Farbiges Status-Badge für Objekt- oder Leihe-Status (grün/gelb/rot/grau je nach Zustand).
function StatusPill({ status }: { status: Specimen["status"] | string | null }) {
  const map: Record<string, string> = {
    freigegeben: "pill--green",
    ausstehend:  "pill--amber",
    abgelehnt:   "pill--red",
    aktiv:       "pill--green",
    überfällig:  "pill--red",
    zurückgegeben: "pill--gray",
  };
  const s = status ?? "";
  return <span className={`pill ${map[s] ?? "pill--gray"}`}>{s}</span>;
}

// ── Main Component ─────────────────────────────────────────────────────────

// Hauptkomponente der /dashboard-Seite. Lädt Objekte, Leihen und
// rollenspezifische Benachrichtigungsdaten jeweils über eigene useEffect-Hooks.
export default function DashboardPage() {
  const { signOut } = useClerk();
  const { userId: clerkId, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [MOCK_SPECIMENS, setAnimals] = useState<Specimen[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [pendingTax, setPendingTax] = useState(0);
  const [userRole, setUserRole] = useState('Nutzer');

  const miniMapContainer = useRef<HTMLDivElement>(null);
  const miniMapInstance  = useRef<Map | null>(null);
  const notifWrapRef     = useRef<HTMLDivElement>(null);

  // Close notification panel on outside click
  useEffect(() => {
    if (!showNotif) return;
    const handler = (e: MouseEvent) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotif]);

  // Fetch all animals
  // Lädt den "zuletzt erfasste Objekte"-Feed und pollt ihn alle 5 Sekunden,
  // damit neu erfasste Tiere zeitnah im Dashboard auftauchen.
  useEffect(() => {
    const fetchAnimals = async () => {
      const response = await fetch(`${API}/api/animals/dashboard`);
      const data = await response.json();
      setAnimals(data);
    };
    fetchAnimals();

    const interval = setInterval(fetchAnimals, 5000);

    return () => clearInterval(interval);
  }, []);

  // Fetch active loans
  // Lädt die Leihen des Nutzers per Bearer-Token (LoanController erfordert
  // [Authorize]) und filtert bereits zurückgegebene Leihen heraus, damit nur
  // aktive/überfällige in der "Aktive Leihen"-Kachel erscheinen.
  useEffect(() => {
    if (!clerkId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API}/api/loan`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const data: Loan[] = await res.json();
        if (!cancelled) setLoans(data.filter((l) => l.status !== "zurückgegeben"));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [clerkId, getToken]);

  // Fetch role + role-specific notification data
  // Lädt die eigene Rolle per Bearer-Token (getToken()) — hier also ein
  // anderes Auth-Muster als bei den Leihen oben — und danach, nur für
  // Moderator/Admin, die Anzahl ausstehender Taxonomie-Einreichungen.
  // `cancelled` verhindert, dass nach einem Unmount/erneuten Effect-Lauf noch
  // State auf einer veralteten Anfrage gesetzt wird (Race-Condition-Schutz).
  useEffect(() => {
    if (!clerkId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const role = data.role ?? 'Nutzer';
        if (!cancelled) setUserRole(role);
        if ((role === 'Moderator' || role === 'Admin') && !cancelled) {
          const taxRes = await fetch(`${API}/api/taxonomy/submissions/pending`);
          if (taxRes.ok && !cancelled) setPendingTax((await taxRes.json()).length);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [clerkId, getToken]);

  // Mini-map initialization
  // Initialisiert die MapTiler-Kartenvorschau einmalig und zeigt anschließend
  // alle bekannten Fundorte als Marker an; räumt die Karteninstanz beim Unmount auf.
  useEffect(() => {
    if (!miniMapContainer.current || miniMapInstance.current) return;

    config.apiKey = process.env.NEXT_PUBLIC_MAP_API_KEY as string;

    const map = new Map({
      container: miniMapContainer.current,
      style: MapStyle.STREETS,
      center: [8.0020, 50.9411],
      zoom: 4,
      interactive: false,
    });
    miniMapInstance.current = map;

    // Datenbankeinträge als Marker in der Vorschau-Karte anzeigen
    map.on('load', async () => {
      try {
        const res = await fetch('http://localhost:5099/api/geolocations/map-items');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const items: { latitude: number; longitude: number }[] = await res.json();

        items.forEach(({ longitude, latitude }) => {
          new Marker({ color: '#1a73e8' }).setLngLat([longitude, latitude]).addTo(map);
        });
      } catch (err) {
        // Vorschau-Karte bleibt leer, aber das Dashboard funktioniert weiterhin
        console.error('Kartenvorschau: Marker konnten nicht geladen werden:', err);
      }
    });

    return () => {
      if (miniMapInstance.current) {
        miniMapInstance.current.remove();
        miniMapInstance.current = null;
      }
    };
  }, []);



  const pending   = MOCK_SPECIMENS.filter((s) => s.status === "ausstehend").length;
  const overdue   = loans.filter((l) => l.isOverdue).length;

  // Role-based notifications
  // Baut die Liste der Benachrichtigungen aus den bereits geladenen Daten:
  // überfällige Leihen und bald fällige Leihen (≤ 3 Tage) für alle Nutzer,
  // ausstehende Taxonomie-Freigaben für Moderator/Admin, sowie ausstehende
  // Objekt-Freigaben nur für Admin.
  interface Notif { icon: string; text: string; sub: string; href: string; urgent?: boolean; }
  const notifications: Notif[] = [];
  if (overdue > 0)
    notifications.push({ icon: '⚠', text: `${overdue} Leihe${overdue !== 1 ? 'n' : ''} überfällig`, sub: 'Rückgabe überschritten', href: '/leihe', urgent: true });
  const soonLoans = loans.filter(l => { if (!l.endDate || l.isOverdue) return false; return (new Date(l.endDate).getTime() - Date.now()) / 86400000 <= 3; });
  if (soonLoans.length > 0)
    notifications.push({ icon: '📅', text: `${soonLoans.length} Leihe${soonLoans.length !== 1 ? 'n' : ''} bald fällig`, sub: 'Rückgabe in ≤ 3 Tagen', href: '/leihe' });
  if ((userRole === 'Moderator' || userRole === 'Admin') && pendingTax > 0)
    notifications.push({ icon: '🌿', text: `${pendingTax} Taxonomie-Einreichung${pendingTax !== 1 ? 'en' : ''} ausstehend`, sub: 'Warten auf Moderation', href: '/moderator', urgent: pendingTax >= 5 });
  if (userRole === 'Admin' && pending > 0)
    notifications.push({ icon: '📋', text: `${pending} Objekt${pending !== 1 ? 'e' : ''} ausstehend`, sub: 'Warten auf Freigabe', href: '/moderator' });

  return (
    <>
      {/* Komponenten-Styling (CSS-in-JS) für das Dashboard; Abschnitte sind unten mit „── ── " markiert. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          -/* Backgrounds: Sauber und hell */
          --bg:          #ffffff;           /* Reinweiß für den Hauptinhalt */
          --bg-surface:  #f8f9fa;           /* Google-Grau für Sidebars/Hintergründe */
          --bg-card:     #ffffff;           /* Karten heben sich durch Schatten ab, nicht durch Farbe */

          /* Brand Colors: Das typische Google-Blau */
          --primary:      #1a73e8;          /* Das klassische Link- und Button-Blau */
          --primary-dim:  rgba(26, 115, 232, 0.1);
          --primary-glow: rgba(26, 115, 232, 0.04);

          /* Text: Hoher Kontrast für Lesbarkeit */
          --text-hi:     #202124;           /* Fast Schwarz für Headlines */
          --text-mid:    #5f6368;           /* Dunkelgrau für Fließtext */
          --text-lo:     #70757a;           /* Mittleres Grau für Metadaten/Captions */

          /* Status-Farben: Klar und kräftig */
          --amber:       #f9ab00;           /* Google-Gelb/Orange */
          --red:         #d93025;           /* Google/YouTube-Rot */
          --border:      #dadce0;           /* Subtile Trennlinien */

          /* Layout & Typo */
          --sidebar-w:   240px;
          --top-h:       64px;
          --ff-sans:     'Inter', 'Roboto', system-ui, sans-serif;
          --ff-mono:     'Roboto Mono', monospace;
        }

        html, body { height: 100%; background: var(--bg); color: var(--text-hi); font-family: var(--ff-mono); font-size: 13px; overflow: hidden; }

        /* ── Background layers ── */
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
        }
        .bg-glow::before {
          content: ''; position: absolute; top: -20%; left: -10%; width: 60%; height: 60%;
          background: radial-gradient(ellipse, rgba(74,110,61,0.09) 0%, transparent 70%);
          animation: driftA 22s ease-in-out infinite alternate;
        }
        .bg-glow::after {
          content: ''; position: absolute; bottom: -20%; right: -10%; width: 50%; height: 50%;
          background: radial-gradient(ellipse, rgba(100,70,30,0.07) 0%, transparent 70%);
          animation: driftB 28s ease-in-out infinite alternate;
        }
        @keyframes driftA { from { transform: translate(0,0); } to { transform: translate(3%,2%); } }
        @keyframes driftB { from { transform: translate(0,0); } to { transform: translate(-2%,-3%); } }

        .grid-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: linear-gradient(rgba(74,110,61,0.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(74,110,61,0.035) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .scanlines {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px);
        }

        /* ── App shell ── */
        .app { position: relative; z-index: 10; display: flex; height: 100vh; overflow: hidden; }

        /* ── Main area ── */
        .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        /* ── Top bar ── */
        .topbar {
          height: var(--top-h); display: flex; align-items: center; gap: 16px;
          padding: 0 20px; border-bottom: 1px solid var(--border);
          background: var(--bg-surface); flex-shrink: 0;
        }
        .topbar-title {
          font-family: var(--ff-serif); font-size: 18px; font-weight: 300;
          color: var(--text-hi); letter-spacing: 0.02em;
        }
        .topbar-title em { font-style: italic; color: var(--text-mid); }
        .topbar-spacer { flex: 1; }

        .topbar-search {
          display: flex; align-items: center; gap: 8px;
          background: rgba(74,110,61,0.05); border: 1px solid var(--border);
          border-radius: 2px; padding: 5px 10px;
        }
        .topbar-search input {
          background: none; border: none; outline: none; color: var(--text-hi);
          font-family: var(--ff-mono); font-size: 11px; width: 160px;
        }
        .topbar-search input::placeholder { color: var(--text-lo); }
        .search-icon { color: var(--text-lo); font-size: 11px; }

        .notif-btn {
          position: relative; background: none; border: 1px solid var(--border);
          border-radius: 2px; width: 30px; height: 30px; display: flex;
          align-items: center; justify-content: center; cursor: pointer;
          color: var(--text-mid); font-size: 13px; transition: border-color 0.15s;
        }
        .notif-btn:hover { border-color: var(--green-dim); }
        .notif-badge {
          position: absolute; top: -4px; right: -4px; width: 14px; height: 14px;
          background: rgba(180,60,60,0.9); border-radius: 50%;
          font-size: 8px; display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 400;
        }

        .profile-chip {
          display: flex; align-items: center; gap: 8px;
          background: var(--green-glow); border: 1px solid var(--green-dim);
          border-radius: 2px; padding: 5px 10px; cursor: pointer;
          transition: border-color 0.15s;
        }
        .profile-chip:hover { border-color: rgba(74,110,61,0.45); }
        .avatar {
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--green-dim); display: flex; align-items: center;
          justify-content: center; font-size: 9px; color: var(--text-mid); flex-shrink: 0;
        }
        .profile-name { font-size: 11px; color: var(--text-hi); letter-spacing: 0.05em; }
        .profile-role {
          font-size: 9px; letter-spacing: 0.1em; color: var(--text-lo);
          text-transform: uppercase;
        }

        .logout-btn {
          display: flex; align-items: center; gap: 6px; background: none;
          border: 1px solid var(--border); border-radius: 2px; padding: 5px 10px;
          color: var(--text-lo); cursor: pointer; font-family: var(--ff-mono);
          font-size: 10px; letter-spacing: 0.08em; transition: all 0.15s;
        }
        .logout-btn:hover { border-color: rgba(180,60,60,0.4); color: rgba(180,60,60,0.7); }

        /* ── Content ── */
        .content {
          flex: 1; overflow-y: auto; padding: 20px;
          display: flex; flex-direction: column; gap: 16px;
        }

        /* ── Section header ── */
        .section-header {
          display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px;
        }
        .section-title {
          font-family: var(--ff-serif); font-size: 14px; font-weight: 400;
          color: var(--text-mid); letter-spacing: 0.15em; text-transform: uppercase;
        }
        .section-line { flex: 1; height: 1px; background: var(--border); }
        .section-count { font-size: 10px; color: var(--text-lo); }

        /* ── Stat grid ── */
        .stat-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;
        }
        .stat-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 2px; padding: 14px 16px; position: relative; overflow: hidden;
          animation: fadeUp 0.5s ease both;
        }
        .stat-card::before {
          content: ''; position: absolute; top: -1px; left: -1px;
          width: 14px; height: 14px;
          border-top: 1.5px solid var(--green-dim); border-left: 1.5px solid var(--green-dim);
        }
        .stat-card--accent { border-color: rgba(74,110,61,0.35); }
        .stat-value {
          display: block; font-family: var(--ff-serif); font-size: 32px;
          font-weight: 300; color: var(--text-hi); line-height: 1; margin-bottom: 4px;
        }
        .stat-label { display: block; font-size: 10px; letter-spacing: 0.12em; color: var(--text-mid); text-transform: uppercase; }
        .stat-sub { display: block; font-size: 9px; color: var(--text-lo); margin-top: 3px; }

        /* ── Two-column layout ── */
        .two-col { display: grid; grid-template-columns: 1fr 340px; gap: 14px; }
        @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

        /* ── Card ── */
        .card {
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 2px;
          overflow: hidden; animation: fadeUp 0.55s ease both;
        }
        .card-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-bottom: 1px solid var(--border);
        }
        .card-title { font-size: 10px; letter-spacing: 0.15em; color: var(--text-mid); text-transform: uppercase; }
        .card-action {
          font-size: 10px; letter-spacing: 0.08em; color: var(--green);
          background: none; border: none; cursor: pointer; font-family: var(--ff-mono);
          padding: 3px 8px; border: 1px solid var(--green-dim); border-radius: 2px;
          transition: all 0.15s; text-decoration: none;
        }
        .card-action:hover { background: var(--green-glow); }

        /* ── Table ── */
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th {
          text-align: left; padding: 8px 12px; font-size: 9px; letter-spacing: 0.12em;
          color: var(--text-lo); text-transform: uppercase; border-bottom: 1px solid var(--border);
          font-weight: 400;
        }
        .tbl td {
          padding: 9px 12px; font-size: 11px; color: var(--text-mid);
          border-bottom: 1px solid rgba(74,110,61,0.07);
        }
        .tbl tr:hover td { background: var(--green-glow); }
        .tbl tr:last-child td { border-bottom: none; }
        .td-name { color: var(--text-hi); font-style: italic; }
        .td-id { color: var(--text-lo); font-size: 10px; }
        .td-actions { display: flex; gap: 6px; }
        .tbl-btn {
          font-size: 9px; letter-spacing: 0.06em; background: none;
          border: 1px solid var(--border); border-radius: 2px; padding: 2px 7px;
          color: var(--text-lo); cursor: pointer; font-family: var(--ff-mono);
          transition: all 0.15s;
        }
        .tbl-btn:hover { border-color: var(--green-dim); color: var(--text-mid); }

        /* ── Pills ── */
        .pill {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 9px; letter-spacing: 0.1em; padding: 2px 7px;
          border-radius: 2px; text-transform: uppercase;
        }
        .pill::before { content: ''; width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; }
        .pill--green  { background: rgba(74,110,61,0.12); color: rgba(120,180,90,0.85); }
        .pill--green::before  { background: rgba(100,180,80,0.7); }
        .pill--amber  { background: rgba(180,130,40,0.12); color: var(--amber); }
        .pill--amber::before  { background: var(--amber); }
        .pill--red    { background: rgba(180,60,60,0.12); color: var(--red); }
        .pill--red::before    { background: var(--red); }
        .pill--gray   { background: rgba(100,100,100,0.1); color: rgba(140,140,140,0.6); }
        .pill--gray::before   { background: rgba(140,140,140,0.4); }

        /* ── Quick actions ── */
        .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
        .action-btn {
          display: flex; flex-direction: column; gap: 4px; padding: 12px;
          background: rgba(74,110,61,0.05); border: 1px solid var(--border);
          border-radius: 2px; cursor: pointer; transition: all 0.15s; text-decoration: none;
        }
        .action-btn:hover { border-color: var(--green-dim); background: var(--green-glow); }
        .action-icon { font-size: 16px; }
        .action-label { font-size: 10px; letter-spacing: 0.08em; color: var(--text-mid); }
        .action-desc { font-size: 9px; color: var(--text-lo); }

        /* ── Map placeholder ── */
        .map-placeholder {
          padding: 0; min-height: 160px; position: relative; overflow: hidden;
          background: repeating-linear-gradient(
            45deg, rgba(74,110,61,0.03) 0px, rgba(74,110,61,0.03) 1px,
            transparent 1px, transparent 12px
          );
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 8px;
        }
        .map-grid-line {
          position: absolute; background: rgba(74,110,61,0.08);
        }
        .map-marker {
          position: absolute; width: 8px; height: 8px; border-radius: 50%;
          background: var(--green); animation: markerPulse 2.5s ease-in-out infinite;
        }
        @keyframes markerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,110,61,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(74,110,61,0); }
        }
        .map-hint { font-size: 10px; color: var(--text-lo); letter-spacing: 0.1em; z-index: 2; }

        /* ── Loan list ── */
        .loan-item {
          display: flex; align-items: center; gap: 10px; padding: 9px 14px;
          border-bottom: 1px solid rgba(74,110,61,0.07);
        }
        .loan-item:last-child { border-bottom: none; }
        .loan-info { flex: 1; min-width: 0; }
        .loan-name { font-size: 11px; color: var(--text-hi); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .loan-meta { font-size: 9px; color: var(--text-lo); letter-spacing: 0.05em; margin-top: 2px; }

        /* ── Status bar ── */
        .statusbar {
          height: 30px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; border-top: 1px solid var(--border);
          background: rgba(12,15,10,0.9); flex-shrink: 0;
          font-size: 10px; letter-spacing: 0.1em; color: var(--text-lo);
        }
        .status-dot {
          display: inline-block; width: 5px; height: 5px; border-radius: 50%;
          background: rgba(74,110,61,0.7); margin-right: 6px;
          animation: pulse 2.5s ease infinite; vertical-align: middle;
        }
        @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; box-shadow: 0 0 5px rgba(74,110,61,0.5); } }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Notification panel ── */
        .notif-wrap { position: relative; }
        .notif-panel {
          position: fixed; top: 72px; right: 20px;
          width: 300px; background: var(--bg-card);
          border: 1px solid var(--border); border-radius: 4px;
          box-shadow: 0 8px 32px rgba(0,0,0,.18); z-index: 200; overflow: hidden;
          animation: fadeUp .15s ease both;
        }
        .notif-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-bottom: 1px solid var(--border);
        }
        .notif-head-title { font-size: 10px; letter-spacing: .12em; color: var(--text-mid); text-transform: uppercase; }
        .notif-head-role  { font-size: 9px; color: var(--text-lo); letter-spacing: .08em; padding: 1px 6px; border: 1px solid var(--border); border-radius: 2px; }
        .notif-item {
          display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px;
          border-bottom: 1px solid rgba(74,110,61,0.07); text-decoration: none;
          transition: background .15s;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item:hover { background: rgba(74,110,61,0.05); }
        .notif-item--urgent { border-left: 2px solid var(--red); padding-left: 12px; }
        .notif-item-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
        .notif-item-text { font-size: 11px; color: var(--text-hi); }
        .notif-item-sub  { font-size: 9px; color: var(--text-lo); margin-top: 2px; letter-spacing: .05em; }
        .notif-empty { padding: 20px 14px; text-align: center; font-size: 10px; color: var(--text-lo); letter-spacing: .08em; }
        .notif-footer { padding: 8px 14px; border-top: 1px solid var(--border); text-align: center; }
        .notif-footer a { font-size: 9px; color: rgba(74,110,61,0.8); letter-spacing: .08em; text-decoration: none; }
        .notif-footer a:hover { text-decoration: underline; }

        /* Scroll */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 2px; }
      `}</style>

      {/* Background layers */}
      <div className="bg-glow" />
      <div className="grid-overlay" />
      <div className="scanlines" />

      <div className="app">
        {/* ── Sidebar ── */}
        <Navbar activeNav="index" />

        {/* ── Main ── */}
        <div className="main">
          {/* Top bar */}
          <header className="topbar">
            <h1 className="topbar-title">
              Übersicht <em>/ Dashboard</em>
            </h1>
            <div className="topbar-spacer" />

            {/* Search */}
            <div className="topbar-search">
              <span className="search-icon">⌕</span>
              <input type="text" placeholder="Objekte durchsuchen…" />
            </div>

            {/* Notifications */}
            <div className="notif-wrap" ref={notifWrapRef}>
              <button className="notif-btn" title="Benachrichtigungen" onClick={() => setShowNotif(v => !v)}>
                ◉
                {notifications.length > 0 && (
                  <span className="notif-badge">{notifications.length}</span>
                )}
              </button>
              {showNotif && (
                <div className="notif-panel">
                  <div className="notif-head">
                    <span className="notif-head-title">Benachrichtigungen</span>
                    <span className="notif-head-role">{userRole}</span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="notif-empty">✓ Keine neuen Benachrichtigungen</div>
                  ) : (
                    notifications.map((n, i) => (
                      <Link
                        key={i}
                        href={n.href}
                        className={`notif-item${n.urgent ? ' notif-item--urgent' : ''}`}
                        onClick={() => setShowNotif(false)}
                      >
                        <span className="notif-item-icon">{n.icon}</span>
                        <div>
                          <div className="notif-item-text">{n.text}</div>
                          <div className="notif-item-sub">{n.sub}</div>
                        </div>
                      </Link>
                    ))
                  )}
                  {notifications.length > 0 && (
                    <div className="notif-footer">
                      <Link href={userRole === 'Moderator' || userRole === 'Admin' ? '/moderator' : '/leihe'} onClick={() => setShowNotif(false)}>
                        Alle anzeigen ›
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Logout */}
            <button
              className="logout-btn"
              title="Abmelden"
              onClick={() => signOut(() => router.push("/login"))}
            >
              ⏻ Abmelden
            </button>
          </header>

          {/* Content */}
          <main className="content">

            {/* ── Stats ── */}
            <div>
              <div className="section-header">
                <span className="section-title">Systemübersicht</span>
                <span className="section-line" />
                <span className="section-count">Stand: {new Date().toLocaleDateString("de-DE")}</span>
              </div>
              <div className="stat-grid">
                <StatCard value={MOCK_SPECIMENS.length} label="Objekte gesamt" sub="in allen Sammlungen" accent />
                <StatCard value={3} label="Sammlungen" sub="aktiv" />
                <StatCard value={pending} label="Ausstehend" sub="Taxonomie-Freigabe" />
                <StatCard value={loans.length} label="Aktive Leihen" sub={`${overdue} überfällig`} />
                <StatCard value={12} label="Fundorte" sub="weltweit kartiert" />
              </div>
            </div>

            {/* ── Two column ── */}
            <div className="two-col">

              {/* Left: Objektliste */}
              <div>
                <div className="section-header">
                  <span className="section-title">Zuletzt erfasste Objekte</span>
                  <span className="section-line" />
                  <Link href="/tierliste" className="card-action">Alle anzeigen ›</Link>
                </div>
                <div className="card">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Art (Taxon)</th>
                        <th>Fundort</th>
                        <th>Datum</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_SPECIMENS.map((s) => (
                        <tr key={s.id}>
                          <td><span className="td-id">{s.id}</span></td>
                          <td>
                            <span className="td-name">{s.name}</span>
                            <br />
                            <span style={{ fontSize: 9, color: "var(--text-lo)" }}>{s.taxon}</span>
                          </td>
                          <td>{s.fundort}</td>

                          {/* <td style={{ whiteSpace: "nowrap" }}>{s.datum}</td>*/}
                          <td style={{ whiteSpace: "nowrap" }}>{formatDate(s.findDate)} </td>
                          <td><StatusPill status={s.status} /></td>
                          <td>
                            <div className="td-actions">
                              <button className="tbl-btn">Edit</button>
                              <button className="tbl-btn">Karte</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Quick actions */}
                <div>
                  <div className="section-header">
                    <span className="section-title">Aktionen</span>
                    <span className="section-line" />
                  </div>
                  <div className="card">
                    <div className="action-grid">
                      <Link href="/tierliste/neu" className="action-btn">
                        <span className="action-icon">＋</span>
                        <span className="action-label">Neues Objekt</span>
                        <span className="action-desc">Tier oder Insekt erfassen</span>
                      </Link>
                      <Link href="/karte" className="action-btn">
                        <span className="action-icon">◎</span>
                        <span className="action-label">Kartenansicht</span>
                        <span className="action-desc">Fundorte auf Karte</span>
                      </Link>
                      <Link href="/export" className="action-btn">
                        <span className="action-icon">⇅</span>
                        <span className="action-label">CSV Export</span>
                        <span className="action-desc">Sammlung exportieren</span>
                      </Link>
                      <Link href="/taxonomie" className="action-btn">
                        <span className="action-icon">⊞</span>
                        <span className="action-label">Taxonomie</span>
                        <span className="action-desc">{pending} ausstehend</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Map preview */}
                <div>
                  <div className="section-header">
                    <span className="section-title">Kartenvorschau</span>
                    <span className="section-line" />
                    <Link href="/karte" className="card-action">Vollbild ›</Link>
                  </div>
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div ref={miniMapContainer} style={{ width: "100%", height: 160 }} />
                  </div>
                </div>

                {/* Active loans */}
                <div>
                  <div className="section-header">
                    <span className="section-title">Aktive Leihen</span>
                    <span className="section-line" />
                    <Link href="/leihe" className="card-action">Alle ›</Link>
                  </div>
                  <div className="card">
                    {loans.length === 0 ? (
                      <div style={{ padding: "14px", textAlign: "center", color: "var(--text-lo)", fontSize: 11 }}>
                        Keine aktiven Leihen
                      </div>
                    ) : (
                      loans.slice(0, 3).map((loan) => (
                        <div key={loan.id} className="loan-item">
                          <div className="loan-info">
                            <div className="loan-name">{loan.objectName ?? `Objekt #${loan.objectId}`}</div>
                            <div className="loan-meta">
                              an {[loan.borrowerFirstName, loan.borrowerLastName].filter(Boolean).join(" ") || loan.borrowerName || "—"}
                              {" · bis "}
                              {loan.endDate ? new Date(loan.endDate).toLocaleDateString("de-DE") : "—"}
                            </div>
                          </div>
                          <StatusPill status={loan.isOverdue ? "überfällig" : loan.status} />
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          </main>

          {/* Status bar */}
          <footer className="statusbar">
            <span>
              <span className="status-dot" />
              System online
            </span>
            <span>Collectio Zoologica · Naturkunde Institut</span>
            <span>TLS 1.3 · Verschlüsselt</span>
          </footer>
        </div>
      </div>
    </>
  );
}