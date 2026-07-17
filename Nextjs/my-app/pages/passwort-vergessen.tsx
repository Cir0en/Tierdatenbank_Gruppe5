// Route /passwort-vergessen: Passwort-Zurücksetzen-Flow über Clerk (useSignIn).
// Zweistufig:
//  1) E-Mail eingeben -> Clerk verschickt selbst einen Code per Mail
//     (Strategie "reset_password_email_code"); es ist kein eigener Mailversand nötig.
//  2) Code + neues Passwort eingeben -> attemptFirstFactor bestätigt den Code
//     und setzt in einem Zug das neue Passwort. Bei Erfolg wird die neue Session
//     aktiviert und zur Startseite weitergeleitet (analog zu login.tsx).
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useClerk } from '@clerk/nextjs';
import { useSignIn } from '@clerk/nextjs/legacy';

type Step = 'email' | 'code';

export default function PasswortVergessenPage() {
  const { isLoaded, signIn } = useSignIn(); // Clerk Hook (ohne isLoaded wegen TS)
  const { setActive } = useClerk();
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail]                     = useState('');
  const [code, setCode]                       = useState('');
  const [password, setPassword]               = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPw, setShowPw]                   = useState(false);

  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg]   = useState('');

  // Übernimmt eine per ?email=... übergebene Adresse (z.B. Link aus den Einstellungen
  // für Nutzer ohne Passwort, siehe export.tsx), sobald die Query verfügbar ist.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.email;
    const value = Array.isArray(q) ? q[0] : q;
    if (value) setEmail(value);
  }, [router.isReady, router.query.email]);

  // Schritt 1: Fordert bei Clerk einen Reset-Code für die angegebene E-Mail an.
  // Clerk verschickt die Mail eigenständig; es gibt hier keinen eigenen Mailversand.
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    setErrorMsg('');
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setInfoMsg(`Code an ${email} verschickt. Bitte E-Mails (auch Spam-Ordner) prüfen.`);
      setStep('code');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.errors?.[0]?.longMessage || 'Anfrage fehlgeschlagen. Bitte prüfe deine E-Mail-Adresse.');
    } finally {
      setLoading(false);
    }
  };

  // Schritt 2: Bestätigt den per Mail erhaltenen Code und setzt dabei direkt
  // das neue Passwort. Bei Erfolg liefert Clerk eine fertige Session, die wir
  // sofort aktivieren (der Nutzer ist danach automatisch eingeloggt).
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (password !== passwordConfirm) {
      setErrorMsg('Die Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.push('/');
      } else {
        console.log('Weitere Schritte nötig:', result);
        setErrorMsg('Zurücksetzen konnte noch nicht abgeschlossen werden.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.errors?.[0]?.longMessage || 'Code ungültig oder abgelaufen.');
    } finally {
      setLoading(false);
    }
  };

  // Fordert erneut einen Code an (z.B. falls die Mail nicht ankam), ohne dass
  // der Nutzer zurück zu Schritt 1 wechseln muss.
  const handleResend = async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setInfoMsg('Neuer Code verschickt.');
    } catch (err: any) {
      setErrorMsg(err.errors?.[0]?.longMessage || 'Erneutes Senden fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          background: #eef2ee;
          color: #1a1a1a;
          zoom: 1.33;
        }

        .page {
          min-height: 100vh;
          background: #eef2ee;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .page-label {
          position: absolute;
          top: 0;
          left: 0;
          padding: 18px 32px;
          font-size: 13px;
          color: #9ca3af;
          font-weight: 400;
        }

        .close-btn {
          position: absolute;
          top: 16px;
          right: 20px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          border: none;
          background: none;
          color: #9ca3af;
          font-size: 20px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          text-decoration: none;
          line-height: 1;
        }
        .close-btn:hover {
          background: rgba(0,0,0,0.07);
          color: #374151;
        }

        .section {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 40px;
        }

        /* ── Left panel (Hero mit Bild) ── */
        .hero {
          width: 380px; height: 480px; border-radius: 20px; overflow: hidden;
          position: relative; flex-shrink: 0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.14);
          background: #d1d5db;
        }

        .hero-img {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; z-index: 1;
        }

        .hero-overlay {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(to top, rgba(10,40,20,0.85) 0%, transparent 100%);
          padding: 32px 28px;
          z-index: 3;
        }
        .hero-headline {
          font-size: 26px; font-weight: 700; color: #fff;
          line-height: 1.25; margin-bottom: 10px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .hero-sub {
          font-size: 13px; color: rgba(255,255,255,0.75);
          line-height: 1.55;
        }

        /* ── Card ── */
        .card {
          width: 360px; background: #fff; border-radius: 20px;
          padding: 36px 32px 32px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          position: relative;
        }

        .card-title { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
        .card-sub   { font-size: 13px; color: #6b7280; margin-bottom: 24px; line-height: 1.5; }

        .field-wrap { margin-bottom: 14px; }
        .field-label {
          display: block; font-size: 13px; font-weight: 500;
          color: #374151; margin-bottom: 6px;
        }
        .field-input-wrap { position: relative; }
        .field-input {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid #e5e7eb; font-size: 14px; color: #111827;
          background: #fff; outline: none; font-family: 'Inter', sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field-input::placeholder { color: #9ca3af; }
        .field-input:focus {
          border-color: #2d6a4f;
          box-shadow: 0 0 0 3px rgba(45,106,79,0.1);
        }
        .field-input.has-icon { padding-right: 42px; }
        .field-icon-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9ca3af;
          font-size: 16px; transition: color 0.15s; padding: 2px;
        }
        .field-icon-btn:hover { color: #6b7280; }

        .code-hint {
          font-size: 12px; color: #6b7280; margin: -6px 0 14px;
        }
        .resend-link {
          background: none; border: none; padding: 0; margin: -6px 0 14px;
          font-size: 12px; font-weight: 500; color: #2d6a4f; cursor: pointer;
          font-family: 'Inter', sans-serif; text-decoration: underline;
        }
        .resend-link:disabled { opacity: 0.6; cursor: not-allowed; }

        .submit-btn {
          width: 100%; padding: 12px; border-radius: 8px;
          background: #2d6a4f; border: none; color: #fff;
          font-size: 15px; font-weight: 600; cursor: pointer;
          font-family: 'Inter', sans-serif;
          transition: background 0.15s, transform 0.1s;
          box-shadow: 0 2px 8px rgba(45,106,79,0.3);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .submit-btn:hover:not(:disabled) { background: #1b4332; }
        .submit-btn:active:not(:disabled) { transform: scale(0.99); }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .switch-text {
          text-align: center; font-size: 13px; color: #6b7280; margin-top: 16px;
        }
        .switch-link {
          color: #2d6a4f; font-weight: 600; text-decoration: none; transition: color 0.15s;
        }
        .switch-link:hover { color: #1b4332; }

        .alert-error {
          background-color: #fef2f2; border-left: 4px solid #ef4444;
          color: #b91c1c; padding: 12px; margin-bottom: 16px; font-size: 13px;
          border-radius: 4px;
        }
        .alert-info {
          background-color: #f0fdf4; border-left: 4px solid #22c55e;
          color: #166534; padding: 12px; margin-bottom: 16px; font-size: 13px;
          border-radius: 4px;
        }
      `}</style>

      <div className="page">
        <div className="page-label">Passwort vergessen</div>
        <Link href="/login" className="close-btn" title="Zurück zum Login">✕</Link>

        <section className="section">
          {/* Left: Hero mit Bild */}
          <div className="hero">
            <img
              src="/LoginBild.png"
              alt="Terrarium"
              className="hero-img"
            />

            <div className="hero-overlay">
              <div className="hero-headline">
                Passwort<br />zurücksetzen.
              </div>
              <div className="hero-sub">
                Wir schicken dir einen Code per E-Mail, mit dem du ein neues Passwort vergeben kannst.
              </div>
            </div>
          </div>

          {/* Right: Card */}
          <div className="card">
            {step === 'email' ? (
              <>
                <div className="card-title">Passwort vergessen?</div>
                <div className="card-sub">
                  Gib deine E-Mail-Adresse ein. Wir senden dir einen Code, mit dem du ein neues Passwort setzen kannst.
                </div>

                {errorMsg && <div className="alert-error">{errorMsg}</div>}

                <form onSubmit={handleRequestCode} noValidate>
                  <div className="field-wrap">
                    <label className="field-label">E-Mail</label>
                    <input
                      type="email" className="field-input"
                      placeholder="deine@email.de"
                      value={email} onChange={e => setEmail(e.target.value)}
                      autoComplete="email" required autoFocus
                    />
                  </div>

                  <button type="submit" className="submit-btn" disabled={loading || !isLoaded} style={{ marginTop: 6 }}>
                    {loading ? <span className="spinner" /> : null}
                    {loading ? 'Wird gesendet…' : 'Code anfordern'}
                  </button>
                </form>

                <div className="switch-text">
                  <Link href="/login" className="switch-link">← Zurück zum Login</Link>
                </div>
              </>
            ) : (
              <>
                <div className="card-title">Code eingeben</div>
                <div className="card-sub">
                  Gib den Code aus der E-Mail sowie dein neues Passwort ein.
                </div>

                {errorMsg && <div className="alert-error">{errorMsg}</div>}
                {infoMsg && !errorMsg && <div className="alert-info">{infoMsg}</div>}

                <form onSubmit={handleResetPassword} noValidate>
                  <div className="field-wrap">
                    <label className="field-label">Code</label>
                    <input
                      type="text" inputMode="numeric" className="field-input"
                      placeholder="123456"
                      value={code} onChange={e => setCode(e.target.value)}
                      autoComplete="one-time-code" required autoFocus
                    />
                  </div>

                  <button
                    type="button" className="resend-link"
                    onClick={handleResend} disabled={loading || !isLoaded}
                  >
                    Code erneut senden
                  </button>

                  <div className="field-wrap">
                    <label className="field-label">Neues Passwort</label>
                    <div className="field-input-wrap">
                      <input
                        type={showPw ? 'text' : 'password'}
                        className="field-input has-icon"
                        placeholder="••••••••"
                        value={password} onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password" required minLength={8}
                      />
                      <button type="button" className="field-icon-btn" onClick={() => setShowPw(v => !v)}>
                        {showPw ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <div className="field-wrap">
                    <label className="field-label">Passwort bestätigen</label>
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="field-input"
                      placeholder="••••••••"
                      value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password" required minLength={8}
                    />
                  </div>

                  <button type="submit" className="submit-btn" disabled={loading || !isLoaded}>
                    {loading ? <span className="spinner" /> : null}
                    {loading ? 'Wird gespeichert…' : 'Passwort zurücksetzen'}
                  </button>
                </form>

                <div className="switch-text">
                  <button
                    type="button"
                    className="switch-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
                    onClick={() => { setStep('email'); setErrorMsg(''); setInfoMsg(''); }}
                  >
                    ← Andere E-Mail-Adresse verwenden
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
