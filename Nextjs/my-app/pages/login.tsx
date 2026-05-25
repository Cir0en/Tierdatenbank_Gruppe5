'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSignIn, useClerk } from '@clerk/nextjs'; 

export default function LoginPage() {
  const { signIn } = useSignIn(); // Clerk Hook (ohne isLoaded wegen TS)
  const { setActive } = useClerk();
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;
    
    setLoading(true);
    setErrorMsg('');

    try {
      const result = await signIn.create({
        identifier: email,
        password: password,
      }) as any;

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard"); 
      } else {
        console.log("Weitere Schritte nötig (z.B. MFA):", result);
      }
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.errors?.[0]?.longMessage || 'Login fehlgeschlagen. Bitte prüfe deine Daten.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: 'oauth_google' | 'oauth_microsoft') => {
    if (!signIn) return;
    (signIn as any).authenticateWithRedirect({
      strategy: provider,
      redirectUrl: '/sso-callback',
      redirectUrlComplete: '/dashboard', 
    });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100vh; font-family: 'Inter', sans-serif; background: #eef2ee; color: #1a1a1a; }

        .page { min-height: 100vh; background: #eef2ee; display: flex; flex-direction: column; }

        .page-label {
          padding: 18px 32px; font-size: 13px; color: #9ca3af; font-weight: 400;
        }

        .section {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 0 40px 60px; gap: 40px;
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

        .hero-emojis {
          position: absolute; inset: 0; pointer-events: none;
          font-size: 42px; opacity: 0.18;
          display: flex; align-items: flex-start; justify-content: flex-end;
          padding: 30px 28px 0 0;
          filter: blur(0.5px);
          z-index: 2;
        }
        .hero-butterfly {
          position: absolute; font-size: 36px; z-index: 3;
          animation: flutter 3s ease-in-out infinite;
        }
        @keyframes flutter {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          50%       { transform: translateY(-10px) rotate(5deg); }
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
        .lang-sel {
          position: absolute; top: 18px; right: 20px;
          display: flex; align-items: center; gap: 4px;
          font-size: 12px; color: #6b7280; cursor: pointer;
          padding: 4px 8px; border-radius: 6px; border: 1px solid #e5e7eb;
          background: #fff; transition: background 0.15s;
        }
        .lang-sel:hover { background: #f9fafb; }

        .card-title { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
        .card-sub   { font-size: 13px; color: #6b7280; margin-bottom: 24px; }

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

        .forgot-link {
          display: block; text-align: right; font-size: 13px;
          font-weight: 500; color: #2d6a4f; text-decoration: none;
          margin-top: 6px; margin-bottom: 20px; transition: color 0.15s;
        }
        .forgot-link:hover { color: #1a3d2b; }

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

        .divider {
          display: flex; align-items: center; gap: 12px;
          margin: 20px 0; font-size: 12px; color: #9ca3af;
        }
        .divider-line { flex: 1; height: 1px; background: #f3f4f6; }

        .oauth-row { display: flex; gap: 10px; margin-bottom: 20px; }
        .oauth-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 9px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; font-size: 13px; font-weight: 500; color: #374151;
          cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.15s;
        }
        .oauth-btn:hover { background: #f9fafb; border-color: #d1d5db; }
        .oauth-icon { font-size: 16px; }

        .switch-text {
          text-align: center; font-size: 13px; color: #6b7280;
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
      `}</style>

      <div className="page">
        <div className="page-label">Login</div>

        <section className="section">
          {/* Left: Hero mit Bild anstelle von CSS-Farbverlauf */}
          <div className="hero">
            <img 
              src="/LoginBild.png" 
              alt="Terrarium" 
              className="hero-img" 
            />
            
            <div className="hero-overlay">
              <div className="hero-headline">
                Zoologische Sammlung<br />verwalten. Entdecken.<br />Schützen.
              </div>
              <div className="hero-sub">
                Eine Plattform für Forschung, Sammlungen und Biodiversität.
              </div>
            </div>
          </div>

          {/* Right: Card */}
          <div className="card">
            <button className="lang-sel">DE ▾</button>

            <div className="card-title">Willkommen zurück</div>
            <div className="card-sub">Melde dich an, um fortzufahren</div>

            {errorMsg && (
              <div className="alert-error">{errorMsg}</div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="field-wrap">
                <label className="field-label">E-Mail</label>
                <input
                  type="email" className="field-input"
                  placeholder="deine@email.de"
                  value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" required
                />
              </div>

              <div className="field-wrap">
                <label className="field-label">Passwort</label>
                <div className="field-input-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="field-input has-icon"
                    placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" required
                  />
                  <button type="button" className="field-icon-btn" onClick={() => setShowPw(v => !v)}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <Link href="/passwort-vergessen" className="forgot-link">Passwort vergessen?</Link>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? <span className="spinner" /> : null}
                {loading ? 'Anmelden…' : 'Anmelden'}
              </button>
            </form>

            <div className="divider">
              <div className="divider-line" />
              <span>oder weiter mit</span>
              <div className="divider-line" />
            </div>

            <div className="oauth-row">
              <button 
                type="button" 
                className="oauth-btn" 
                onClick={() => handleOAuth('oauth_google')}
              >
                <span className="oauth-icon">🔵</span> Google
              </button>
              <button 
                type="button" 
                className="oauth-btn" 
                onClick={() => handleOAuth('oauth_microsoft')}
              >
                <span className="oauth-icon">🟦</span> Microsoft
              </button>
            </div>

            <div className="switch-text">
              Noch kein Konto?{' '}
              <Link href="/register" className="switch-link">Registrieren</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}