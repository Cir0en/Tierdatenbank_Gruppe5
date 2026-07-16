"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { formatDate } from "../utils/date";
import Navbar from "../components/Navbar";
import { Map, MapStyle, config, Marker } from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ═══════════════════════════════════════════════════════════════════════════
// Seite: / (Startseite / Dashboard)
// Zweck: Zentrale Übersichtsseite nach dem Login (aber auch für Gäste als
//        öffentlicher Feed sichtbar): zeigt Kennzahlen, zuletzt erfasste
//        Objekte, eine Mini-Kartenvorschau, Schnellaktionen und ein
//        rollenbasiertes Benachrichtigungs-Panel (überfällige Leihen,
//        ausstehende Taxonomie-Einreichungen für Moderator/Admin, abgelehnte
//        eigene Taxonomie-Vorschläge).
// Rollen: Für alle Besucher sichtbar; Inhalte/Aktionen werden je nach
//        Login-Status (isSignedIn) und Rolle (Nutzer/Moderator/Admin) ein-
//        bzw. ausgeblendet.
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ───────────────────────────────────────────────────────────────────
type Specimen = {
  id: string; name: string; taxon?: string; fundort?: string;
  findDate?: string; sammlung?: string; status: "freigegeben" | "ausstehend" | "abgelehnt";
};
type Loan = { id: string; objekt: string; an: string; bis: string; status: "aktiv" | "überfällig" | "zurück" };

// Statische Platzhalterdaten für die "Aktive Leihen"-Kachel (noch nicht an
// echte Backend-Daten angebunden, im Gegensatz zu notifLoans weiter unten).
const MOCK_LOANS: Loan[] = [
  { id: "LEI-001", objekt: "Papilio machaon",   an: "Dr. Müller",  bis: "2026-06-01", status: "aktiv"     },
  { id: "LEI-002", objekt: "Carabus violaceus",  an: "Prof. Weber", bis: "2026-04-30", status: "überfällig"},
  { id: "LEI-003", objekt: "Lacerta agilis",     an: "M. Schmidt",  bis: "2026-07-15", status: "aktiv"     },
];

// ── Sub-components ──────────────────────────────────────────────────────────

// Kleine Kennzahlen-Kachel (z. B. "Objekte gesamt", "Ausstehend").
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
function StatusPill({ status }: { status: Specimen["status"] | Loan["status"] }) {
  const map: Record<string, string> = {
    freigegeben: "pill--green",
    ausstehend:  "pill--amber",
    abgelehnt:   "pill--red",
    aktiv:       "pill--green",
    überfällig:  "pill--red",
    zurück:      "pill--gray",
  };
  return <span className={`pill ${map[status] ?? "pill--gray"}`}>{status}</span>;
}

// ── Main Component ──────────────────────────────────────────────────────────

