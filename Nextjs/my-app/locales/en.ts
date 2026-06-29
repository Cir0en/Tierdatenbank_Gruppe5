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
