// App-weite Navigation (linke Sidebar), die auf praktisch jeder Seite über
// <Navbar activeNav="..."/> eingebunden wird. Verantwortlich für:
//  - Anzeige der Navigationspunkte, inkl. rollenbasierter Einschränkung
//    (z.B. "Moderation"/"Admin" nur für die jeweiligen Rollen sichtbar)
//  - Ein-/Ausklappen der Sidebar
//  - Anzeige von Nutzername/Rolle bzw. Login-Link, falls nicht angemeldet
//  - Laden und periodisches Aktualisieren einer Benachrichtigungszahl
//    (überfällige/angefragte/abgelehnte Ausleihen + zu prüfende/abgelehnte
//    Taxonomie-Einreichungen + zur Prüfung stehende Ausleihen für Moderation)
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useUser, useAuth } from "@clerk/nextjs";
import { useLanguage } from "../contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// Statische Definition aller möglichen Navigationspunkte. `roles: null` bedeutet
// für jeden sichtbar; ist ein Array gesetzt, wird der Punkt weiter unten anhand
// der aktuellen Nutzerrolle (userRole) herausgefiltert.
const NAV_ITEMS = [
  { id: "index",     label: "Dashboard",      icon: "⊞", href: "/",           roles: null },
  { id: "tierliste", label: "Sammlungen",      icon: "🗂", href: "/Sammlung",   roles: null },
  { id: "karte",     label: "Karte",           icon: "🗺", href: "/karte",      roles: null },
  { id: "leihe",     label: "Ausleihe",        icon: "⇄", href: "/leihe",      roles: null },
  { id: "taxonomie", label: "Taxonomie",       icon: "🌿", href: "/taxonomie",  roles: null },
  { id: "export",    label: "Einstellungen",   icon: "⚙", href: "/export",     roles: null },
  { id: "moderator", label: "Moderation",      icon: "🛡", href: "/moderator",  roles: ["Moderator", "Admin"] },
  { id: "admin",     label: "Admin",           icon: "⚙️", href: "/admin",      roles: ["Admin"] },
];

type Props = {
  activeNav?: string;
};

