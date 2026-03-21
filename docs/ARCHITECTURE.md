# Arcto-CRM – Architecture Notes

## 1. Überblick
- **Mission:** Saubere Ausgangsbasis für das CRM „Arcto by ALZAG Consulting“. Landingpage, Settings und ein funktionsreiches Dashboard bilden den Kern, Backend & Design-System bleiben bewusst leichtgewichtig.
- **Stack:** Next.js 16 (App Router, Tailwind CSS v4) für das Frontend, NestJS 11 + Prisma 6 für das API Layer auf MySQL, Redis für Hintergrundjobs. Beide Apps laufen im Monorepo via npm workspaces (`apps/web`, `apps/api`).
- **Naming:** Alle Pakete, Services und Container wurden auf **Arcto-CRM** umbenannt; Colio/Fuhrpark-Referenzen existieren nicht mehr.

## 2. Frontend (apps/web)
- **Landingpage (`/`):** Erzählt die Arcto-CRM Story, zeigt Status-Badge „Prisma ready“ und verlinkt direkt zu Dashboard bzw. Einstellungen.
- **Workspace Layout (`/(app)`):** Teilt sich Sidebar + Topbar mit Theme-Toggle. Aktuell zwei Seiten:
  - `/(app)/dashboard`: CRM Command Center mit Pipeline-Progress, Forecast, Follow-ups, Meetings, Leaderboard & Activity Stream (Dummy-Daten bis Prisma-Konnektivität aktiv ist).
  - `/(app)/customers`: Kunden-/Account-Tab wie in modernen CRMs mit Segment-Filtern, Health Badges, Owner-Infos und Detailpane.
  - `/(app)/settings`: Formularstruktur bleibt bestehen (Profil, Workspace, Notification Cards), Interaktionen landen lokal.
- **Design:** Plus Jakarta Sans, dunkles Glasdesign, `next-themes` für Dark/Light Mode, wiederverwendbare `Button` und `Card` Komponenten.

## 3. Backend (apps/api)
- **NestJS + Prisma:** Schema (`prisma/schema.prisma`) deckt User, Tenant, Vehicles etc. ab und bleibt die Basis für kommende CRM-Module.
- **Konfiguration:** `arcto-crm-api` als Servicename, `DATABASE_URL` zeigt auf `mysql://root:root@<host>:3306/arcto_crm`. Health- und Info-Endpunkte liefern Metadaten.
- **Tests:** Unit & e2e Tests aktualisiert auf den neuen Namen, laufen weiter mit `npm run api:test` & `npm run api:test:e2e`.

## 4. Infrastruktur & Dev-Setup
- **Docker Compose:** Dienste `db`, `redis`, `mailhog`, `api`, `web`. MySQL-Datenbank heißt jetzt `arcto_crm`.
- **CI:** GitHub Actions Workflow lintet Frontend/Backend und baut beide Pakete. Prisma-DB-URL wurde entsprechend angepasst.
- **Starten:**
  ```bash
  npm run web:dev   # Next.js Landingpage + CRM-Shell
  npm run api:dev   # NestJS + Prisma API
  docker compose up # Optionale Infrastruktur
  ```

## 5. Nächste Schritte
1. Entitäten für Kontakte/Deals im Prisma-Schema aktivieren und API-Module ergänzen.
2. Dashboard-Karten mit echten Daten verdrahten (React Query + API).
3. Authentifizierung abschließen und Settings-Formulare mit Mutationen verbinden.
4. Reporting-Widgets & Pipelines hinzufügen, sobald Domäne definiert ist.

Dieses Repository liefert somit eine klare Ausgangsbasis: Startseite, Dashboard, Settings & Design stehen – alles Weitere kann schrittweise zum vollwertigen CRM ausgebaut werden.
