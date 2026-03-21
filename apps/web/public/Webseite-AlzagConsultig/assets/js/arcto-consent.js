(function () {
  "use strict";

  var STORAGE_KEY = "arcto-cookie-consent-v1";
  var EVENT_NAME = "arcto:consent-updated";
  var VERSION = 1;
  var STYLE_ID = "arcto-cookie-style";

  var toastEl;
  var modalEl;
  var analyticsInput;
  var marketingInput;
  var footerLinksBound = false;

  function createConsent(analytics, marketing) {
    return {
      version: VERSION,
      necessary: true,
      analytics: Boolean(analytics),
      marketing: Boolean(marketing),
      updatedAt: new Date().toISOString(),
    };
  }

  function parseConsent(value) {
    if (!value || typeof value !== "object") return null;
    if (Number(value.version) !== VERSION) return null;
    if (value.necessary !== true) return null;
    if (typeof value.analytics !== "boolean") return null;
    if (typeof value.marketing !== "boolean") return null;
    if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return null;
    return {
      version: VERSION,
      necessary: true,
      analytics: value.analytics,
      marketing: value.marketing,
      updatedAt: value.updatedAt,
    };
  }

  function readConsent() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return parseConsent(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function saveConsent(consent) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
          detail: consent,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".arcto-cookie-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(980px,calc(100% - 32px));z-index:10000;padding:24px;border:1px solid rgba(var(--ogency-base-rgb),0.35);border-radius:14px;background:linear-gradient(155deg,rgba(16,18,22,0.98),rgba(7,8,10,0.97));box-shadow:0 30px 60px -38px rgba(0,0,0,.9);backdrop-filter:blur(12px);color:var(--ogency-white);font-family:var(--ogency-font,'Plus Jakarta Sans',sans-serif);overflow:hidden}" +
      ".arcto-cookie-toast::before{content:'';position:absolute;left:0;top:0;height:3px;width:100%;background:linear-gradient(90deg,var(--ogency-base),rgba(var(--ogency-base-rgb),0.02))}" +
      ".arcto-cookie-toast.is-hidden{display:none}" +
      ".arcto-cookie-title{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ogency-base)}" +
      ".arcto-cookie-copy{margin:0;font-size:15px;line-height:1.6;color:#d4d8de}" +
      ".arcto-cookie-link{display:inline-flex;margin-top:10px;font-size:12px;font-weight:600;color:var(--ogency-base);text-decoration:none}" +
      ".arcto-cookie-link:hover{color:var(--ogency-white)}" +
      ".arcto-cookie-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}" +
      ".arcto-cookie-btn{border:1px solid var(--ogency-black3);border-radius:8px;padding:11px 16px;font-size:12px;font-weight:700;letter-spacing:.08em;cursor:pointer;transition:.25s ease;color:var(--ogency-white);background:var(--ogency-black2);font-family:var(--ogency-font,'Plus Jakarta Sans',sans-serif)}" +
      ".arcto-cookie-btn:hover{border-color:var(--ogency-base);color:var(--ogency-base)}" +
      ".arcto-cookie-btn.primary{background:var(--ogency-base);border-color:var(--ogency-base);color:var(--ogency-black)}" +
      ".arcto-cookie-btn.primary:hover{background:var(--ogency-white);border-color:var(--ogency-white);color:var(--ogency-base)}" +
      ".arcto-cookie-btn.ghost{background:transparent}" +
      ".arcto-cookie-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:16px;z-index:10001;background:rgba(0,0,0,.7);backdrop-filter:blur(5px)}" +
      ".arcto-cookie-modal.is-open{display:flex}" +
      ".arcto-cookie-dialog{width:min(760px,100%);border:1px solid rgba(var(--ogency-base-rgb),0.35);border-radius:14px;background:linear-gradient(155deg,rgba(16,18,22,0.99),rgba(6,7,9,0.98));padding:28px;color:#d4d8de;box-shadow:0 38px 75px -45px rgba(0,0,0,.95);font-family:var(--ogency-font,'Plus Jakarta Sans',sans-serif)}" +
      ".arcto-cookie-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}" +
      ".arcto-cookie-head p{margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ogency-base);font-weight:700}" +
      ".arcto-cookie-head h3{margin:4px 0 0;font-size:44px;line-height:1.08;color:var(--ogency-white);font-weight:800}" +
      ".arcto-cookie-intro{margin:12px 0 0;font-size:15px;color:#d4d8de;line-height:1.6}" +
      ".arcto-cookie-tools{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}" +
      ".arcto-cookie-tools span{display:inline-flex;border:1px solid #2b2f36;border-radius:999px;background:#13161b;padding:6px 12px;font-size:11px;font-weight:600;color:var(--ogency-base)}" +
      ".arcto-cookie-close{border:1px solid var(--ogency-black3);border-radius:8px;background:transparent;color:#d0d0d2;width:40px;height:40px;cursor:pointer;font-size:22px;line-height:1}" +
      ".arcto-cookie-close:hover{border-color:var(--ogency-base);color:var(--ogency-base)}" +
      ".arcto-cookie-group{margin-top:20px;display:flex;flex-direction:column;gap:12px}" +
      ".arcto-cookie-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border:1px solid #262a30;border-radius:10px;padding:18px;background:#111318}" +
      ".arcto-cookie-row strong{display:block;font-size:18px;color:var(--ogency-white);font-weight:700}" +
      ".arcto-cookie-row span{display:block;margin-top:6px;font-size:14px;line-height:1.6;color:#c8ccd2}" +
      ".arcto-cookie-row em{display:block;margin-top:10px;font-size:12px;font-style:normal;font-weight:600;color:var(--ogency-base)}" +
      ".arcto-cookie-row input[type=checkbox]{width:22px;height:22px;accent-color:var(--ogency-base);margin-top:2px;flex-shrink:0}" +
      ".arcto-cookie-row input[type=checkbox]:disabled{opacity:.75;cursor:not-allowed}" +
      ".arcto-cookie-foot{margin-top:20px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}" +
      "@media (min-width:768px){.arcto-cookie-toast{width:min(980px,calc(100% - 48px))}}" +
      "@media (max-width:767px){.arcto-cookie-dialog{padding:20px;border-radius:12px}.arcto-cookie-head h3{font-size:34px;line-height:1.12}.arcto-cookie-foot{justify-content:stretch}.arcto-cookie-foot .arcto-cookie-btn{width:100%}}";

    document.head.appendChild(style);
  }

  function openSettings() {
    if (!modalEl) return;
    modalEl.classList.add("is-open");
    modalEl.setAttribute("aria-hidden", "false");
  }

  function closeSettings() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    modalEl.setAttribute("aria-hidden", "true");
  }

  function refreshUI() {
    var consent = readConsent();
    var decided = Boolean(consent);

    if (toastEl) {
      toastEl.classList.toggle("is-hidden", decided);
    }

    var activeConsent = consent || createConsent(false, false);
    if (analyticsInput) analyticsInput.checked = activeConsent.analytics;
    if (marketingInput) marketingInput.checked = activeConsent.marketing;
  }

  function applyConsent(analytics, marketing) {
    saveConsent(createConsent(analytics, marketing));
    refreshUI();
    closeSettings();
  }

  function buildUI() {
    toastEl = document.createElement("section");
    toastEl.className = "arcto-cookie-toast";
    toastEl.innerHTML =
      '<p class="arcto-cookie-title">Cookie-Einstellungen</p>' +
      '<p class="arcto-cookie-copy">Wir nutzen standardmaessig nur notwendige Cookies. Analyse und Marketing werden erst nach deiner Einwilligung aktiviert.</p>' +
      '<a class="arcto-cookie-link" href="datenschutz.html">Datenschutzerklaerung</a>' +
      '<div class="arcto-cookie-actions">' +
      '<button type="button" class="arcto-cookie-btn ghost" data-action="necessary">Nur notwendige</button>' +
      '<button type="button" class="arcto-cookie-btn primary" data-action="all">Alle akzeptieren</button>' +
      '<button type="button" class="arcto-cookie-btn" data-action="settings">Einstellungen</button>' +
      "</div>";

    modalEl = document.createElement("div");
    modalEl.className = "arcto-cookie-modal";
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.innerHTML =
      '<div class="arcto-cookie-dialog" role="dialog" aria-modal="true" aria-label="Cookie Einstellungen">' +
      '<div class="arcto-cookie-head">' +
      "<div>" +
      "<p>Cookie-Einstellungen</p>" +
      "<h3>Privatsphaere verwalten</h3>" +
      '<p class="arcto-cookie-intro">Du kannst die Einwilligung jederzeit aendern. Notwendige Cookies bleiben aktiv, damit die Seite funktioniert.</p>' +
      '<div class="arcto-cookie-tools"><span>Arcto CRM Tracking</span><span>Facebook Pixel</span></div>' +
      "</div>" +
      '<button type="button" class="arcto-cookie-close" data-action="close" aria-label="Schliessen">&times;</button>' +
      "</div>" +
      '<div class="arcto-cookie-group">' +
      '<label class="arcto-cookie-row"><div><strong>Notwendige Cookies</strong><span>Basisfunktionen wie Sicherheit und Seitennavigation.</span><em>System: Consent-Speicherung und technische Basisfunktionen</em></div><input type="checkbox" checked disabled /></label>' +
      '<label class="arcto-cookie-row"><div><strong>Analyse</strong><span>Hilft uns, Seitenaufrufe, Klickpfade und Verweildauer auszuwerten.</span><em>Tool: Arcto CRM Tracking (eigenes Tracking-Tool)</em></div><input id="arcto-cookie-analytics" type="checkbox" /></label>' +
      '<label class="arcto-cookie-row"><div><strong>Marketing</strong><span>Erlaubt Kampagnenmessung, Conversion-Tracking und Retargeting.</span><em>Tool: Facebook Pixel</em></div><input id="arcto-cookie-marketing" type="checkbox" /></label>' +
      "</div>" +
      '<div class="arcto-cookie-foot">' +
      '<button type="button" class="arcto-cookie-btn ghost" data-action="necessary">Nur notwendige</button>' +
      '<button type="button" class="arcto-cookie-btn" data-action="save">Auswahl speichern</button>' +
      '<button type="button" class="arcto-cookie-btn primary" data-action="all">Alle akzeptieren</button>' +
      "</div>" +
      "</div>";

    document.body.appendChild(toastEl);
    document.body.appendChild(modalEl);

    analyticsInput = modalEl.querySelector("#arcto-cookie-analytics");
    marketingInput = modalEl.querySelector("#arcto-cookie-marketing");

    toastEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) return;
      var action = target.getAttribute("data-action");
      if (action === "necessary") {
        applyConsent(false, false);
      } else if (action === "all") {
        applyConsent(true, true);
      } else if (action === "settings") {
        openSettings();
      }
    });

    modalEl.addEventListener("click", function (event) {
      var target = event.target;
      if (target === modalEl) {
        closeSettings();
        return;
      }
      if (!target || !target.getAttribute) return;
      var action = target.getAttribute("data-action");
      if (action === "close") {
        closeSettings();
      } else if (action === "necessary") {
        applyConsent(false, false);
      } else if (action === "all") {
        applyConsent(true, true);
      } else if (action === "save") {
        applyConsent(Boolean(analyticsInput && analyticsInput.checked), Boolean(marketingInput && marketingInput.checked));
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeSettings();
      }
    });
  }

  function bindFooterCookieLinks() {
    if (footerLinksBound) return;
    var links = document.querySelectorAll("[data-cookie-settings='open']");
    if (!links.length) return;

    links.forEach(function (linkEl) {
      linkEl.addEventListener("click", function (event) {
        event.preventDefault();
        openSettings();
      });
    });
    footerLinksBound = true;
  }

  function init() {
    ensureStyles();
    buildUI();
    bindFooterCookieLinks();
    refreshUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
