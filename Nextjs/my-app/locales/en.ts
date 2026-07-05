// Englische Übersetzungstabelle für den i18n-Kontext (siehe contexts/LanguageContext.tsx).
// Muss strukturell exakt dem Typ `Translations` aus locales/de.ts entsprechen
// (daher die explizite Typannotation unten), damit für jeden Schlüssel eine
// englische Entsprechung existiert.
import type { Translations } from './de';

const en: Translations = {
  nav: {
    dashboard:  'Dashboard',
    collections:'Collections',
    map:        'Map',
    loans:      'Loans',
    taxonomy:   'Taxonomy',
    settings:   'Settings',
    moderation: 'Moderation',
    admin:      'Admin',
  },
  settings: {
    title:           'Settings',
    profile:         'My Profile',
    username:        'Username',
    role:            'Role',
    institution:     'Institution',
    registeredSince: 'Registered since',
    languageSection: 'Language',
    languageLabel:   'Display language',
    german:          'German',
    english:         'English',
    exportTitle:     'Export',
    exportDesc:      'Export all collection items as a CSV file. The file contains name, status, taxonomy, location, measurements and other fields.',
    exportBtn:       '⬇ Download CSV',
    exportBtnBusy:   '⏳ Generating…',
    importTitle:     'Import',
    importDesc:      'Import collection items from a CSV file (same column format as the export). Taxonomy, collection and location are reused or newly created based on their name.',
    importBtn:       '⬆ Import CSV',
    importBtnBusy:   '⏳ Importing…',
    dangerZone:      '⚠ Danger Zone',
    deleteAccount:   'Delete account',
    deleteWarning:   'If you delete your account, all your personal data will be irreversibly anonymised. Your collection entries and taxonomy contributions will remain but will no longer be associated with you.',
    dialogTitle:     'Really delete account?',
    dialogWarn:      'This action is irreversible. Your account will be deleted and all personal data anonymised. You will be signed out immediately.',
    confirmLabel:    'Type DELETE to confirm:',
    confirmKeyword:  'DELETE',
    confirmPlaceholder: 'DELETE',
    deleteBtn:       'Permanently delete account',
    deleting:        '⏳ Deleting…',
    cancel:          'Cancel',
  },
  common: {
    loading: 'Loading…',
    empty:   '—',
    roles: { admin: 'Admin', moderator: 'Moderator', nutzer: 'User' },
  },
};

export default en;
