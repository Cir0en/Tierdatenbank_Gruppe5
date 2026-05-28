# Clerk Integration

22.05.2026

Hier wird der aktuelle Stand der Clerk-Integration beschrieben, und was im Frontend noch gemacht werden muss.
Die bestehenden Seiten `login.tsx` und `register.tsx` sollen unser Design benutzen, aber Clerk für Authentifizierung nutzen.

---

## 1. Aktueller Stand

### Bereits eingerichtet

Folgendes bereits vorbereitet:

- Clerk ist im Next.js installiert
- Clerk Provider eingebunden
- Clerk Middleware/Proxy wurde eingerichtet
- Google Auth Callback Page angelegt
- Backend Webhook vorbereitet
- Clerk Controller vorbereitet
- Neue User können später über den Webhook in Neon angelegt werden

## 2. Lokale .env.local muss eingerichtet werden

# SEHR WICHTIG:

Den Inhalt von .env.example in eigene .env.local kopieren, die nicht gepucht werden soll.
Die genauen Keys werden privat mitgeteilt oder schaut bei Clerk Dashboard

## 3. Clerk Provider

### \\\_app.tsx macht Clerk in allen pages verfügbar

## 4. geschützte Routen

### proxy.ts

Dashboard und Karte aktuell nur für eingeloggte Nutzer sichtbar

## 5. Google Callback

### sso-callback.tsx

wird bei Google Login/Registrierung verwendet.

## 6. Was im Frontend fehlt:

### login und register.tsx aktuell nicht mit Clerk verbunden

für login werden benötigt:

- Email-Feld
- Passwort-Feld
- Loading-State (um nicht 100 mal auf login klicken zu können)
- Error-State (falls Passwort falsch oder so)
- Button für Email + Passwort Login
- Button für Google Login

für register Seite:

- Username-Feld
- Email-Feld
- Passwort-Feld
- Passwort bestätigen
- Email-Code-Feld (für Email-Code Verifikation)
- Loading-State
- Error-State
- Button für Email + Passwort Registrierung
- Button für Google Registrierung

## Info:

- [Custom Email/Password](https://clerk.com/docs/guides/development/custom-flows/authentication/email-password)  
  Registrierung und Login mit eigener UI, mit Email-Code-Verifikzierung

- [OAuth Custom Flow](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections)  
  Google Login/Registrierung mit eigenem Design

- [useSignIn](https://clerk.com/docs/nextjs/reference/hooks/use-sign-in)

- [useSignUp](https://clerk.com/docs/nextjs/reference/hooks/use-sign-up)

- [Clerk Next.js Quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)  
  Grundsetup

## 7. Institutionen

Aktuelle gibt es in der Datenbank keinen passenden Eintrag, zu besprechen
Backend speichert: clerk_id, username, email, role, created_at
