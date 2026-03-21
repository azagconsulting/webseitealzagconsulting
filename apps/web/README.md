# Arcto-CRM - Web

Minimalistische Next.js 16 Oberflaeche: Landingpage, leeres Dashboard sowie Einstellungen bleiben erhalten. Fokus: Colio-Funktionen entfernen und eine saubere CRM-Basis behalten.

## Verfuegbare Routen
- `/` - Landing mit Status/Story
- `/dashboard` - schlankes Board fuer KPIs
- `/settings` - bestehende Settings inkl. Theme Toggle

## Entwicklung
```bash
npm run web:dev
```

## Produktion
```bash
npm run web:build && npm run web:start
```

## Design / Technik
- Tailwind CSS v4 + Plus Jakarta Sans
- `next-themes` fuer Dark/Light
- Buttons & Cards liegen unter `src/components/ui`

## Login & Benutzerverwaltung
- Self-Service-Registrierungen sind deaktiviert. Nutze initial den Seed-Account `admin@arcto.com` (Passwort `arcto12345` oder dein angepasstes Setup) und verteile neue Zugaenge im Bereich **Team -> Mitarbeiter**.
- Optional kannst du die vorbefuellte Login-E-Mail bzw. einen Hinweistext ueber Environment-Variablen steuern:
  ```ini
  NEXT_PUBLIC_DEFAULT_LOGIN_EMAIL=admin@arcto.com
  NEXT_PUBLIC_DEFAULT_LOGIN_HINT=Passwort laut Backend-Setup
  ```
