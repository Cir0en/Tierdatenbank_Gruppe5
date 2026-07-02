// Route /sso-callback: technische Zwischenseite, auf die Clerk nach einem
// OAuth-Login (z.B. "Weiter mit Google", siehe handleOAuth in pages/login.tsx)
// zurückleitet. Die Seite zeigt selbst keine eigene UI an, sondern delegiert die
// gesamte Verarbeitung des Redirects (Token-Austausch, Session erstellen) an
// Clerks <AuthenticateWithRedirectCallback>. Nach erfolgreichem Abschluss von
// Sign-In bzw. Sign-Up wird der Nutzer automatisch zu /dashboard weitergeleitet.
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SSOCallbackPage() {
  return (
    <>
      {/* Für Clerk-Captcha-Integration erforderliches Platzhalter-Element */}
      <div id="clerk-captcha" />
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/dashboard"
        />
    </>

  ); ;
}