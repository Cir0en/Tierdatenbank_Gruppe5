"use client";

import { useState, useEffect, useRef } from "react";

// Particle / floating specimen data
const SPECIMENS = [
  { symbol: "🦋", label: "Lepidoptera" },
  { symbol: "🪲", label: "Coleoptera" },
  { symbol: "🦗", label: "Orthoptera" },
  { symbol: "🕷️", label: "Arachnida" },
  { symbol: "🐛", label: "Larva" },
  { symbol: "🦟", label: "Diptera" },
  { symbol: "🐝", label: "Hymenoptera" },
  { symbol: "🦎", label: "Squamata" },
];

function FloatingSpecimen({
  emoji,
  style,
}: {
  emoji: string;
  style: React.CSSProperties;
}) {
  return (
    <span className="floating-specimen" style={style} aria-hidden="true">
      {emoji}
    </span>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [particles] = useState(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      emoji: SPECIMENS[i % SPECIMENS.length].symbol,
      x: Math.random() * 90 + 5,
      y: Math.random() * 90 + 5,
      delay: Math.random() * 8,
      duration: 14 + Math.random() * 10,
      size: 18 + Math.random() * 22,
      opacity: 0.08 + Math.random() * 0.12,
      rotate: Math.random() * 360,
    }))
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1800));
    setIsLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0c0f0a;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Mono', monospace;
          overflow: hidden;
        }

        .login-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0c0f0a;
          position: relative;
          overflow: hidden;
        }

        /* Radial atmospheric glow */
        .bg-glow {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .bg-glow::before {
          content: '';
          position: absolute;
          top: -20%;
          left: -10%;
          width: 70%;
          height: 70%;
          background: radial-gradient(ellipse, rgba(74,110,61,0.13) 0%, transparent 70%);
          animation: driftA 20s ease-in-out infinite alternate;
        }
        .bg-glow::after {
          content: '';
          position: absolute;
          bottom: -20%;
          right: -10%;
          width: 60%;
          height: 60%;
          background: radial-gradient(ellipse, rgba(120,85,40,0.10) 0%, transparent 70%);
          animation: driftB 25s ease-in-out infinite alternate;
        }
        @keyframes driftA { from { transform: translate(0,0) scale(1); } to { transform: translate(4%,3%) scale(1.1); } }
        @keyframes driftB { from { transform: translate(0,0) scale(1); } to { transform: translate(-3%,-4%) scale(1.08); } }

        /* Grid overlay */
        .grid-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image:
            linear-gradient(rgba(74,110,61,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74,110,61,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        /* Floating specimens */
        .floating-specimen {
          position: fixed;
          z-index: 1;
          pointer-events: none;
          user-select: none;
          animation: floatDrift var(--dur, 18s) ease-in-out infinite var(--del, 0s);
          filter: blur(0.5px);
          will-change: transform;
        }
        @keyframes floatDrift {
          0%   { transform: translateY(0px)   rotate(var(--r0, 0deg))  scale(1);   opacity: var(--op, 0.1); }
          33%  { transform: translateY(-18px) rotate(var(--r1, 15deg)) scale(1.04); }
          66%  { transform: translateY(10px)  rotate(var(--r2,-10deg)) scale(0.97); }
          100% { transform: translateY(0px)   rotate(var(--r0, 0deg))  scale(1);   opacity: var(--op, 0.1); }
        }

        /* Card */
        .card {
          position: relative;
          z-index: 10;
          width: min(420px, 92vw);
          background: rgba(16, 20, 14, 0.92);
          border: 1px solid rgba(74,110,61,0.25);
          border-radius: 3px;
          padding: 48px 44px 44px;
          backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.5),
            0 32px 80px rgba(0,0,0,0.6),
            inset 0 1px 0 rgba(255,255,255,0.04);
          opacity: 0;
          transform: translateY(24px);
          animation: cardReveal 0.9s cubic-bezier(.22,.68,0,1.2) 0.2s forwards;
        }
        @keyframes cardReveal {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Corner brackets */
        .card::before, .card::after {
          content: '';
          position: absolute;
          width: 18px;
          height: 18px;
          border-color: rgba(74,110,61,0.5);
          border-style: solid;
        }
        .card::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .card::after  { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

        /* Header */
        .logo-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
          opacity: 0;
          animation: fadeUp 0.7s ease 0.5s forwards;
        }
        .logo-icon {
          width: 36px;
          height: 36px;
          border: 1px solid rgba(74,110,61,0.4);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          background: rgba(74,110,61,0.08);
          flex-shrink: 0;
        }
        .logo-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0.18em;
          color: rgba(160,190,145,0.8);
          text-transform: uppercase;
        }

        .headline {
          font-family: 'Cormorant Garamond', serif;
          font-size: 34px;
          font-weight: 300;
          color: #d8e8cc;
          letter-spacing: -0.01em;
          line-height: 1.15;
          margin-bottom: 4px;
          margin-top: 28px;
          opacity: 0;
          animation: fadeUp 0.7s ease 0.65s forwards;
        }
        .headline em {
          font-style: italic;
          color: rgba(160,190,145,0.7);
        }

        .subline {
          font-size: 11px;
          letter-spacing: 0.08em;
          color: rgba(120,150,100,0.6);
          margin-bottom: 36px;
          opacity: 0;
          animation: fadeUp 0.7s ease 0.75s forwards;
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
          opacity: 0;
          animation: fadeUp 0.7s ease 0.8s forwards;
        }
        .divider-line { flex: 1; height: 1px; background: rgba(74,110,61,0.18); }
        .divider-text { font-size: 10px; letter-spacing: 0.15em; color: rgba(120,150,100,0.4); text-transform: uppercase; }

        /* Fields */
        .field-group {
          margin-bottom: 18px;
          opacity: 0;
          animation: fadeUp 0.6s ease var(--fd, 0.9s) forwards;
        }
        .field-label {
          display: block;
          font-size: 10px;
          letter-spacing: 0.14em;
          color: rgba(120,150,100,0.6);
          text-transform: uppercase;
          margin-bottom: 8px;
          transition: color 0.2s;
        }
        .field-group.focused .field-label { color: rgba(160,190,145,0.9); }

        .field-wrap {
          position: relative;
        }
        .field-input {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(74,110,61,0.2);
          border-radius: 2px;
          padding: 12px 14px;
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          color: #c8dbb8;
          outline: none;
          transition: border-color 0.25s, background 0.25s, box-shadow 0.25s;
          appearance: none;
          -webkit-appearance: none;
        }
        .field-input::placeholder { color: rgba(100,130,80,0.35); }
        .field-input:focus {
          border-color: rgba(74,110,61,0.65);
          background: rgba(74,110,61,0.06);
          box-shadow: 0 0 0 3px rgba(74,110,61,0.08);
        }

        .toggle-pw {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(120,150,100,0.45);
          font-size: 11px;
          letter-spacing: 0.06em;
          font-family: 'DM Mono', monospace;
          transition: color 0.2s;
          padding: 4px;
        }
        .toggle-pw:hover { color: rgba(160,190,145,0.8); }

        /* Submit */
        .submit-btn {
          width: 100%;
          margin-top: 8px;
          padding: 14px;
          background: rgba(74,110,61,0.18);
          border: 1px solid rgba(74,110,61,0.45);
          border-radius: 2px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(160,190,145,0.95);
          cursor: pointer;
          transition: background 0.25s, border-color 0.25s, transform 0.15s, box-shadow 0.25s;
          position: relative;
          overflow: hidden;
          opacity: 0;
          animation: fadeUp 0.6s ease 1.1s forwards;
        }
        .submit-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(74,110,61,0.2), transparent);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .submit-btn:hover {
          background: rgba(74,110,61,0.28);
          border-color: rgba(74,110,61,0.7);
          box-shadow: 0 0 20px rgba(74,110,61,0.15);
          transform: translateY(-1px);
        }
        .submit-btn:hover::before { opacity: 1; }
        .submit-btn:active { transform: translateY(0) scale(0.99); }
        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Spinner */
        .spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 1.5px solid rgba(160,190,145,0.3);
          border-top-color: rgba(160,190,145,0.9);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer links */
        .footer-links {
          display: flex;
          justify-content: space-between;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid rgba(74,110,61,0.1);
          opacity: 0;
          animation: fadeUp 0.6s ease 1.2s forwards;
        }
        .footer-link {
          font-size: 11px;
          letter-spacing: 0.06em;
          color: rgba(120,150,100,0.5);
          text-decoration: none;
          transition: color 0.2s;
          cursor: pointer;
        }
        .footer-link:hover { color: rgba(160,190,145,0.8); }

        /* Taxonomy badge */
        .taxonomy-badge {
          position: absolute;
          top: -1px;
          right: 28px;
          background: rgba(16,20,14,0.95);
          border: 1px solid rgba(74,110,61,0.25);
          border-top: none;
          padding: 4px 10px;
          font-size: 9px;
          letter-spacing: 0.18em;
          color: rgba(100,130,80,0.5);
          text-transform: uppercase;
          border-radius: 0 0 2px 2px;
        }

        /* Scan line effect */
        .scanlines {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.03) 2px,
            rgba(0,0,0,0.03) 4px
          );
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Bottom status bar */
        .status-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 24px;
          border-top: 1px solid rgba(74,110,61,0.1);
          background: rgba(12,15,10,0.8);
          backdrop-filter: blur(10px);
          font-size: 10px;
          letter-spacing: 0.1em;
          color: rgba(100,130,80,0.4);
          opacity: 0;
          animation: fadeUp 0.5s ease 1.4s forwards;
        }

        .status-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(74,110,61,0.6);
          margin-right: 6px;
          animation: pulse 2.5s ease infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; box-shadow: 0 0 6px rgba(74,110,61,0.5); }
        }
      `}</style>

      <div className="login-root">
        <div className="bg-glow" />
        <div className="grid-overlay" />
        <div className="scanlines" />

        {/* Floating background specimens */}
        {mounted &&
          particles.map((p) => (
            <FloatingSpecimen
              key={p.id}
              emoji={p.emoji}
              style={
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  fontSize: `${p.size}px`,
                  "--dur": `${p.duration}s`,
                  "--del": `${p.delay}s`,
                  "--op": p.opacity,
                  "--r0": `${p.rotate}deg`,
                  "--r1": `${p.rotate + 20}deg`,
                  "--r2": `${p.rotate - 15}deg`,
                } as React.CSSProperties
              }
            />
          ))}

        {/* Main card */}
        <div className="card" role="main">
          <div className="taxonomy-badge">Zoologica v2.0</div>

          {/* Logo */}
          <div className="logo-wrap">
            <div className="logo-icon" aria-hidden="true">🔬</div>
            <span className="logo-text">Collectio</span>
          </div>

          <h1 className="headline">
            Willkommen<br />
            <em>zurück.</em>
          </h1>
          <p className="subline">Zoologisches Sammlungssystem · Restricted Access</p>

          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">Authentifizierung</span>
            <div className="divider-line" />
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div
              className={`field-group ${focusedField === "email" ? "focused" : ""}`}
              style={{ "--fd": "0.9s" } as React.CSSProperties}
            >
              <label htmlFor="email" className="field-label">
                E-Mail-Adresse
              </label>
              <div className="field-wrap">
                <input
                  id="email"
                  type="email"
                  className="field-input"
                  placeholder="name@institution.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div
              className={`field-group ${focusedField === "password" ? "focused" : ""}`}
              style={{ "--fd": "1.0s" } as React.CSSProperties}
            >
              <label htmlFor="password" className="field-label">
                Passwort
              </label>
              <div className="field-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="field-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  autoComplete="current-password"
                  style={{ paddingRight: "56px" }}
                  required
                />
                <button
                  type="button"
                  className="toggle-pw"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading || !email || !password}
            >
              {isLoading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Authentifizierung…
                </>
              ) : (
                "Zugang beantragen"
              )}
            </button>
          </form>

          <div className="footer-links">
            <a className="footer-link" href="#">Passwort vergessen?</a>
            <a className="footer-link" href="#">Konto erstellen</a>
          </div>
        </div>

        {/* Status bar */}
        <div className="status-bar" role="status" aria-live="polite">
          <span>
            <span className="status-dot" aria-hidden="true" />
            System online
          </span>
          <span>Collectio Zoologica · Naturkunde Institut</span>
          <span>TLS 1.3 · Verschlüsselt</span>
        </div>
      </div>
    </>
  );
}