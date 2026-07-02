// Deutsche Übersetzungstabelle für den i18n-Kontext (siehe contexts/LanguageContext.tsx).
// Reine Schlüssel/Wert-Sammlung nach Bereichen gruppiert (nav, settings, common) –
// die Struktur muss zu locales/en.ts (Typ `Translations`) passen.
const de = {
  nav: {
    dashboard:  'Dashboard',
    collections:'Sammlungen',
    map:        'Karte',
    loans:      'Ausleihe',
    taxonomy:   'Taxonomie',
    settings:   'Einstellungen',
    moderation: 'Moderation',
    admin:      'Admin',
  },
  settings: {
    title:           'Einstellungen',
    profile:         'Mein Profil',
    username:        'Benutzername',
    role:            'Rolle',
    institution:     'Institution',
    registeredSince: 'Registriert seit',
    languageSection: 'Sprache',
    languageLabel:   'Anzeigesprache',
    german:          'Deutsch',
    english:         'Englisch',
    dangerZone:      '⚠ Gefahrenzone',
    deleteAccount:   'Konto löschen',
    deleteWarning:   'Wenn du dein Konto löschst, werden alle deine persönlichen Daten unwiderruflich anonymisiert. Deine Sammlungseinträge und Taxonomie-Beiträge bleiben erhalten, sind aber nicht mehr dir zugeordnet.',
    dialogTitle:     'Konto wirklich löschen?',
    dialogWarn:      'Diese Aktion ist unwiderruflich. Dein Konto wird gelöscht und alle persönlichen Daten anonymisiert. Du wirst sofort abgemeldet.',
    confirmLabel:    'Gib LÖSCHEN ein um zu bestätigen:',
    confirmKeyword:  'LÖSCHEN',
    confirmPlaceholder: 'LÖSCHEN',
    deleteBtn:       'Konto endgültig löschen',
    deleting:        '⏳ Wird gelöscht…',
    cancel:          'Abbrechen',
  },
  common: {
    loading: 'Wird geladen…',
    empty:   '—',
    roles: { admin: 'Admin', moderator: 'Moderator', nutzer: 'Nutzer' },
  },
};

export default de;
export type Translations = typeof de;
