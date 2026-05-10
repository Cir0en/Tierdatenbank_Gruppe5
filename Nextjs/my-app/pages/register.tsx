"use client";

import { useState, useEffect } from "react";

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

function FloatingSpecimen({ emoji, style }: { emoji: string; style: React.CSSProperties }) {
  return <span className="floating-specimen" style={style} aria-hidden="true">{emoji}</span>;
}

type Field = "username" | "email" | "institution" | "password" | "confirm";

// Password strength helpers mit Google-Farben
function calcStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LABEL = ["—", "Sehr schwach", "Schwach", "Mittel", "Stark", "Sehr stark"];
const STRENGTH_COLOR = [
  "transparent", 
  "#d93025", // Google Red
  "#f09300", // Google Orange
  "#f9ab00", // Google Yellow
  "#81c995", // Soft Green
  "#1e8e3e"  // Google Green
];

export default function RegisterPage() {
  const [fields, setFields] = useState({ username: "", email: "", institution: "", password: "", confirm: "" });
  const [focused, setFocused] = useState<Field | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [agree, setAgree] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const [particles] = useState(() =>
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      emoji: SPECIMENS[i % SPECIMENS.length].symbol,
      x: Math.random() * 90 + 5,
      y: Math.random() * 90 + 5,
      delay: Math.random() * 5,
      duration: 20 + Math.random() * 10,
      size: 24,
      opacity: 0.04, // Sehr dezent im Hintergrund
      rotate: Math.random() * 360,
    }))
  );

  useEffect(() => { setMounted(true); }, []);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const pwStrength = calcStrength(fields.password);
  const pwMatch = fields.confirm.length > 0 && fields.password === fields.confirm;
  const pwMismatch = fields.confirm.length > 0 && fields.password !== fields.confirm;

  const step1Valid = fields.username.trim().length >= 2 && fields.email.includes("@");
  const step2Valid = pwStrength >= 3 && pwMatch && agree;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1 && step1Valid) { setStep(2); return; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2Valid) return;
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsLoading(false);
    setSuccess(true);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #f8f9fa; 
          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif; 
          color: #202124;
          overflow-x: hidden;
        }

        .root {
          min-height: 100vh; width: 100%;
          display: flex; align-items: center; justify-content: center;
          position: relative; padding: 24px 16px;
        }

        /* Subtiles Hintergrund-Muster */
        .grid-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: radial-gradient(#dadce0 1px, transparent 1px);
          background-size: 48px 48px;
          opacity: 0.4;
        }

        .floating-specimen {
          position: fixed; z-index: 1; pointer-events: none;
          animation: floatDrift var(--dur, 18s) ease-in-out infinite var(--del, 0s);
          filter: grayscale(0.6); opacity: 0.05;
        }
        @keyframes floatDrift {
          0%, 100% { transform: translate(0,0) rotate(var(--r0)); }
          50% { transform: translate(15px, -25px) rotate(var(--r1)); }
        }

        /* ── Card (Google Style) ── */
        .card {
          position: relative; z-index: 10; width: min(450px, 94vw);
          background: #ffffff; 
          border: 1px solid #dadce0;
          border-radius: 8px; 
          padding: 48px 40px 36px;
          box-shadow: 0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
          opacity: 0; transform: translateY(20px);
          animation: cardReveal 0.6s ease-out forwards;
        }
        @keyframes cardReveal { to { opacity: 1; transform: translateY(0); } }

        /* ── Header ── */
        .logo-wrap {
          display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 12px;
        }
        .logo-icon { font-size: 32px; }
        .logo-text {
          font-size: 24px; font-weight: 500; color: #202124; letter-spacing: -0.02em;
        }

        .headline {
          font-size: 16px; font-weight: 400; color: #202124; text-align: center; margin-bottom: 32px;
        }
        .subline {
          font-size: 13px; color: #5f6368; text-align: center; margin-bottom: 24px;
        }

        /* ── Step Indicator (Modern) ── */
        .steps {
          display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 32px;
        }
        .step-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #dadce0; transition: all 0.3s;
        }
        .step-dot.active { background: #1a73e8; width: 24px; border-radius: 4px; }
        .step-dot.done { background: #1e8e3e; }

        /* ── Fields ── */
        .field-group { margin-bottom: 20px; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        
        .field-label {
          display: block; font-size: 12px; font-weight: 500; color: #5f6368; margin-bottom: 6px;
        }
        
        .field-wrap { position: relative; }
        .field-input {
          width: 100%; background: #ffffff;
          border: 1px solid #dadce0; border-radius: 4px;
          padding: 12px 14px; font-family: inherit; font-size: 15px;
          color: #202124; outline: none; transition: all 0.2s;
        }
        .field-input:focus { border-color: #1a73e8; box-shadow: inset 0 0 0 1px #1a73e8; }
        .field-input.error { border-color: #d93025; }
        .field-input.ok { border-color: #1e8e3e; }

        .field-hint { margin-top: 6px; font-size: 12px; color: #70757a; }
        .field-hint.err { color: #d93025; }
        .field-hint.ok { color: #1e8e3e; }

        .toggle-pw {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #1a73e8;
          font-size: 12px; font-weight: 600; padding: 4px;
        }

        /* ── Password strength ── */
        .pw-strength { margin-top: 10px; }
        .pw-bar-track { height: 4px; background: #e8eaed; border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
        .pw-bar-fill { height: 100%; transition: all 0.4s ease; }
        .pw-strength-label { font-size: 12px; font-weight: 500; }

        /* ── Agree Checkbox ── */
        .agree-row { display: flex; gap: 12px; margin: 24px 0; }
        .agree-box {
          width: 18px; height: 18px; border: 2px solid #5f6368; border-radius: 2px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .agree-box.checked { background: #1a73e8; border-color: #1a73e8; }
        .agree-box.checked::after { content: '✓'; color: white; font-size: 12px; font-weight: bold; }
        .agree-text { font-size: 13px; color: #5f6368; line-height: 1.5; }
        .agree-link { color: #1a73e8; text-decoration: none; font-weight: 500; }

        /* ── Buttons ── */
        .submit-btn {
          width: 100%; padding: 12px 24px;
          background: #1a73e8; border: none; border-radius: 4px;
          font-family: inherit; font-size: 14px; font-weight: 500;
          color: #ffffff; cursor: pointer; transition: background 0.2s;
        }
        .submit-btn:hover:not(:disabled) { background: #1765cc; box-shadow: 0 1px 3px rgba(60,64,67,0.3); }
        .submit-btn:disabled { background: #dadce0; color: #70757a; cursor: not-allowed; }

        .back-btn {
          width: 100%; margin-top: 12px; padding: 10px;
          background: none; border: none; color: #5f6368;
          font-size: 14px; font-weight: 500; cursor: pointer;
        }
        .back-btn:hover { color: #202124; text-decoration: underline; }

        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
          border-radius: 50%; animation: spin 0.8s linear infinite;
          margin-right: 10px; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Success ── */
        .success-wrap { text-align: center; padding: 20px 0; }
        .success-icon {
          font-size: 48px; color: #1e8e3e; margin-bottom: 16px;
        }
        .success-title { font-size: 24px; margin-bottom: 12px; }
        .success-sub { color: #5f6368; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }

        .footer-links {
          display: flex; justify-content: space-between; margin-top: 32px;
          padding-top: 24px; border-top: 1px solid #dadce0;
        }
        .footer-link { font-size: 13px; color: #1a73e8; text-decoration: none; font-weight: 500; }
        
        .status-bar {
          position: fixed; bottom: 20px; font-size: 12px; color: #70757a;
          display: flex; gap: 24px;
        }
      `}</style>

      <div className="root">
        <div className="grid-overlay" />

        {mounted && particles.map((p) => (
          <FloatingSpecimen
            key={p.id}
            emoji={p.emoji}
            style={{
              left: `${p.x}%`, top: `${p.y}%`, fontSize: `${p.size}px`,
              "--dur": `${p.duration}s`, "--del": `${p.delay}s`,
              opacity: p.opacity, "--r0": `${p.rotate}deg`,
              "--r1": `${p.rotate + 25}deg`,
            } as React.CSSProperties}
          />
        ))}

        <div className="card" role="main">
          <div className="logo-wrap">
            <div className="logo-icon">🔬</div>
            <span className="logo-text">Collectio</span>
          </div>

          {!success ? (
            <>
              <h1 className="headline">{step === 1 ? "Konto erstellen" : "Sicherheit einrichten"}</h1>
              
              <div className="steps">
                <div className={`step-dot ${step === 1 ? "active" : "done"}`} />
                <div className={`step-dot ${step === 2 ? "active" : ""}`} />
              </div>

              {step === 1 && (
                <form onSubmit={handleNext}>
                  <div className="field-row">
                    <div>
                      <label className="field-label">Benutzername</label>
                      <input
                        type="text" className="field-input"
                        placeholder="max.mustermann"
                        value={fields.username}
                        onChange={set("username")}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label">Institution</label>
                      <input
                        type="text" className="field-input"
                        placeholder="Universität"
                        value={fields.institution}
                        onChange={set("institution")}
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">E-Mail-Adresse</label>
                    <input
                      type="email"
                      className={`field-input ${fields.email.includes("@") ? "ok" : ""}`}
                      placeholder="name@beispiel.de"
                      value={fields.email}
                      onChange={set("email")}
                      required
                    />
                  </div>

                  <button type="submit" className="submit-btn" disabled={!step1Valid}>
                    Weiter
                  </button>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={handleSubmit}>
                  <div className="field-group">
                    <label className="field-label">Passwort</label>
                    <div className="field-wrap">
                      <input
                        type={showPw ? "text" : "password"}
                        className="field-input"
                        placeholder="Mindestens 8 Zeichen"
                        value={fields.password}
                        onChange={set("password")}
                        required
                      />
                      <button type="button" className="toggle-pw" onClick={() => setShowPw(!showPw)}>
                        {showPw ? "VERBERGEN" : "ANZEIGEN"}
                      </button>
                    </div>

                    {fields.password.length > 0 && (
                      <div className="pw-strength">
                        <div className="pw-bar-track">
                          <div
                            className="pw-bar-fill"
                            style={{
                              width: `${(pwStrength / 5) * 100}%`,
                              background: STRENGTH_COLOR[pwStrength],
                            }}
                          />
                        </div>
                        <span className="pw-strength-label" style={{ color: STRENGTH_COLOR[pwStrength] }}>
                          Stärke: {STRENGTH_LABEL[pwStrength]}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="field-group">
                    <label className="field-label">Passwort bestätigen</label>
                    <div className="field-wrap">
                      <input
                        type={showCf ? "text" : "password"}
                        className={`field-input ${pwMismatch ? "error" : pwMatch ? "ok" : ""}`}
                        value={fields.confirm}
                        onChange={set("confirm")}
                        required
                      />
                    </div>
                  </div>

                  <div className="agree-row">
                    <div className={`agree-box ${agree ? "checked" : ""}`} onClick={() => setAgree(!agree)} />
                    <span className="agree-text">
                      Ich stimme den <a href="#" className="agree-link">Nutzungsbedingungen</a> zu.
                    </span>
                  </div>

                  <button type="submit" className="submit-btn" disabled={isLoading || !step2Valid}>
                    {isLoading ? <><span className="spinner" />Erstellen...</> : "Konto erstellen"}
                  </button>

                  <button type="button" className="back-btn" onClick={() => setStep(1)}>
                    Zurück
                  </button>
                </form>
              )}

              <div className="footer-links">
                <a className="footer-link" href="/login">Anmelden</a>
                <a className="footer-link" href="#">Hilfe</a>
              </div>
            </>
          ) : (
            <div className="success-wrap">
              <div className="success-icon">CheckCircle</div>
              <h2 className="success-title">Fast fertig!</h2>
              <p className="success-sub">
                Dein Konto wurde erfolgreich angelegt. Ein Administrator wird den Zugang in Kürze freischalten.
              </p>
              <a href="/login" className="submit-btn" style={{ textDecoration: 'none', display: 'block' }}>
                Zur Anmeldung
              </a>
            </div>
          )}
        </div>

        <div className="status-bar">
          <span>Deutsch</span>
          <span>Hilfe</span>
          <span>Impressum</span>
        </div>
      </div>
    </>
  );
}