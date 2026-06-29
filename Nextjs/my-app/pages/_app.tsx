import type { AppProps } from "next/app";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "../contexts/LanguageContext";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider {...pageProps}>
      <LanguageProvider>
        <Component {...pageProps} />
      </LanguageProvider>
    </ClerkProvider>
  );
}