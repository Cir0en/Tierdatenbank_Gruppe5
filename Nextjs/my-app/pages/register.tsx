'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, useClerk } from '@clerk/nextjs'; 
import { useRouter } from 'next/router';
import { useSignUp } from '@clerk/nextjs/legacy';

function calcStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function RegisterPage() {
  const { isLoaded, signUp } = useSignUp(); 
  const { setActive } = useClerk();
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [role, setRole]           = useState('');
  const [agree, setAgree]         = useState(false);
  const [showPw, setShowPw]       = useState(false);
  const [showCf, setShowCf]       = useState(false);
  
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  useEffect(() => {
    if (isSignedIn) {
      router.push('/dashboard');
    }
  }, [isSignedIn, router]);

  if (isSignedIn) {
  return null;}

  const strength   = calcStrength(password);
  const pwMatch    = confirm.length > 0 && password === confirm;
  const pwMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit  = name.trim() && email.includes('@') && strength >= 2 && pwMatch && role && agree;

  const STRENGTH_W     = ['0%', '25%', '50%', '75%', '100%'];
  const STRENGTH_COLOR = ['#e5e7eb', '#ef4444', '#f97316', '#eab308', '#22c55e'];
  const STRENGTH_LABEL = ['', 'Sehr schwach', 'Schwach', 'Mittel', 'Stark'];

  const splitFullName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    return {
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' '),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !isLoaded || !signUp) return;
    
    setLoading(true);
    setErrorMsg('');

    try {
      const { firstName, lastName } = splitFullName(name);
      await signUp.create({
        emailAddress: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
        unsafeMetadata: {
          requestedRole: role
        },
      });

      if (signUp.status === 'complete' && signUp.createdSessionId) {
        await setActive(
          {
            session: signUp.createdSessionId,
          }
        );
        router.push('/dashboard');
      } else {
        console.log('Weitere Schritte nötig:', {
          status: signUp.status,
          createdSessionId: signUp.createdSessionId,
          signUp,
        });
        setErrorMsg('Registrierung konnte nicht abgeschlossen werden.');
      }
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.errors?.[0]?.longMessage || 'Ein Fehler ist bei der Registrierung aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100vh; font-family: 'Inter', sans-serif; background: #eef2ee; color: #1a1a1a; zoom: 1.25;}

        .page { min-height: 100vh; background: #eef2ee; display: flex; flex-direction: column; }
        .page-label { padding: 18px 32px; font-size: 13px; color: #9ca3af; }

        .section {
          flex: 1; display: flex; align-items: flex-start; justify-content: center;
          padding: 0 40px 80px; gap: 40px;
        }

        /* ── Spalte links (Hero) ── */
        .hero {
          width: 380px; flex-shrink: 0; display: flex; flex-direction: column;
          align-items: center; gap: 24px; padding-top: 20px;
        }

        /* Der Bild-Container füllt nun die vollen 380px der Hero-Spalte aus */
        .illustration {
          width: 100%; 
          height: 280px; 
          border-radius: 20px; 
          overflow: hidden;
          position: relative; 
          background: transparent;
        }

        .station-img {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; z-index: 1;
        }

        .illus-butterfly {
          position: absolute; font-size: 22px; z-index: 2;
          animation: flutter 3s ease-in-out infinite;
        }
        @keyframes flutter {
          0%, 100% { transform: translateY(0) rotate(-8deg); }
          50%       { transform: translateY(-8px) rotate(8deg); }
        }

        .hero-headline {
          font-size: 22px; font-weight: 700; color: #2d6a4f;
          text-align: center; line-height: 1.3;
        }
        .hero-sub {
          font-size: 13px; color: #6b7280; text-align: center;
          line-height: 1.6; max-width: 280px;
        }
        .hero-butterflies {
          display: flex; align-items: center; gap: 4px; margin-top: 8px;
        }

        /* ── Card rechts ── */
        .card {
          width: 380px; background: #fff; border-radius: 20px;
          padding: 32px 30px 28px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        }
        .card-title { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 4px; }
        .card-sub   { font-size: 13px; color: #6b7280; margin-bottom: 22px; }

        .field-wrap  { margin-bottom: 14px; }
        .field-label {
          display: block; font-size: 13px; font-weight: 500;
          color: #374151; margin-bottom: 6px;
        }
        .field-input-wrap { position: relative; }
        .field-input {
          width: 100%; padding: 9px 14px; border-radius: 8px;
          border: 1px solid #e5e7eb; font-size: 14px; color: #111827;
          background: #fff; outline: none; font-family: 'Inter', sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s;
          -webkit-appearance: none;
        }
        .field-input::placeholder { color: #9ca3af; }
        .field-input:focus {
          border-color: #2d6a4f;
          box-shadow: 0 0 0 3px rgba(45,106,79,0.1);
        }
        .field-input.has-icon { padding-right: 42px; }
        .field-input.error  { border-color: #ef4444; }
        .field-input.error:focus { box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }
        .field-input.ok { border-color: #22c55e; }
        .field-input.ok:focus { box-shadow: 0 0 0 3px rgba(34,197,94,0.1); }

        .field-select {
          width: 100%; padding: 9px 40px 9px 14px; border-radius: 8px;
          border: 1px solid #e5e7eb; font-size: 14px; color: #111827;
          background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239ca3af' d='M6 8L0 0h12z'/%3E%3C/svg%3E") no-repeat right 14px center;
          appearance: none; outline: none; font-family: 'Inter', sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s; cursor: pointer;
        }
        .field-select:focus {
          border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.1);
        }

        .field-icon-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9ca3af;
          font-size: 16px; transition: color 0.15s; padding: 2px;
        }
        .field-icon-btn:hover { color: #6b7280; }

        /* Strength bar */
        .strength-bar { margin-top: 8px; }
        .strength-track {
          height: 3px; background: #f3f4f6; border-radius: 2px; overflow: hidden;
        }
        .strength-fill {
          height: 100%; border-radius: 2px; transition: width 0.3s, background 0.3s;
        }
        .strength-label { font-size: 11px; color: #9ca3af; margin-top: 3px; }

        /* Agree */
        .agree-row {
          display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px;
        }
        .agree-checkbox {
          width: 16px; height: 16px; border-radius: 4px;
          border: 1.5px solid #d1d5db; appearance: none;
          background: #fff; cursor: pointer; flex-shrink: 0; margin-top: 2px;
          transition: all 0.15s; position: relative;
        }
        .agree-checkbox:checked {
          background: #2d6a4f; border-color: #2d6a4f;
        }
        .agree-checkbox:checked::after {
          content: '✓'; position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; color: #fff; font-weight: 700;
        }
        .agree-text { font-size: 13px; color: #6b7280; line-height: 1.55; }
        .agree-link { color: #2d6a4f; font-weight: 500; text-decoration: none; }
        .agree-link:hover { text-decoration: underline; }

        .submit-btn {
          width: 100%; padding: 12px; border-radius: 8px;
          background: #2d6a4f; border: none; color: #fff;
          font-size: 15px; font-weight: 600; cursor: pointer;
          font-family: 'Inter', sans-serif;
          transition: background 0.15s, transform 0.1s;
          box-shadow: 0 2px 8px rgba(45,106,79,0.3);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-bottom: 16px;
        }
        .submit-btn:hover:not(:disabled) { background: #1b4332; }
        .submit-btn:active:not(:disabled) { transform: scale(0.99); }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
          animation: spin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .switch-text { text-align: center; font-size: 13px; color: #6b7280; }
        .switch-link  { color: #2d6a4f; font-weight: 600; text-decoration: none; }
        .switch-link:hover { color: #1b4332; }

        /* Success screen */
        .success-wrap {
          text-align: center; padding: 20px 0;
          display: flex; flex-direction: column; align-items: center; gap: 14px;
        }
        .success-icon {
          width: 56px; height: 56px; border-radius: 50%;
          background: #d1fae5; display: flex; align-items: center; justify-content: center;
          font-size: 24px;
        }
        .success-title { font-size: 20px; font-weight: 700; color: #111827; }
        .success-sub   { font-size: 13px; color: #6b7280; line-height: 1.6; }
        .success-btn {
          padding: 10px 24px; border-radius: 8px; background: #2d6a4f;
          border: none; color: #fff; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: 'Inter', sans-serif;
          text-decoration: none; display: inline-block; margin-top: 4px;
        }

        .field-hint { font-size: 11px; margin-top: 4px; }
        .field-hint.err { color: #ef4444; }
        .field-hint.ok  { color: #22c55e; }
        
        .alert-error {
          background-color: #fef2f2; border-left: 4px solid #ef4444;
          color: #b91c1c; padding: 12px; margin-bottom: 16px; font-size: 13px;
          border-radius: 4px;
        }

        .captcha-wrap {
          margin-bottom: 16px;
        }
      `}</style>

      <div className="page">
        <div className="page-label">Registrierung</div>

        <section className="section">
          {/* Left: Hero Column mit dem vollflächigen Bild */}
          <div className="hero">
            <div className="illustration">
              <img 
                src="/RegisterBild.png" 
                alt="Forschungsstation" 
                className="station-img" 
              />
              
              {/* Die Schmetterlinge fliegen weiterhin munter über dem Bild */}
              <span className="illus-butterfly" style={{ top: 30, left: 40, animationDelay: '0s' }}>🦋</span>
              <span className="illus-butterfly" style={{ top: 50, right: 28, animationDelay: '1.5s', fontSize: 18 }}>🦋</span>
              <span className="illus-butterfly" style={{ top: 130, left: 20, animationDelay: '0.8s', fontSize: 16 }}>🦋</span>
            </div>

            <div className="hero-butterflies">
              <span style={{ fontSize: 20 }}>🦋</span>
              <div className="hero-headline">
                Werde Teil unserer<br />Sammlungs-Community
              </div>
              <span style={{ fontSize: 20 }}>🦋</span>
            </div>
            <div className="hero-sub">
              Registriere dich, um Objekte zu verwalten, Fundorte zu dokumentieren und Wissen zu teilen.
            </div>
          </div>

          {/* Right: Card */}
          <div className="card">
            {!success ? (
              <>
                <div className="card-title">Registrierung</div>
                <div className="card-sub">Erstelle dein Konto und starte deine Forschungsreise</div>

                {errorMsg && (
                  <div className="alert-error">{errorMsg}</div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  {/* Vollständiger Name */}
                  <div className="field-wrap">
                    <label className="field-label">Vollständiger Name</label>
                    <input
                      type="text" className="field-input"
                      placeholder="Max Mustermann"
                      value={name} onChange={e => setName(e.target.value)}
                      autoComplete="name" required
                    />
                  </div>

                  {/* E-Mail */}
                  <div className="field-wrap">
                    <label className="field-label">E-Mail-Adresse</label>
                    <input
                      type="email"
                      className={`field-input${email.length > 3 && !email.includes('@') ? ' error' : email.includes('@') ? ' ok' : ''}`}
                      placeholder="deine@email.de"
                      value={email} onChange={e => setEmail(e.target.value)}
                      autoComplete="email" required
                    />
                    {email.length > 3 && !email.includes('@') && (
                      <p className="field-hint err">Ungültige E-Mail-Adresse</p>
                    )}
                  </div>

                  {/* Passwort */}
                  <div className="field-wrap">
                    <label className="field-label">Passwort</label>
                    <div className="field-input-wrap">
                      <input
                        type={showPw ? 'text' : 'password'}
                        className="field-input has-icon"
                        placeholder="••••••••"
                        value={password} onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password" required
                      />
                      <button type="button" className="field-icon-btn" onClick={() => setShowPw(v => !v)}>
                        {showPw ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {password.length > 0 && (
                      <div className="strength-bar">
                        <div className="strength-track">
                          <div
                            className="strength-fill"
                            style={{ width: STRENGTH_W[strength], background: STRENGTH_COLOR[strength] }}
                          />
                        </div>
                        <div className="strength-label" style={{ color: STRENGTH_COLOR[strength] }}>
                          {STRENGTH_LABEL[strength]}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Passwort bestätigen */}
                  <div className="field-wrap">
                    <label className="field-label">Passwort bestätigen</label>
                    <div className="field-input-wrap">
                      <input
                        type={showCf ? 'text' : 'password'}
                        className={`field-input has-icon${pwMismatch ? ' error' : pwMatch ? ' ok' : ''}`}
                        placeholder="••••••••"
                        value={confirm} onChange={e => setConfirm(e.target.value)}
                        autoComplete="new-password" required
                      />
                      <button type="button" className="field-icon-btn" onClick={() => setShowCf(v => !v)}>
                        {showCf ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {pwMismatch && <p className="field-hint err">Passwörter stimmen nicht überein</p>}
                    {pwMatch    && <p className="field-hint ok">✓ Passwörter stimmen überein</p>}
                  </div>

                  {/* Rolle */}
                  <div className="field-wrap">
                    <label className="field-label">Rolle auswählen</label>
                    <select
                      className="field-select"
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      required
                    >
                      <option value="">— Rolle wählen —</option>
                      <option value="nutzer">Nutzer</option>
                      <option value="forscher">Forscher</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  {/* Agree */}
                  <div className="agree-row">
                    <input
                      type="checkbox"
                      className="agree-checkbox"
                      checked={agree}
                      onChange={e => setAgree(e.target.checked)}
                      id="agree"
                    />
                    <label htmlFor="agree" className="agree-text">
                      Ich akzeptiere die{' '}
                      <a href="#" className="agree-link">Nutzungsbedingungen</a>
                      {' '}und{' '}
                      <a href="#" className="agree-link">Datenschutzrichtlinien</a>
                    </label>
                  </div>

                  <div className="captcha-wrap">
                    <div id="clerk-captcha" />
                  </div>

                  <button type="submit" className="submit-btn" disabled={!canSubmit || loading}>
                    {loading ? <span className="spinner" /> : null}
                    {loading ? 'Registrierung läuft…' : 'Registrieren'}
                  </button>
                </form>

                <div className="switch-text">
                  Bereits ein Konto?{' '}
                  <Link href="/login" className="switch-link">Anmelden</Link>
                </div>
              </>
            ) : (
              <div className="success-wrap">
                <div className="success-icon">✅</div>
                <div className="success-title">Konto erstellt!</div>
                <div className="success-sub">
                  Dein Konto wurde erfolgreich angelegt.<br />
                  Nach Freigabe durch einen Moderator<br />
                  erhältst du Zugang zum System.
                </div>
                <Link href="/login" className="success-btn">Zur Anmeldung →</Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}