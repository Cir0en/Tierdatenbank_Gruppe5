// Next.js Custom-App-Komponente: globaler Einstiegspunkt, der jede Seite der
// Anwendung umschließt. Hier wird der app-weite Context-Provider verdrahtet:
//  - ClerkProvider: stellt Authentifizierung/Session (Clerk) für alle Seiten bereit
import type { AppProps } from "next/app";
import { ClerkProvider } from "@clerk/nextjs";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider {...pageProps}>
      {/* Component = die jeweils aktive Seite (z.B. pages/login.tsx) */}
      <Component {...pageProps} />
    </ClerkProvider>
  );
}