// Hauptkomponente der Startseite/des Dashboards. Kombiniert mehrere unabhängige
// Datenquellen (Objektliste, Mini-Karte, Benachrichtigungen) über separate
// useEffect-Hooks mit eigenem Polling-Intervall.
export default function HomePage() {
  const { isSignedIn, isLoaded, getToken, userId: clerkId } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();

  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [search, setSearch] = useState("");
  const [showNotif, setShowNotif] = useState(false);
  const [pendingTax, setPendingTax] = useState(0);
  const [pendingLoanModeration, setPendingLoanModeration] = useState(0);
  const [userRole, setUserRole] = useState("Nutzer");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notifLoans, setNotifLoans] = useState<{ id: number; objectName: string | null; endDate: string | null; status: string | null; isOverdue: boolean; lenderId: number | null; borrowerId: number | null }[]>([]);
  const [rejectedSubs, setRejectedSubs] = useState<{ id: number; art: string; moderatorNote: string | null }[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem("dismissed_tax_rejections");
      return stored ? new Set<number>(JSON.parse(stored)) : new Set<number>();
    } catch { return new Set<number>(); }
  });
  const [dismissedLoanIds, setDismissedLoanIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem("dismissed_loan_rejections");
      return stored ? new Set<number>(JSON.parse(stored)) : new Set<number>();
    } catch { return new Set<number>(); }
  });

  const miniMapContainer = useRef<HTMLDivElement>(null);
  const miniMapInstance  = useRef<Map | null>(null);
  const notifWrapRef     = useRef<HTMLDivElement>(null);

  // Lädt den öffentlichen "zuletzt erfasste Objekte"-Feed (funktioniert auch
  // ohne Login, da hier kein Auth-Header mitgeschickt wird) und pollt ihn alle
  // 5 Sekunden, damit neu erfasste Tiere zeitnah auftauchen.
  useEffect(() => {
    const fetchAnimals = async () => {
      try {
        const response = await fetch(`${API}/api/animals/dashboard`);
        const data = await response.json();
        setSpecimens(data);
      } catch {
        // Backend nicht erreichbar – Feed bleibt leer
      }
    };
    fetchAnimals();
    const interval = setInterval(fetchAnimals, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialisiert die MapTiler-Mini-Kartenvorschau einmalig (nur wenn noch
  // keine Instanz existiert) und trägt anschließend alle bekannten Fundorte
  // als Marker ein. Aufräumen der Karteninstanz beim Unmount.
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

    map.on("load", async () => {
      try {
        const res = await fetch(`${API}/api/geolocations/map-items`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items: { latitude: number; longitude: number }[] = await res.json();
        items.forEach(({ longitude, latitude }) => {
          new Marker({ color: "#1a73e8" }).setLngLat([longitude, latitude]).addTo(map);
        });
      } catch {
        // Kartenvorschau bleibt leer
      }
    });

    return () => {
      if (miniMapInstance.current) {
        miniMapInstance.current.remove();
        miniMapInstance.current = null;
      }
    };
  }, []);

  // Refresh all notification data (role, pendingTax, loans)
  // Lädt alle Daten, die für das Benachrichtigungs-Panel benötigt werden:
  // eigene Rolle, überfällige/aktive Leihen und (für Mod/Admin) ausstehende
  // Taxonomie-Einreichungen. Bricht früh ab, wenn kein Nutzer eingeloggt ist.
  const refreshNotifs = useCallback(async () => {
    if (!clerkId) return;
    try {
      const token = await getToken();
      if (!token) return;

      const meRes = await fetch(`${API}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) return;
      const me = await meRes.json();
      const role: string = me.role ?? "Nutzer";
      setUserRole(role);
      setCurrentUserId(me.id ?? null);

      // Fetch real loans for overdue/soon notifications sowie eigene offene
      // Ausleihanfragen (als Verleiher) und abgelehnte Leihen (Bearer-Token,
      // LoanController erfordert [Authorize])
      const loanRes = await fetch(`${API}/api/loan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (loanRes.ok) setNotifLoans(await loanRes.json());

      // Eigene abgelehnte Taxonomie-Einreichungen
      const mySubsRes = await fetch(`${API}/api/taxonomy/submissions/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mySubsRes.ok) {
        const allSubs: { id: number; art: string; status: string; moderatorNote: string | null }[] =
          await mySubsRes.json();
        setRejectedSubs(allSubs.filter((s) => s.status === "rejected"));
      }

      // Pending taxonomy submissions + Leihen zur Prüfung (Moderator / Admin only)
      if (role === "Moderator" || role === "Admin") {
        const taxRes = await fetch(`${API}/api/taxonomy/submissions/pending`);
        if (taxRes.ok) setPendingTax((await taxRes.json()).length);

        const loanModRes = await fetch(`${API}/api/loan/pending-moderation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (loanModRes.ok) setPendingLoanModeration((await loanModRes.json()).length);
      } else {
        setPendingTax(0);
        setPendingLoanModeration(0);
      }
    } catch {}
  }, [clerkId, getToken]);

  // Initial load + poll every 30 s
  useEffect(() => {
    refreshNotifs();
    const interval = setInterval(refreshNotifs, 30_000);
    return () => clearInterval(interval);
  }, [refreshNotifs]);

  // Re-fetch immediately when panel is opened
  useEffect(() => {
    if (showNotif) refreshNotifs();
  }, [showNotif]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close panel on outside click
  useEffect(() => {
    if (!showNotif) return;
    const handler = (e: MouseEvent) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(e.target as Node))
        setShowNotif(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotif]);

  const pending = specimens.filter((s) => s.status === "ausstehend").length;
  const overdue = notifLoans.filter((l) => l.isOverdue).length;
  const pendingLoanRequests = notifLoans.filter((l) => l.status === "angefragt" && l.lenderId === currentUserId).length;
  const rejectedLoans = notifLoans.filter((l) =>
    l.status === "abgelehnt" &&
    (l.lenderId === currentUserId || l.borrowerId === currentUserId) &&
    !dismissedLoanIds.has(l.id)
  );

  // Markiert eine abgelehnte Taxonomie-Einreichung als "gelesen": die id wird
  // nur lokal (localStorage) gemerkt, damit sie beim nächsten Besuch nicht
  // erneut als Benachrichtigung erscheint (kein Backend-Aufruf nötig).
  const handleDismissRejection = (id: number) => {
    const next = new Set(dismissedIds).add(id);
    setDismissedIds(next);
    try { localStorage.setItem("dismissed_tax_rejections", JSON.stringify([...next])); } catch {}
  };

  // Wie handleDismissRejection, nur für eigene abgelehnte Ausleihen.
  const handleDismissLoanRejection = (id: number) => {
    const next = new Set(dismissedLoanIds).add(id);
    setDismissedLoanIds(next);
    try { localStorage.setItem("dismissed_loan_rejections", JSON.stringify([...next])); } catch {}
  };

  // Rollenbasierte Benachrichtigungen: baut die Liste der im Panel gezeigten
  // Einträge aus den geladenen Daten zusammen (überfällige Leihen und offene
  // Ausleihanfragen als Verleiher für alle, ausstehende Taxonomie-Freigaben
  // und zur Prüfung stehende Ausleihen nur für Moderator/Admin, eigene
  // abgelehnte Einreichungen/Ausleihen abzüglich bereits ausgeblendeter).
  type Notif = { icon: string; text: string; sub: string; href: string; urgent?: boolean; dismissId?: number; dismissKind?: "tax" | "loan" };
  const notifications: Notif[] = [];
  if (overdue > 0)
    notifications.push({ icon: "⚠", text: `${overdue} Leihe${overdue !== 1 ? "n" : ""} überfällig`, sub: "Rückgabe überschritten", href: "/leihe", urgent: true });
  if (pendingLoanRequests > 0)
    notifications.push({ icon: "📩", text: `${pendingLoanRequests} Ausleihanfrage${pendingLoanRequests !== 1 ? "n" : ""} offen`, sub: "Warten auf deine Bestätigung", href: "/leihe", urgent: true });
  if ((userRole === "Moderator" || userRole === "Admin") && pendingTax > 0)
    notifications.push({ icon: "🌿", text: `${pendingTax} Taxonomie-Einreichung${pendingTax !== 1 ? "en" : ""} ausstehend`, sub: "Warten auf Moderation", href: "/moderator", urgent: pendingTax >= 5 });
  if ((userRole === "Moderator" || userRole === "Admin") && pendingLoanModeration > 0)
    notifications.push({ icon: "⇄", text: `${pendingLoanModeration} Ausleihe${pendingLoanModeration !== 1 ? "n" : ""} zur Prüfung`, sub: "Zweite Freigabe erforderlich", href: "/moderator", urgent: pendingLoanModeration >= 5 });
  for (const s of rejectedSubs.filter((s) => !dismissedIds.has(s.id)))
    notifications.push({ icon: "❌", text: `Taxonomie „${s.art}" abgelehnt`, sub: s.moderatorNote ?? "Kein Grund angegeben", href: "/taxonomie", dismissId: s.id, dismissKind: "tax" });
  for (const l of rejectedLoans)
    notifications.push({ icon: "❌", text: `Ausleihe „${l.objectName ?? `Objekt #${l.id}`}" abgelehnt`, sub: "Anfrage bzw. Leihe wurde nicht freigegeben", href: "/leihe", dismissId: l.id, dismissKind: "loan" });

  // Client-seitige Volltextsuche über Name, Taxon und Fundort der geladenen Objekte.
  const q = search.toLowerCase();
  const filteredSpecimens = q
    ? specimens.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.taxon?.toLowerCase().includes(q) ||
        s.fundort?.toLowerCase().includes(q)
      )
    : specimens;

  return (
    <>
      {/* Komponenten-Styling (CSS-in-JS) für das Dashboard; Abschnitte sind unten mit „── ── " markiert. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Roboto+Mono:wght@300;400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:          #ffffff;
          --bg-surface:  #f8f9fa;
          --bg-card:     #ffffff;
          --primary:      #1a73e8;
          --primary-dim:  rgba(26,115,232,0.1);
          --text-hi:     #202124;
          --text-mid:    #5f6368;
          --text-lo:     #70757a;
          --amber:       #f9ab00;
          --red:         #d93025;
          --border:      #dadce0;
          --green:       rgba(74,110,61,0.85);
          --green-dim:   rgba(74,110,61,0.3);
          --green-glow:  rgba(74,110,61,0.04);
          --sidebar-w:   240px;
          --top-h:       64px;
          --ff-sans:     'Inter', system-ui, sans-serif;
          --ff-mono:     'Roboto Mono', monospace;
        }

        html, body { height: 100%; background: var(--bg); color: var(--text-hi); font-family: var(--ff-mono); font-size: 13px; overflow: hidden; }

        .bg-glow { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
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

        .app { position: relative; z-index: 10; display: flex; height: 100vh; overflow: hidden; }
        .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        /* ── Top bar ── */
        .topbar {
          height: var(--top-h); display: flex; align-items: center; gap: 16px;
          padding: 0 20px; border-bottom: 1px solid var(--border);
          background: var(--bg-surface); flex-shrink: 0;
        }
        .topbar-title { font-size: 18px; font-weight: 300; color: var(--text-hi); letter-spacing: 0.02em; }
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
          color: #fff;
        }

        .logout-btn {
          display: flex; align-items: center; gap: 6px; background: none;
          border: 1px solid var(--border); border-radius: 2px; padding: 5px 10px;
          color: var(--text-lo); cursor: pointer; font-family: var(--ff-mono);
          font-size: 10px; letter-spacing: 0.08em; transition: all 0.15s; text-decoration: none;
        }
        .logout-btn:hover { border-color: rgba(180,60,60,0.4); color: rgba(180,60,60,0.7); }

        .login-btn {
          display: flex; align-items: center; gap: 6px;
          border: 1px solid var(--green-dim); border-radius: 2px; padding: 5px 12px;
          color: var(--green); font-family: var(--ff-mono);
          font-size: 10px; letter-spacing: 0.08em; transition: all 0.15s; text-decoration: none;
          background: var(--green-glow);
        }
        .login-btn:hover { background: rgba(74,110,61,0.1); }

        /* ── Banner für nicht eingeloggte Nutzer ── */
        .guest-banner {
          background: rgba(74,110,61,0.06); border-bottom: 1px solid var(--green-dim);
          padding: 10px 20px; font-size: 11px; color: var(--text-mid);
          display: flex; align-items: center; gap: 12px; flex-shrink: 0;
        }
        .guest-banner a { color: var(--green); font-weight: 500; text-decoration: none; }
        .guest-banner a:hover { text-decoration: underline; }

        /* ── Content ── */
        .content {
          flex: 1; overflow-y: auto; padding: 20px;
          display: flex; flex-direction: column; gap: 16px;
        }

        .section-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
        .section-title { font-size: 14px; font-weight: 400; color: var(--text-mid); letter-spacing: 0.15em; text-transform: uppercase; }
        .section-line { flex: 1; height: 1px; background: var(--border); }
        .section-count { font-size: 10px; color: var(--text-lo); }

        /* ── Stat grid ── */
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
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
        .stat-value { display: block; font-size: 32px; font-weight: 300; color: var(--text-hi); line-height: 1; margin-bottom: 4px; }
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
          background: none; border: 1px solid var(--green-dim); border-radius: 2px;
          padding: 3px 8px; cursor: pointer; font-family: var(--ff-mono);
          transition: all 0.15s; text-decoration: none;
        }
        .card-action:hover { background: var(--green-glow); }

        /* ── Table ── */
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th {
          text-align: left; padding: 8px 12px; font-size: 9px; letter-spacing: 0.12em;
          color: var(--text-lo); text-transform: uppercase; border-bottom: 1px solid var(--border); font-weight: 400;
        }
        .tbl td { padding: 9px 12px; font-size: 11px; color: var(--text-mid); border-bottom: 1px solid rgba(74,110,61,0.07); }
        .tbl tr:hover td { background: var(--green-glow); }
        .tbl tr:last-child td { border-bottom: none; }
        .td-name { color: var(--text-hi); font-style: italic; }
        .td-id { color: var(--text-lo); font-size: 10px; }
        .td-actions { display: flex; gap: 6px; }
        .tbl-btn {
          font-size: 9px; letter-spacing: 0.06em; background: none;
          border: 1px solid var(--border); border-radius: 2px; padding: 2px 7px;
          color: var(--text-lo); cursor: pointer; font-family: var(--ff-mono); transition: all 0.15s;
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
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Notification panel ── */
        .notif-wrap { position: relative; }
        .notif-panel {
          position: fixed; top: 72px; right: 20px;
          width: 300px; background: #fff;
          border: 1px solid var(--border); border-radius: 6px;
          box-shadow: 0 8px 32px rgba(0,0,0,.15); z-index: 1000; overflow: hidden;
        }
        .notif-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-bottom: 1px solid var(--border);
        }
        .notif-head-title { font-size: 10px; letter-spacing: .12em; color: var(--text-mid); text-transform: uppercase; }
        .notif-head-role  { font-size: 9px; color: var(--text-lo); letter-spacing: .08em; padding: 1px 6px; border: 1px solid var(--border); border-radius: 2px; }
        .notif-item {
          display: flex; align-items: center; gap: 0;
          border-bottom: 1px solid rgba(74,110,61,0.07);
          transition: background .15s;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item:hover { background: rgba(74,110,61,0.05); }
        .notif-item--urgent { border-left: 3px solid var(--red); }
        .notif-item-content {
          flex: 1; display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 14px; text-decoration: none; color: inherit; min-width: 0;
        }
        .notif-item-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
        .notif-item-text { font-size: 11px; color: var(--text-hi); font-weight: 500; }
        .notif-item-sub  { font-size: 9px; color: var(--text-lo); margin-top: 2px; letter-spacing: .05em; }
        .notif-dismiss {
          flex-shrink: 0; width: 28px; height: 28px; margin-right: 8px;
          background: none; border: 1px solid var(--border); border-radius: 4px;
          color: var(--text-lo); font-size: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s, color .15s, border-color .15s;
        }
        .notif-dismiss:hover { background: #dcfce7; border-color: #86efac; color: #16a34a; }
        .notif-empty { padding: 20px 14px; text-align: center; font-size: 10px; color: var(--text-lo); letter-spacing: .08em; }
        .notif-footer { padding: 8px 14px; border-top: 1px solid var(--border); text-align: center; }
        .notif-footer a { font-size: 10px; color: var(--green); letter-spacing: .06em; text-decoration: none; }
        .notif-footer a:hover { text-decoration: underline; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 2px; }
      `}</style>

      <div className="bg-glow" />
      <div className="grid-overlay" />
      <div className="scanlines" />

      <div className="app">
        <Navbar activeNav="index" />

        <div className="main">
          {/* ── Top bar ── */}
          <header className="topbar">
            <h1 className="topbar-title">
              Übersicht <em>/ Dashboard</em>
            </h1>
            <div className="topbar-spacer" />

            <div className="topbar-search">
              <span style={{ color: "var(--text-lo)", fontSize: 11 }}>⌕</span>
              <input
                type="text"
                placeholder="Objekte durchsuchen…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {isLoaded && isSignedIn && (
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
                        <div key={i} className={`notif-item${n.urgent ? " notif-item--urgent" : ""}`}>
                          <Link
                            href={n.href}
                            className="notif-item-content"
                            onClick={() => setShowNotif(false)}
                          >
                            <span className="notif-item-icon">{n.icon}</span>
                            <div>
                              <div className="notif-item-text">{n.text}</div>
                              <div className="notif-item-sub">{n.sub}</div>
                            </div>
                          </Link>
                          {n.dismissId !== undefined && (
                            <button
                              className="notif-dismiss"
                              title="Als gelesen markieren"
                              onClick={() => n.dismissKind === "loan"
                                ? handleDismissLoanRejection(n.dismissId!)
                                : handleDismissRejection(n.dismissId!)}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    {notifications.length > 0 && (
                      <div className="notif-footer">
                        <Link href={userRole === "Moderator" || userRole === "Admin" ? "/moderator" : "/leihe"} onClick={() => setShowNotif(false)}>
                          Alle anzeigen ›
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Login / Logout je nach Auth-Status */}
            {isLoaded && (
              isSignedIn ? (
                <button
                  className="logout-btn"
                  onClick={() => signOut()}
                >
                  ⏻ Abmelden
                </button>
              ) : (
                <Link href="/login" className="login-btn">
                  → Anmelden
                </Link>
              )
            )}
          </header>

          {/* ── Banner für Gäste ── */}
          {isLoaded && !isSignedIn && (
            <div className="guest-banner">
              Du siehst den öffentlichen Feed. <a href="/login">Anmelden</a> oder <a href="/register">Registrieren</a>, um Objekte zu erfassen.
            </div>
          )}

          {/* ── Content ── */}
          <main className="content">

            {/* Stats */}
            <div>
              <div className="section-header">
                <span className="section-title">Systemübersicht</span>
                <span className="section-line" />
                <span className="section-count">Stand: {new Date().toLocaleDateString("de-DE")}</span>
              </div>
              <div className="stat-grid">
                <StatCard value={specimens.length} label="Objekte gesamt" sub="in allen Sammlungen" accent />
                <StatCard value={3} label="Sammlungen" sub="aktiv" />
                <StatCard value={pending} label="Ausstehend" sub="Taxonomie-Freigabe" />
                <StatCard value={MOCK_LOANS.length} label="Aktive Leihen" sub={`${overdue} überfällig`} />
                <StatCard value={12} label="Fundorte" sub="weltweit kartiert" />
              </div>
            </div>

            <div className="two-col">
              {/* Left: Objektliste */}
              <div>
                <div className="section-header">
                  <span className="section-title">Zuletzt erfasste Objekte</span>
                  <span className="section-line" />
                  <Link href="/Sammlung" className="card-action">Alle anzeigen ›</Link>
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
                        {/* Aktionen-Spalte nur für eingeloggte Nutzer */}
                        {isSignedIn && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSpecimens.length === 0 && (
                        <tr>
                          <td colSpan={isSignedIn ? 6 : 5} style={{ textAlign: "center", padding: "20px 12px", color: "var(--text-lo)" }}>
                            Keine Objekte für „{search}" gefunden.
                          </td>
                        </tr>
                      )}
                      {filteredSpecimens.map((s) => (
                        <tr key={s.id}>
                          <td><span className="td-id">{s.id}</span></td>
                          <td>
                            <span className="td-name">{s.name}</span>
                            <br />
                            <span style={{ fontSize: 9, color: "var(--text-lo)" }}>{s.taxon}</span>
                          </td>
                          <td>{s.fundort}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{formatDate(s.findDate)}</td>
                          <td><StatusPill status={s.status} /></td>
                          {/* Edit/Karte-Buttons nur für authentifizierte Nutzer */}
                          {isSignedIn && (
                            <td>
                              <div className="td-actions">
                                <button className="tbl-btn">Edit</button>
                                <button className="tbl-btn">Karte</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Quick Actions */}
                <div>
                  <div className="section-header">
                    <span className="section-title">Aktionen</span>
                    <span className="section-line" />
                  </div>
                  <div className="card">
                    <div className="action-grid">
                      {/* "Neues Objekt" nur für eingeloggte Nutzer sichtbar */}
                      {isSignedIn && (
                        <Link href="/tierliste/neu" className="action-btn">
                          <span className="action-icon">＋</span>
                          <span className="action-label">Neues Objekt</span>
                          <span className="action-desc">Tier oder Insekt erfassen</span>
                        </Link>
                      )}
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
                    {MOCK_LOANS.map((loan) => (
                      <div key={loan.id} className="loan-item">
                        <div className="loan-info">
                          <div className="loan-name">{loan.objekt}</div>
                          <div className="loan-meta">an {loan.an} · bis {loan.bis}</div>
                        </div>
                        <StatusPill status={loan.status} />
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </main>

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
