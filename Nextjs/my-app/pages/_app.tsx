// Next.js Custom-App-Komponente: globaler Einstiegspunkt, der jede Seite der
// Anwendung umschließt. Hier werden die app-weiten Context-Provider verdrahtet:
//  - ClerkProvider: stellt Authentifizierung/Session (Clerk) für alle Seiten bereit
//  - LanguageProvider: stellt den i18n-Kontext (DE/EN) für alle Seiten bereit
import type { AppProps } from "next/app";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "../contexts/LanguageContext";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider {...pageProps}>
      <LanguageProvider>
        {/* Component = die jeweils aktive Seite (z.B. pages/login.tsx) */}
        <Component {...pageProps} />
      </LanguageProvider>
    </ClerkProvider>
  );
}