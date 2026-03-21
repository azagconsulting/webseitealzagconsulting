/**
 * Generates static HTML pages for each published Arcto blog post.
 *
 * Usage:
 *   node tools/generate-static-blog.js
 *
 * Environment (optional):
 *   STATIC_BLOG_API_BASE  Preferred API base (e.g. https://api.autohausherrmann.com)
 *   NEXT_PUBLIC_API_URL   Fallback API base
 *   API_INTERNAL_URL      Fallback API base
 *   NEXT_PUBLIC_API_PROXY Fallback API base
 *   API_PROXY_TARGET      Fallback API base
 *
 * The script writes files to:
 *   public/Webseite Autohaus Herrmann/pages/blog/{slug}.html
 */

/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(process.cwd(), "public", "Webseite Autohaus Herrmann");
const pagesDir = path.join(rootDir, "pages");
const blogDir = path.join(pagesDir, "blog");

const normalizeBase = (value) => {
  if (!value) return "";
  return String(value).trim().replace(/\/$/, "");
};

const apiBases = [
  process.env.STATIC_BLOG_API_BASE,
  process.env.NEXT_PUBLIC_API_URL,
  process.env.API_INTERNAL_URL,
  process.env.NEXT_PUBLIC_API_PROXY,
  process.env.API_PROXY_TARGET,
  "http://127.0.0.1:4000",
  "http://localhost:4000",
]
  .map(normalizeBase)
  .filter(Boolean);

const buildApiTargets = (pathOrRoute) =>
  apiBases
    .map((base) => {
      const safePath = pathOrRoute.startsWith("/") ? pathOrRoute : `/${pathOrRoute}`;
      if (base.endsWith("/api/v1")) return `${base}${safePath}`;
      return `${base}/api/v1${safePath}`;
    })
    .filter((url, idx, arr) => url && arr.indexOf(url) === idx);

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const raw = await response.text();
  if (!response.ok) {
    let msg = raw || response.statusText || `HTTP ${response.status}`;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      msg = parsed?.message || parsed?.error || msg;
    } catch {
      // ignore parse errors
    }
    throw new Error(msg);
  }
  return raw ? JSON.parse(raw) : null;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const renderInline = (text) => {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return escaped;
};

const renderMarkdown = (markdown) => {
  if (!markdown) return "";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let inList = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (inList && list.length) {
      const items = list.map((item) => `<li>${renderInline(item)}</li>`).join("");
      blocks.push(`<ul>${items}</ul>`);
      list = [];
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push(`<${tag}>${renderInline(headingMatch[2])}</${tag}>`);
      continue;
    }

    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      const alt = escapeHtml(imageMatch[1] || "Blog Bild");
      const src = escapeHtml(imageMatch[2]);
      blocks.push(`<img src="${src}" alt="${alt}" class="blog-image">`);
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      const quote = line.replace(/^>\s?/, "");
      blocks.push(`<blockquote class="blog-quote">${renderInline(quote)}</blockquote>`);
      continue;
    }

    const listMatch = line.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      inList = true;
      list.push(listMatch[1]);
      continue;
    }

    if (inList) {
      flushList();
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.join("\n");
};

const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(value));
  } catch {
    return "—";
  }
};

const buildMetaDescription = (post) => {
  if (post?.excerpt) return String(post.excerpt).trim();
  if (post?.content) {
    const plain = post.content.replace(/\s+/g, " ").trim();
    return plain.slice(0, 155) + (plain.length > 155 ? "…" : "");
  }
  return "Blogbeitrag vom Autohaus Herrmann in Hirschberg – Werkstattwissen, Tipps und Neuigkeiten.";
};

