# Arcto Labs - Sicherheits- und Datenschutzpruefung (Code Review)

Hinweis: Diese Pruefung basiert auf dem Quellcode-Stand im Repository. Sie ersetzt keine Rechtsberatung, keine Infrastruktur-Pruefung und keinen Penetrationstest.

## Scope
- Backend: `apps/api`
- Frontend (App): `apps/web/src` (Auth, API-Client)
- Website (Public): `apps/web/public/Webseite Autohaus Herrmann`
- Dev/Infra-Configs: `docker-compose.yml`

Nicht geprueft: Hosting/Netzwerk, WAF/CDN, Secrets-Management, Backups/Monitoring, AV-Vertraege, interne Prozesse.

## Bestehende Schutzmassnahmen (positiv)
- Passwoerter werden mit bcrypt gehasht (`apps/api/src/modules/auth/auth.service.ts`).
- JWT Secrets werden via Env-Validation erzwungen (`apps/api/src/config/env.validation.ts`).
- Globales Input-Validation-Pipe mit Whitelist und Reject fuer unbekannte Felder (`apps/api/src/main.ts`).
- Helmet aktiviert Standard-Header (`apps/api/src/main.ts`).
- Passwort-Reset-Codes werden gehasht und laufen ab (`apps/api/src/modules/users/users.service.ts`).
- Kontaktanfragen aus Chatbot/Kontaktformular werden nach 30 Tagen geloescht (`apps/api/src/modules/leads/leads.service.ts`).

## Pruefergebnisse (priorisiert)
- H-01 Consent wird umgangen: Google Tag/Analytics und eigenes Tracking werden direkt in HTML geladen, obwohl das Consent-Skript explizit das Gegenteil verlangt. Das verletzt TTDSG/DSGVO (Einwilligung vor Device-Storage/Tracking). Beispiele: `apps/web/public/Webseite Autohaus Herrmann/index.html`, `apps/web/public/Webseite Autohaus Herrmann/pages/*.html`, `apps/web/public/Webseite Autohaus Herrmann/assets/js/arcto-tracking.js`, `apps/web/public/Webseite Autohaus Herrmann/assets/js/cookie-consent.js`.
- H-02 Rate-Limiting ist nicht aktiv: Throttler ist konfiguriert, aber kein Guard registriert. Login, Passwort-Reset, Chatbot, Kontaktformular und Tracking sind damit ungeschuetzt gegen Brute-Force/Abuse. Pfad: `apps/api/src/app.module.ts`.
- H-03 Rollen- und Tenant-Checks unvollstaendig: `AdminGuard` existiert, wird aber nicht genutzt. Mitarbeiterverwaltung ist fuer alle eingeloggten Nutzer offen; mehrere Services verwenden `id`-Zugriffe ohne Tenant-Filter. Pfade: `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/leads/leads.service.ts`.
- H-04 Geheimnis im Repo: `docker-compose.yml` enthaelt eine echte DB-URL inkl. Benutzer/Passwort. Das ist ein Sicherheitsvorfall und muss rotiert werden.
- M-01 OpenAI-Transfers mit Personenbezug: Chatbot-Nachrichten und Lead-Extraktion werden an OpenAI geschickt, inkl. potenzieller personenbezogener Daten. Das erfordert AV-Vertrag, Transfer-Assessment und klare Datenschutzhinweise. Pfade: `apps/api/src/modules/chatbot/chatbot.service.ts`, `apps/api/src/modules/leads/leads.service.ts`.
- M-02 Tokens in LocalStorage: Access/Refresh Tokens liegen im Browser-Storage, was XSS-Risiken erhoeht. Pfad: `apps/web/src/components/auth-provider.tsx`.
- M-03 Passwort-Reset/Logins ohne Sperren: Reset-Code ist kurz (6-stellig) und es gibt keine Versuchslimits oder Sperren. Pfade: `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/users/users.service.ts`.
- M-04 Captcha nur clientseitig: Das Kontaktformular-„Captcha“ ist reine Clientlogik und kann umgangen werden. Pfad: `apps/web/public/Webseite Autohaus Herrmann/assets/js/recaptcha.js`, Endpoint: `apps/api/src/modules/leads/public-contact.controller.ts`.
- M-05 Refresh Tokens ohne Revocation/Rotation: Es gibt keinen Token-Store, also keine serverseitige Invalidierung. Pfad: `apps/api/src/modules/auth/auth.service.ts`.
- M-06 Dateiablage ohne Verschluesselung: Drive-Dateien werden im Dateisystem gespeichert; Verschluesselung im Ruhemodus ist nicht vorgesehen. Pfad: `apps/api/src/modules/drive/drive-storage.service.ts`.

