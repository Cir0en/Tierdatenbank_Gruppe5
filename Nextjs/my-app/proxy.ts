// Next.js Middleware (Route-Proxy) auf Basis von Clerk: läuft vor jedem Request,
// der auf das unten definierte `matcher`-Muster passt, und erzwingt für bestimmte
// Routen eine gültige Anmeldung, bevor die eigentliche Seite/Route ausgeliefert wird.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routen, die eine Anmeldung voraussetzen (Dashboard, Admin- und Moderator-Bereich).
// Alle anderen Routen bleiben ohne Login zugreifbar (z.B. Login/Register/Startseite).
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/admin(.*)',
  '/moderator(.*)',

]);

// Für jede geschützte Route wird auth.protect() aufgerufen: nicht angemeldete
// Nutzer werden von Clerk automatisch zur Login-Seite umgeleitet.
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

// Legt fest, auf welche Pfade diese Middleware überhaupt angewendet wird:
// statische Next.js-Assets (_next) und gängige Dateitypen (Bilder, CSS, JS, Fonts)
// werden ausgeschlossen, API-/tRPC-Routen werden explizit eingeschlossen.
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf|map)).*)",
    "/(api|trpc)(.*)",
  ],
};