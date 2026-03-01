# Arcto-CRM

Arcto-CRM ist die moderne CRM-Spielwiese von ALZAG Consulting: eine Next.js-16-App mit Tailwind CSS v4 für Landingpage, Dashboard, Kunden- & Einstellungs-Views plus einer NestJS-11-API mit Prisma/MySQL, Redis und optionalem Mailhog. Das Repository bündelt Frontend & Backend als npm-Monorepo und bringt Docker-Compose-Services für Datenbank und Infrastruktur gleich mit.

## Architektur in Kürze
- **Frontend (`apps/web`):** Next.js (App Router) + React 19 + Tailwind 4, `next-themes` für Dark-/Light-Mode, Komponenten wie Button & Card werden mehrfach genutzt. Routing deckt Landingpage (`/`), Dashboard `/(app)/dashboard`, Kundenliste `/(app)/customers` und Settings ab.
- **Backend (`apps/api`):** NestJS 11 mit Prisma 6, Auth (JWT), Rate-Limiting, Config Validation via `zod` und Health-/Info-Endpunkte. Prisma modelliert User, Tenants, Pipelines etc. und verbindet sich mit MySQL.
- **Infra:** Docker Compose liefert MySQL 8.4 (`arcto_crm`), Redis 7, Mailhog sowie optionale Produktions-Builds von API und Web. Details stehen zusätzlich in `docs/ARCHITECTURE.md`.

## Projektstruktur
```
apps/
  web/        # Next.js-Frontend
  api/        # NestJS + Prisma API
docs/
  ARCHITECTURE.md
docker-compose.yml
package.json  # zentrale npm-Skripte für beide Workspaces
```

## Voraussetzungen
- Node.js ≥ 20 (Next 16 & Nest 11 benötigen moderne Features) und npm 11.
- Docker + Docker Compose (optional, aber empfohlen für DB/Redis/Mailhog).
- OpenSSL o. ä., um sichere JWT-Secrets zu generieren (`openssl rand -hex 32`).

## Installation & Konfiguration
1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Environment-Datei für die API anlegen (`apps/api/.env`). Beispiel:
   ```ini
   NODE_ENV=development
   PORT=4000
   DATABASE_URL=mysql://root:root@localhost:3306/arcto_crm
   APP_URL=http://localhost:3000
   API_URL=http://localhost:4000
   JWT_SECRET=<32+ Zeichen>
   JWT_REFRESH_SECRET=<32+ Zeichen>
   JWT_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=30d
   ```
   Optionale SMTP/Stripe-Variablen findest du in `apps/api/src/config/env.validation.ts`.
3. Prisma vorbereiten (führt Migrationen aus der API heraus aus):
   ```bash
   cd apps/api
   npx prisma migrate dev --name init
   npx prisma generate
   cd ../..
   npx prisma migrate reset --force
   ```


4. (Optional) Infrastruktur per Docker starten:
   ```bash
   docker compose up -d db redis mailhog
   ```

## Standardzugang & Benutzerverwaltung
- Self-Service-Registrierungen sind deaktiviert. Nutze den voreingestellten Admin-Account aus dem Seed:
  - E-Mail: `admin@arcto.app`
  - Passwort: `changeme123`
- Passe Zugangsdaten bei Bedarf in `apps/api/prisma/seed.ts` an oder aktualisiere sie nach dem Login auf der Mitarbeiter-Seite.
- Weitere Accounts legst du nach der Anmeldung ueber das Dashboard unter **Team -> Mitarbeiter** an.

## Lokale Entwicklung
- **Frontend:** `npm run web:dev` startet Next.js auf http://localhost:3000.
- **Backend:** `npm run api:dev` startet NestJS + Prisma auf http://localhost:4000 (Versioned API unter `/api/v1`).
- Beide Prozesse in getrennten Terminals ausführen; CORS ist auf die lokale Web-App konfiguriert.

## Häufige Befehle

| Kontext | Befehl | Beschreibung |
| --- | --- | --- |
| Root | `npm run web:dev` | Next.js Dev-Server mit Hot Reloading |
| Root | `npm run web:build` / `npm run web:start` | Produktion builden & lokal prüfen |
| Root | `npm run web:lint` | ESLint für das Frontend |
| Root | `npm run api:dev` | NestJS API inkl. Dateiwatcher |
| Root | `npm run api:build` / `npm run api:start` | API builden & im Produktionsmodus starten |
| Root | `npm run api:lint` | ESLint gegen `apps/api` |
| Root | `npm run api:test` | Jest-Tests (Unit) |
| Root | `npm run api:test:e2e` | End-to-End-Tests |
| API | `npx prisma migrate dev` / `npx prisma studio` | Prisma Migrationen anwenden bzw. Datenbank inspizieren |
| Docker | `docker compose up --build` | Kompletten Stack (db, redis, mailhog, api, web) starten |

> Tipp: Die Compose-Datei veröffentlicht MySQL auf Port 3306, Redis auf 6379 und Mailhog unter http://localhost:8025.

## Änderungen committen & zu GitHub pushen
Wenn du lokale Änderungen in den Remote-Branch (z. B. `main`) pushen möchtest, kannst du folgende Abfolge nutzen:

```bash
# 1. Status prüfen
git status

# 2. Änderungen zum Commit vormerken
git add .

# 3. Commit mit aussagekräftiger Nachricht erstellen
git commit -m "feat: beschreibe kurz die Änderung"

# 4. Änderungen auf GitHub pushen
git push origin main  # z. B. main oder feature/my-topic
```

Tipp: Wenn du mit Feature-Branches arbeitest, ersetze `<branch-name>` durch den Namen deines Branches. Falls ein Upstream noch nicht gesetzt wurde (neuer Branch), kannst du einmalig `git push -u origin <branch-name>` verwenden.

## Deployment-Hinweise
1. `npm run web:build` und `npm run api:build` erzeugen die Production-Bundles.
2. Stelle sicher, dass `DATABASE_URL`, JWT-Secrets und evtl. SMTP-/Stripe-Keys in deiner Zielumgebung gesetzt sind.
3. Für Container-Deployments kannst du die Builds aus `docker-compose.yml` übernehmen oder eigene Dockerfiles aus `apps/web` und `apps/api` nutzen.

## Weiterführende Dokumentation
- `docs/ARCHITECTURE.md` enthält ausführlichere Notizen zu Story, UI-Flows, Modulplan und TODOs.
- Prisma-Schema & Migrationen: `apps/api/prisma`.
- Konfig & Validierung: `apps/api/src/config`.

Damit hast du eine kompakte Referenz, wie das Programm gedacht ist und welche Befehle du für lokale Entwicklung, Tests und Deployments brauchst. Viel Spaß beim Ausbau von Arcto-CRM!