const renderPostHtml = (post) => {
  const title = escapeHtml(post.title || "Blogbeitrag");
  const description = escapeHtml(buildMetaDescription(post));
  const cover = post.coverImage ? escapeHtml(post.coverImage) : null;
  const published = formatDate(post.publishedAt);
  const author =
    post?.author?.firstName || post?.author?.lastName
      ? escapeHtml(`${post.author.firstName ?? ""} ${post.author.lastName ?? ""}`.trim())
      : "Autohaus Herrmann";
  const canonical = `https://www.autohausherrmann.com/blog/${post.slug}`;

  const contentHtml = renderMarkdown(post.content ?? "");

  const sharedHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Autohaus Herrmann Hirschberg</title>
    <meta name="description" content="${description}">
    <meta name="author" content="Autohaus Herrmann, Inh: Ralf Dellbrügge">
    <link rel="canonical" href="${canonical}">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="${title} | Autohaus Herrmann">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:site_name" content="Autohaus Herrmann">
    <meta property="og:type" content="article">
    ${cover ? `<meta property="og:image" content="${cover}">` : ""}
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title} | Autohaus Herrmann">
    <meta name="twitter:description" content="${description}">
    ${cover ? `<meta name="twitter:image" content="${cover}">` : ""}
    <link rel="icon" type="image/png" sizes="32x32" href="../../assets/images/favicon.png">
    <link rel="icon" type="image/png" sizes="16x16" href="../../assets/images/favicon.png">
    <meta name="msapplication-TileColor" content="#da532c">
    <meta name="theme-color" content="#2b2b2b">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link href="../../assets/css/font-awesome-all.css" rel="stylesheet">
    <link href="../../assets/css/flaticon.css" rel="stylesheet">
    <link rel="stylesheet" href="../../assets/css/style.css">
    <link rel="stylesheet" href="../../assets/css/slick.css">
    <link rel="stylesheet" href="../../assets/css/slick-theme.css">
  `;

  return `<!DOCTYPE html>
