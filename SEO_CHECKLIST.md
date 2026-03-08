# SEO-Checkliste Alzag Consulting (Stand: 2026-03-03)

## Umgesetzt (Dateiebene)
- Alle HTML-Seiten auf `lang="de"` vereinheitlicht.
- Pro Seite: eindeutiger `title` (55-60 Zeichen), eindeutige `meta description` (140-160 Zeichen).
- Pro Seite ergänzt: `canonical`, `robots`, OpenGraph (`og:*`) und Twitter Cards.
- Semantik verbessert: `main`-Landmark pro Seite, Skip-Link (`Zum Hauptinhalt springen`) auf allen Seiten.
- Heading-Struktur korrigiert: genau 1 `h1` pro Seite.
- Interne Verlinkung bereinigt: keine defekten internen `.html`-Links mehr.
- Bildoptimierung-Basis:
  - `loading`/`decoding` ergänzt,
  - `width`/`height` für lokale Bilder ergänzt, wo verfügbar.
- Externe Skripte mit `defer` versehen (nicht-blockierender Parse).
- Accessibility-Basis:
  - globale sichtbare Focus-States,
  - Skip-Link,
  - `prefers-reduced-motion`-Fallback ergänzt.
- Startseite inhaltlich auf Handwerks-Intent/Rhein-Neckar ausgerichtet.
- Kontaktseite auf lokales NAP aktualisiert (Alzag Consulting, Boveriestraße 25, 68526 Ladenburg).
- JSON-LD ergänzt:
  - `index.html`: `Organization`, `ProfessionalService`, `WebSite`
  - `contact.html`: `ProfessionalService`
- Technische SEO-Dateien erstellt:
  - `robots.txt`
  - `sitemap.xml`
- Fehlende Datenschutzseite ergänzt: `datenschutz.html` (auf `noindex,follow`).

## Inhaltlich fokussierte Seiten
- `index.html`
- `services.html`
- `contact.html`
- `website-development.html`
- `web-application.html`
- `digital-marketing.html`
- `graphic-designing.html`

## Serverseitig noch zu erledigen
1. Domain-Konsistenz per Redirect erzwingen: `http -> https`, `non-www <-> www` (eine kanonische Variante wählen).
2. XML-Sitemap in Google Search Console und Bing Webmaster Tools einreichen.
3. GA4 + Consent Mode korrekt einbinden (inkl. DSGVO-konformer Consent-Banner).
4. Server-Kompression/Caching aktivieren (`gzip`/`brotli`, `Cache-Control` für statische Assets).
5. Optional: AVIF/WebP-Varianten serverseitig ausliefern (Content Negotiation/CDN).
6. Rechtstexte juristisch final prüfen (Datenschutz/Impressum).

## Kurztest-Ergebnis
- Titel/Description-Längen: im Zielbereich.
- `h1`: exakt einmal pro Seite.
- Broken Links (`.html` intern): keine gefunden.
- `sitemap.xml`: XML-valid.
