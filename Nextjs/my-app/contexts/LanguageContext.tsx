// i18n-Kontext (Deutsch/Englisch) für die gesamte Anwendung.
// Stellt per React Context die aktuell gewählte Sprache (`lang`), eine Funktion
// zum Umschalten (`setLang`) sowie die passende Übersetzungstabelle (`t`) bereit.
// Die Auswahl wird in localStorage gemerkt, damit sie einen Seitenneuladen übersteht.
// Verwendung in Komponenten: `const { t, lang, setLang } = useLanguage();`
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import de, { type Translations } from '../locales/de';
import en from '../locales/en';

export type Lang = 'de' | 'en';

// Alle verfügbaren Übersetzungstabellen, indiziert nach Sprachkürzel
const LOCALES: Record<Lang, Translations> = { de, en };
// localStorage-Key, unter dem die zuletzt gewählte Sprache persistiert wird
const STORAGE_KEY = 'app_language';

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

// Default-Werte, falls eine Komponente außerhalb des Providers auf den Kontext zugreift
// (dann wird stumm Deutsch verwendet, setLang ist ein No-Op).
const LanguageContext = createContext<LanguageContextValue>({
  lang: 'de',
  setLang: () => {},
  t: de,
});

// Provider-Komponente: umschließt die App (siehe pages/_app.tsx) und verwaltet den
// Sprachzustand zentral, inkl. Laden/Speichern der Nutzerwahl in localStorage.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('de');

  // Beim ersten Rendern (nur Client-seitig) gespeicherte Sprachwahl aus localStorage
  // übernehmen, falls vorhanden und gültig. try/catch schützt z.B. gegen SSR oder
  // deaktivierten Storage-Zugriff.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored === 'de' || stored === 'en') setLangState(stored);
    } catch {}
  }, []);

  // Sprache wechseln: State aktualisieren und Wahl dauerhaft in localStorage sichern
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: LOCALES[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Convenience-Hook für Komponenten, um bequem auf Sprache/Übersetzungen zuzugreifen
export const useLanguage = () => useContext(LanguageContext);