<html lang="de">
<head>${sharedHead}
</head>
<body>
    <div id="preloader"><div class="spinner"></div></div>
    <header class="main-header">
        <nav class="main-nav" aria-label="Hauptnavigation">
            <div class="logo">
                <a href="/" aria-label="Zur Startseite des Autohaus Herrmann">
                    <img src="../../assets/images/logo/logo.png" alt="Autohaus Herrmann Logo">
                </a>
            </div>
            <ul class="desktop-nav">
                <li><a href="/">Startseite</a></li>
                <li><a href="/pages/service">Service</a></li>
                <li><a href="/pages/ueber-uns">Über uns</a></li>
                <li><a href="/pages/kontakt">Kontakt</a></li>
            </ul>
            <div class="hamburger-menu" role="button" aria-label="Menü öffnen" aria-expanded="false" tabindex="0">
                <div class="bar"></div><div class="bar"></div><div class="bar"></div>
            </div>
        </nav>
    </header>

    <div class="mobile-menu-overlay" aria-hidden="true">
        <div class="mobile-menu-content">
            <div class="close-btn" role="button" aria-label="Menü schließen" tabindex="0">×</div>
            <ul>
                <li><a href="/">Startseite</a></li>
                <li><a href="/pages/service" aria-current="page">Service</a></li>
                <li><a href="/pages/ueber-uns">Über uns</a></li>
                <li><a href="/pages/kontakt">Kontakt</a></li>
            </ul>
            <div class="mobile-menu-contact">
                <h3>Autohaus Herrmann</h3>
                <address>
                    <p>Carl-Benz-Straße 6</p>
                    <p>69493 Hirschberg an der Bergstraße</p>
                </address>
                <p>Telefon: <a href="tel:+4962014886550">06201 4886550</a></p>
                <p>E-Mail: <a href="mailto:kontakt@autohausherrmann.com">kontakt@autohausherrmann.com</a></p>
            </div>
        </div>
    </div>

    <main class="main-wrapper">
        <section class="blog-hero-section">
            <div class="container">
                <p class="author-info">
                    <span><i class="far fa-calendar"></i> ${published}</span>
                    <span><i class="far fa-user"></i> ${author}</span>
                </p>
                <h1>${title}</h1>
                ${post.excerpt ? `<p class="subtitle">${escapeHtml(post.excerpt)}</p>` : ""}
            </div>
        </section>

        <section class="blog-content-section">
            <div class="container">
                <article class="blog-article">
                    ${cover ? `<div class="blog-cover-image"><img src="${cover}" alt="${title}"></div>` : ""}
                    ${contentHtml}
                </article>
            </div>
        </section>
    </main>

    <footer class="anim-fade-in anim-fade-in-bottom">
        <div class="footer-content container">
            <div class="footer-column footer-contact anim-fade-in anim-fade-in-left anim-delay-1">
                <h3>Kontaktieren Sie uns</h3>
                <ul>
                    <li><i class="fas fa-map-marker-alt"></i> <span>Carl-Benz-Straße 6<br>69493 Hirschberg an der Bergstraße</span></li>
                    <li><i class="fas fa-phone"></i> <a href="tel:+4962014886550">+49 6201 4886550</a></li>
                    <li><i class="fas fa-envelope"></i> <a href="mailto:kontakt@autohausherrmann.com">kontakt@autohausherrmann.com</a></li>
                </ul>
            </div>
            <div class="footer-column footer-social-centered anim-fade-in anim-fade-in-bottom anim-delay-2">
                <h3>Folgen Sie uns</h3>
                <div class="social-icons">
                    <a href="https://www.instagram.com/herrmannautohaus" target="_blank" rel="noopener noreferrer" aria-label="Autohaus Herrmann auf Instagram besuchen"><i class="fab fa-instagram"></i></a>
                    <a href="https://www.google.com/search?q=Autohaus+Herrmann+Hirschberg" target="_blank" aria-label="Autohaus Herrmann auf Google finden oder bewerten"><i class="fab fa-google"></i></a>
                </div>
            </div>
            <div class="footer-column footer-legal anim-fade-in anim-fade-in-right anim-delay-3">
                <h3>Rechtliches</h3>
                <ul class="legal-links">
                    <li><a href="/pages/impressum">Impressum</a></li>
                    <li><a href="/pages/datenschutz">Datenschutz</a></li>
                    <li><a onclick="openCookieSettings()">Cookies bearbeiten</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom anim-fade-in anim-fade-in-bottom anim-delay-4">
            <p>&copy; <span id="current-year"></span> Autohaus Herrmann. Alle Rechte vorbehalten.</p>
        </div>
    </footer>

    <a href="#" id="backToTopBtn" class="back-to-top"><i class="fas fa-arrow-up"></i></a>
    <div id="initial-cookie-toast" class="initial-cookie-toast">
        <p>Wir verwenden Cookies, um Inhalte und Anzeigen zu personalisieren, Funktionen für soziale Medien anbieten zu können und die Zugriffe auf unsere Website zu analysieren. Außerdem geben wir Informationen zu Ihrer Verwendung unserer Website an unsere Partner für soziale Medien, Werbung und Analysen weiter. Unsere Partner führen diese Informationen möglicherweise mit weiteren Daten zusammen, die Sie ihnen bereitgestellt haben oder die sie im Rahmen Ihrer Nutzung der Dienste gesammelt haben.</p>
        <div class="toast-buttons">
            <button class="accept-all-toast-btn">Alle akzeptieren</button>
            <button class="decline-all-toast-btn">Alle ablehnen</button>
            <button class="open-settings-toast-btn">Cookie-Einstellungen</button>
        </div>
    </div>
    <div id="cookie-details-popup" class="cookie-details-popup">
        <div class="popup-content">
            <span class="close-btn2">&times;</span>
            <h2>Cookie-Einstellungen</h2>
            <p>Diese Webseite verwendet Cookies, um Inhalte und Anzeigen zu personalisieren, Funktionen für soziale Medien anbieten zu können und die Zugriffe auf unsere Webseite zu analysieren. Außerdem geben wir Informationen zu Ihrer Verwendung unserer Webseite an unsere Partner für soziale Medien, Werbung und Analysen weiter. Unsere Partner führen diese Informationen möglicherweise mit weiteren Daten zusammen, die Sie ihnen bereitgestellt haben oder die sie im Rahmen Ihrer Nutzung der Dienste gesammelt haben.</p>
            <div class="toggle-group">
                <div class="toggle-item">
                    <label for="necessaryToggle">Notwendig</label>
                    <input type="checkbox" id="necessaryToggle" checked disabled>
                    <div class="description">Diese Cookies sind für die grundlegenden Funktionen der Website notwendig und können nicht deaktiviert werden.</div>
                </div>
                <div class="toggle-item">
                    <label for="preferencesToggle">Präferenzen</label>
                    <input type="checkbox" id="preferencesToggle">
                    <div class="description">Diese Cookies ermöglichen erweiterte Funktionen und Personalisierung, wie das Speichern Ihrer Spracheinstellungen.</div>
                </div>
                <div class="toggle-item">
                    <label for="analyticsToggle">Statistiken</label>
                    <input type="checkbox" id="analyticsToggle" checked>
                    <div class="description">Diese Website verwendet Google Analytics, um das Nutzererlebnis zu verbessern. Dabei können Daten in die USA übermittelt werden, die nicht den gleichen Datenschutzstandard wie in der EU bieten. Mit Ihrer Zustimmung erklären Sie sich mit der Verwendung von Google Analytics und der Übertragung Ihrer Daten in die USA einverstanden. Mehr dazu in unserer <br><a href="/pages/datenschutz">Datenschutzerklärung.</a></div>
                </div>
                <div class="toggle-item">
                    <label for="marketingToggle">Marketing</label>
                    <input type="checkbox" id="marketingToggle" checked>
                    <div class="description">Unsere Website nutzt die Funktionen von Google Ads Remarketing.<br>Google Remarketing ist eine Funktion von Google Ads, die es uns ermöglicht, Website-Besucher, die sich bereits für unsere Produkte oder Dienstleistungen interessiert haben, erneut anzusprechen, indem ihnen personalisierte Anzeigen auf anderen Websites im Google Display-Netzwerk oder bei der Google-Suche angezeigt werden.<br><a href="/pages/datenschutz">Datenschutzerklärung.</a></div>
                </div>
            </div>
            <div class="popup-actions">
                <button class="save-btn">Auswahl speichern</button>
                <button class="decline-all-popup-btn">Alle ablehnen</button>
                <button class="accept-all-popup-btn">Alle zulassen</button>
            </div>
        </div>
    </div>

    <script src="../../assets/js/cookie-consent.js"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="../../assets/js/slick.min.js"></script>
    <script src="../../assets/js/la-preloader.js"></script>
    <script src="../../assets/js/anim-fade-in.js"></script>
    <script src="../../assets/js/la-function.js"></script>
    <script src="../../assets/js/backtoptop.js"></script>
    <script src="../../assets/js/arcto-tracking.js" defer></script>
    <script src="../../assets/js/arcto-overlay.js"></script>
    <script>
      document.getElementById('current-year').textContent = new Date().getFullYear();
    </script>
