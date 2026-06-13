"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useUser, useAuth } from "@clerk/nextjs";

const NAV_ITEMS = [
  { id: "index",     label: "Dashboard",      icon: "⊞", href: "/" },
  { id: "tierliste", label: "Sammlungen",      icon: "🗂", href: "/Sammlung"  },
  { id: "karte",     label: "Karte",           icon: "🗺", href: "/karte"     },
  { id: "leihe",     label: "Ausleihe",        icon: "⇄", href: "/leihe"     },
  { id: "taxonomie", label: "Taxonomie",       icon: "🌿", href: "/taxonomie" },
  { id: "export",    label: "Einstellungen",   icon: "⚙", href: "/export"    },
];

type Props = {
  activeNav?: string;
};

export default function Navbar({ activeNav: activeProp }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(true);

  const active =
    activeProp ??
    (NAV_ITEMS.find((i) => i.href === router.pathname)?.id ?? "index");

  const userName = user?.fullName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "Nutzer";
  const userRole = (user?.publicMetadata?.role as string) ?? "Nutzer";
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
        }
        .nb-nav-label {
          font-size: 14px;
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

        {/* Nav items */}
        <nav className="nb-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`nb-nav-item${active === item.id ? " nb-active" : ""}`}
            >
              <span className="nb-nav-icon">{item.icon}</span>
              {open && <span className="nb-nav-label">{item.label}</span>}
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