export default function Navbar({ activeNav: activeProp }: Props) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isSignedIn, getToken } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  const [dbRole, setDbRole] = useState<string | null>(null);
  const [notifCount, setNotifCount] = useState(0);

  // Rolle + Benachrichtigungszahl holen und alle 30 s aktualisieren.
  // Die Benachrichtigungszahl (notifCount, angezeigt als Badge am Dashboard-Link)
  // setzt sich zusammen aus:
  //   1. eigene überfällige Ausleihen
  //   2. offene Ausleih-Anfragen, bei denen der Nutzer Verleiher ist (muss bestätigen/ablehnen)
  //   3. eigene abgelehnte Ausleihen (als Verleiher oder Entleiher), noch nicht "gesehen"
  //   4. offene Taxonomie-Einreichungen, die auf Prüfung warten (nur für
  //      Moderator/Admin sichtbar, da nur diese Rollen sie bearbeiten dürfen)
  //   5. Ausleihen, die als zweite Instanz auf Moderator/Admin-Freigabe warten
  //      (status "in_pruefung", nur für Moderator/Admin sichtbar)
  //   6. eigene abgelehnte Taxonomie-Einreichungen, die der Nutzer noch nicht
  //      "gesehen"/verworfen hat
  // "Noch nicht gesehen" wird für 3. und 6. jeweils gegen eine eigene, in localStorage
  // gepflegte Liste bereits quittierter Ablehnungs-IDs abgeglichen.
  // Ein Intervall sorgt dafür, dass die Zahl auch ohne Neuladen der Seite
  // regelmäßig aktuell bleibt.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        // Eigene Rolle aus der Datenbank laden (maßgeblich für Sichtbarkeit von
        // Nav-Punkten und für die Taxonomie-Zähllogik unten)
        const meRes = await fetch(`${API}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok || cancelled) return;
        const me = await meRes.json();
        const role: string = me.role ?? "Nutzer";
        if (!cancelled) setDbRole(role);

        let count = 0;

        // Überfällige Leihen + offene Ausleih-Anfragen, bei denen der Nutzer der
        // Verleiher ist und somit bestätigen/ablehnen muss, + eigene abgelehnte
        // Leihen (als Verleiher oder Entleiher, ohne bereits gelesene) (Bearer-Token,
        // LoanController erfordert [Authorize])
        const loanRes = await fetch(`${API}/api/loan`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (loanRes.ok && !cancelled) {
          const loans: { id: number; isOverdue: boolean; status: string | null; lenderId: number | null; borrowerId: number | null }[] = await loanRes.json();
          count += loans.filter((l) => l.isOverdue).length;
          count += loans.filter((l) => l.status === "angefragt" && l.lenderId === me.id).length;

          let dismissedLoans = new Set<number>();
          try {
            const stored = localStorage.getItem("dismissed_loan_rejections");
            if (stored) dismissedLoans = new Set<number>(JSON.parse(stored));
          } catch {}
          count += loans.filter((l) =>
            l.status === "abgelehnt" &&
            (l.lenderId === me.id || l.borrowerId === me.id) &&
            !dismissedLoans.has(l.id)
          ).length;
        }

        // Ausstehende Taxonomie-Einreichungen + Leihen zur Prüfung (Moderator / Admin)
        if (role === "Moderator" || role === "Admin") {
          const taxRes = await fetch(`${API}/api/taxonomy/submissions/pending`);
          if (taxRes.ok && !cancelled) {
            const subs: unknown[] = await taxRes.json();
            count += subs.length;
          }

          const loanModRes = await fetch(`${API}/api/loan/pending-moderation`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (loanModRes.ok && !cancelled) {
            const pending: unknown[] = await loanModRes.json();
            count += pending.length;
          }
        }

        // Eigene abgelehnte Taxonomie-Einreichungen (ohne bereits gelesene)
        const myRes = await fetch(`${API}/api/taxonomy/submissions/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (myRes.ok && !cancelled) {
          const mine: { id: number; status: string }[] = await myRes.json();
          let dismissed = new Set<number>();
          try {
            const stored = localStorage.getItem("dismissed_tax_rejections");
            if (stored) dismissed = new Set<number>(JSON.parse(stored));
          } catch {}
          count += mine.filter((s) => s.status === "rejected" && !dismissed.has(s.id)).length;
        }

        if (!cancelled) setNotifCount(count);
      } catch {
        // Bei Fehler bleibt dbRole null → Fallback auf Clerk-Metadata
      }
    };

    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isLoaded, isSignedIn, getToken, user?.id]);

  // Aktiver Nav-Punkt: entweder explizit von der Seite über die `activeNav`-Prop
  // vorgegeben, oder anhand des aktuellen Next.js-Routen-Pfads ermittelt
  // (Fallback: "index"/Dashboard, z.B. bei dynamischen Routen wie /tier/[id]).
  const active =
    activeProp ??
    (NAV_ITEMS.find((i) => i.href === router.pathname)?.id ?? "index");

  const userName = user?.fullName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "Nutzer";
  // DB-Rolle hat Vorrang; Fallback auf Clerk publicMetadata falls API noch lädt
  const userRole = dbRole ?? (user?.publicMetadata?.role as string) ?? "Nutzer";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <style>{`
        .nb-sidebar {
          width: 220px;
          flex-shrink: 0;
          background: #1a2f1a;
          display: flex;
          flex-direction: column;
          transition: width 0.25s cubic-bezier(.4,0,.2,1);
          overflow: hidden;
          font-family: 'Inter', 'Roboto', system-ui, sans-serif;
        }
        .nb-sidebar.nb-collapsed { width: 62px; }

        /* ── Logo ── */
        .nb-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
          min-height: 68px;
        }
        .nb-logo-chip {
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          background: #2e4d2e;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }
        .nb-logo-text {
          font-size: 17px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }

        /* ── Nav ── */
        .nb-nav {
          flex: 1;
          padding: 10px 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .nb-nav::-webkit-scrollbar { width: 3px; }
        .nb-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

        .nb-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          text-decoration: none;
          color: rgba(255,255,255,0.65);
          border-left: 3px solid transparent;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
          font-size: 14px;
          font-weight: 400;
        }
        .nb-nav-item:hover {
          background: rgba(255,255,255,0.06);
          color: #ffffff;
          border-left-color: rgba(255,255,255,0.2);
        }
        .nb-nav-item.nb-active {
          background: rgba(255,255,255,0.1);
          color: #ffffff;
          border-left-color: #56ab2f;
          font-weight: 500;
        }
        .nb-nav-icon {
          font-size: 17px;
          flex-shrink: 0;
          width: 22px;
          text-align: center;
          line-height: 1;
          position: relative;
        }
        .nb-nav-label {
          font-size: 14px;
          flex: 1;
        }
        .nb-badge {
          margin-left: auto;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          border-radius: 999px;
          padding: 1px 6px;
          min-width: 18px;
          text-align: center;
          line-height: 16px;
          flex-shrink: 0;
        }
        .nb-badge-dot {
          position: absolute;
          top: -3px;
          right: -4px;
          width: 8px;
          height: 8px;
          background: #ef4444;
          border-radius: 50%;
          border: 1.5px solid #1a2f1a;
        }

        /* ── User section ── */
        .nb-user {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-top: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
          cursor: pointer;
          transition: background 0.15s;
        }
        .nb-user:hover { background: rgba(255,255,255,0.05); }
        .nb-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #2e7d32;
          border: 2px solid rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: #ffffff;
          flex-shrink: 0;
        }
        .nb-user-info { min-width: 0; }
        .nb-user-name {
          font-size: 13px;
          font-weight: 500;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nb-user-role {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          white-space: nowrap;
        }

        /* ── Collapse button ── */
        .nb-toggle {
          padding: 8px 16px 12px;
          flex-shrink: 0;
        }
        .nb-toggle-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: none;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          padding: 6px 10px;
          color: rgba(255,255,255,0.45);
          cursor: pointer;
          font-size: 12px;
          transition: all 0.15s;
        }
        .nb-toggle-btn:hover {
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.75);
        }
      `}</style>

      <aside className={`nb-sidebar${open ? "" : " nb-collapsed"}`}>

        {/* Logo */}
        <div className="nb-logo">
          <div className="nb-logo-chip">🍃</div>
          {open && <span className="nb-logo-text">Collectio</span>}
        </div>

        {/* Nav items: rollenbasiert gefiltert (siehe NAV_ITEMS.roles weiter oben) */}
        <nav className="nb-nav">
          {NAV_ITEMS.filter(item =>
            !item.roles || item.roles.includes(userRole)
          ).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`nb-nav-item${active === item.id ? " nb-active" : ""}`}
            >
              <span className="nb-nav-icon">
                {item.icon}
                {!open && item.id === "index" && notifCount > 0 && (
                  <span className="nb-badge-dot" />
                )}
              </span>
              {open && (
                <span className="nb-nav-label">
                  {({
                    index:     t.nav.dashboard,
                    tierliste: t.nav.collections,
                    karte:     t.nav.map,
                    leihe:     t.nav.loans,
                    taxonomie: t.nav.taxonomy,
                    export:    t.nav.settings,
                    moderator: t.nav.moderation,
                    admin:     t.nav.admin,
                  } as Record<string, string>)[item.id] ?? item.label}
                </span>
              )}
              {open && item.id === "index" && notifCount > 0 && (
                <span className="nb-badge">{notifCount > 99 ? "99+" : notifCount}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="nb-toggle">
          <button className="nb-toggle-btn" onClick={() => setOpen((v) => !v)}>
            {open ? "◂ Einklappen" : "▸"}
          </button>
        </div>

        {/* User / Login */}
        {isSignedIn ? (
          <div className="nb-user">
            <div className="nb-avatar">{initials}</div>
            {open && (
              <div className="nb-user-info">
                <div className="nb-user-name">{userName}</div>
                <div className="nb-user-role">{userRole}</div>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.6)", textDecoration: "none",
            fontSize: 13, transition: "color 0.15s",
          }}>
            <div className="nb-avatar" style={{ background: "#2e4d2e", fontSize: 14 }}>→</div>
            {open && <span>Anmelden</span>}
          </Link>
        )}

      </aside>
    </>
  );
}