</body>
</html>`;
};

async function generate() {
  if (!apiBases.length) {
    console.error("Keine API-Basis konfiguriert. Setze STATIC_BLOG_API_BASE oder NEXT_PUBLIC_API_URL.");
    process.exit(1);
  }

  fs.mkdirSync(blogDir, { recursive: true });

  const targets = buildApiTargets("/public/blog?limit=50");
  let posts = null;
  let lastError = "";

  for (const url of targets) {
    try {
      console.log(`→ Hole Blogdaten von ${url}`);
      const response = await fetchJson(url);
      posts = response?.items ?? [];
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️  ${lastError}`);
    }
  }

  if (!posts) {
    console.error("Keine Blogdaten abrufbar. Bitte API-URL prüfen.");
    process.exit(1);
  }

  let written = 0;
  for (const post of posts) {
    if (!post?.slug || !post?.title) continue;
    const slug = String(post.slug).trim();
    const filename = path.join(blogDir, `${slug}.html`);
    const html = renderPostHtml(post);
    fs.writeFileSync(filename, html, "utf8");
    written += 1;
    console.log(`✓ ${slug}.html`);
  }

  console.log(`Fertig. ${written} Dateien unter ${path.relative(process.cwd(), blogDir)} erstellt.`);
}

generate().catch((err) => {
  console.error("Fehler beim Generieren:", err);
  process.exit(1);
});
