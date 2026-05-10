"use client";

import { useState, useEffect } from "react";

// Specimens bleiben als spielerisches Element erhalten, aber dezenter
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
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      emoji: SPECIMENS[i % SPECIMENS.length].symbol,
      x: Math.random() * 90 + 5,
      y: Math.random() * 90 + 5,
      delay: Math.random() * 5,
      duration: 20 + Math.random() * 10,
      size: 24,
      opacity: 0.05, // Extrem dezent im Hintergrund
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
        /* Import moderner Sans-Serif Fonts */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #f8f9fa; /* Helles Google-Grau */
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', system-ui, sans-serif;
          color: #202124;
        }

        .login-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8f9fa;
          position: relative;
        }

        /* Subtiles Grid im Hintergrund */
        .grid-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image: radial-gradient(#dadce0 1px, transparent 1px);
          background-size: 40px 40px;
          opacity: 0.3;
        }

        .floating-specimen {
          position: fixed;
          z-index: 1;
          pointer-events: none;
          animation: floatDrift var(--dur, 18s) ease-in-out infinite var(--del, 0s);
          filter: grayscale(0.5);
          will-change: transform;
        }

        @keyframes floatDrift {
          0%, 100% { transform: translate(0,0) rotate(var(--r0)); }
          50% { transform: translate(20px, -30px) rotate(var(--r1)); }
        }

        /* Moderne Karte im Material Design */
        .card {
          position: relative;
          z-index: 10;
          width: min(400px, 92vw);
          background: #ffffff;
          border: 1px solid #dadce0;
          border-radius: 8px; /* Runder für modernen Look */
          padding: 48px 40px 36px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
          transition: box-shadow 0.3s ease;
        }

        .card:hover {
          box-shadow: 0 10px 20px rgba(0,0,0,0.05);
        }

        /* Header */
        .logo-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .logo-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .logo-text {
          font-size: 22px;
          font-weight: 500;
          color: #202124;
          letter-spacing: -0.02em;
        }

        .headline {
          font-size: 16px;
          font-weight: 400;
          color: #202124;
          text-align: center;
          margin-bottom: 32px;
        }

        /* Input Fields */
        .field-group {
          margin-bottom: 24px;
        }

        .field-wrap {
          position: relative;
        }

        .field-input {
          width: 100%;
          background: #ffffff;
          border: 1px solid #dadce0;
          border-radius: 4px;
          padding: 13px 15px;
          font-family: inherit;
          font-size: 15px;
          color: #202124;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .field-input:focus {
          border-color: #1a73e8; /* Google Blau */
          box-shadow: 0 0 0 1px #1a73e8;
        }

        .field-input::placeholder {
          color: #70757a;
        }

        /* Primary Button */
        .submit-btn {
          width: 100%;
          padding: 10px 24px;
          background: #1a73e8;
          border: none;
          border-radius: 4px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          color: #ffffff;
          cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
          margin-top: 8px;
        }

        .submit-btn:hover {
          background: #1765cc;
          box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
        }

        .submit-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        /* Footer Links */
        .footer-links {
          display: flex;
          justify-content: space-between;
          margin-top: 32px;
        }

        .footer-link {
          font-size: 14px;
          font-weight: 500;
          color: #1a73e8;
          text-decoration: none;
        }

        .footer-link:hover {
          text-decoration: underline;
        }

        /* Spinner */
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 10px;
          vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Status Bar (Subtiler) */
        .status-bar {
          position: fixed;
          bottom: 20px;
          font-size: 12px;
          color: #70757a;
          display: flex;
          gap: 20px;
        }
      `}</style>

      <div className="login-root">
        <div className="grid-overlay" />

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
                  opacity: p.opacity,
                  "--r0": `${p.rotate}deg`,
                  "--r1": `${p.rotate + 30}deg`,
                } as React.CSSProperties
              }
            />
          ))}

        <div className="card">
          {/* Logo im Google Look */}
          <div className="logo-wrap">
            <div className="logo-icon">🔬</div>
            <span className="logo-text">Collectio</span>
          </div>

          <h1 className="headline">Anmelden</h1>

          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <div className="field-wrap">
                <input
                  type="email"
                  className="field-input"
                  placeholder="E-Mail-Adresse"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field-group">
              <div className="field-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  className="field-input"
                  placeholder="Passwort eingeben"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading || !email || !password}
            >
              {isLoading ? (
                <>
                  <span className="spinner" />
                  Wird geladen...
                </>
              ) : (
                "Weiter"
              )}
            </button>
          </form>

          <div className="footer-links">
            <a className="footer-link" href="#">Passwort vergessen?</a>
            <a className="footer-link" href="./register">Konto erstellen</a>
          </div>
        </div>

        <div className="status-bar">
          <span>Deutsch</span>
          <span>Hilfe</span>
          <span>Datenschutz</span>
        </div>
      </div>
    </>
  );
}