## Verbesserungen (Backlog)
Kurzfristig (0-30 Tage):
- Consent-Flow korrigieren: Analytics/Tracking nur nach Einwilligung laden; statische gtag-Snippets aus HTML entfernen; `arcto-tracking.js` an Consent koppeln.
- ThrottlerGuard global aktivieren und fuer Public-Endpunkte strengere Limits setzen.
- Admin-Only-Routen absichern (Mitarbeiterverwaltung, Einstellungen).
- Secrets aus `docker-compose.yml` entfernen und kompromittierte Credentials rotieren.

Mittelfristig (30-90 Tage):
- MFA/2FA fuer Admins und Backoffice einbauen.
- Login/Reset mit Versuchslimits, IP/Device-Rate-Limits und optionaler CAPTCHA absichern.
- Refresh-Token-Rotation mit serverseitiger Speicherung (hashed) und Revocation implementieren.
- Tenant-Scoping in allen Service-Abfragen erzwingen.
- CSP fuer Frontend setzen, um XSS-Risiko zu reduzieren.

Langfristig (90+ Tage):
- Verschluesselung at-rest fuer Drive/DB (KMS/Managed Storage) und Schluessel-Management.
- Security-Monitoring (SIEM), Audit-Logs, Incident-Runbooks.
- Datenschutzprozesse fuer Auskunft/Loeschung (DSAR) automatisieren.

## Datenschutzrechtliche Einordnung (DSGVO/TTDSG)
Aktueller Stand ist nicht DSGVO/TTDSG-sicher, da Tracking/Analytics ohne Consent geladen werden. Zusaetzlich sind OpenAI-Transfers ohne explizite technische Datenminimierung und ohne dokumentierte AV-Vertraege ein Risiko. Fuer eine saubere DSGVO-Lage sind mindestens notwendig:
- Saubere Einwilligungsverwaltung und dokumentierter Consent.
- AV-Vertraege und Transfer-Assessment (OpenAI, Hosting, Mail).
- Verzeichnis von Verarbeitungstaetigkeiten, Loeschkonzepte, DSAR-Prozess.

## Anmeldung & Datensicherheit (Kurzfazit)
Die Authentifizierung nutzt JWT + bcrypt und ist grundsaetzlich solide, jedoch fehlen MFA, Token-Revocation und wirksames Rate-Limiting. Tokens in LocalStorage erhoehen das XSS-Risiko. Fuer „Datensicherheit gewaehrleistet“ muessen die oben genannten Punkte adressiert werden.

## Zertifizierungen moeglich?
Ja, aber nicht nur durch Code-Aenderungen. Fuer ISO 27001, TISAX oder SOC 2 sind ein ISMS, dokumentierte Prozesse, Risikoanalysen, Schulungen, Zugriffsprozesse, Audit-Logs und regelmaessige Audits notwendig. Die Code-Baustellen oben sind eine Teilmenge der Anforderungen.

## Offene Fragen
- Wo liegen Produktion, Backups und Logs (Region/EU)?
- Welche Dienstleister sind aktiv (OpenAI, Hosting, E-Mail)?
- Gibt es bereits AV-Vertraege und TOMs?
- Wie werden Incidents dokumentiert und gemeldet?
