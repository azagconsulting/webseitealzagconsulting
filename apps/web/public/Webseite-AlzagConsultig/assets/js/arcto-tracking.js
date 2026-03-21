(function () {
  "use strict";

  var TRACKING_ENDPOINT = "/api/v1/public/tracking/events";
  var SESSION_KEY = "arcto-tracking-session";
  var CONSENT_KEY = "arcto-cookie-consent-v1";
  var CONSENT_EVENT_NAME = "arcto:consent-updated";
  var CONSENT_VERSION = 1;

  var MIN_DURATION_MS = 150;
  var MAX_DURATION_MS = 4 * 60 * 60 * 1000;
  var CLICK_DEBOUNCE_MS = 200;

  var state = {
    active: false,
    startedAt: 0,
    sessionId: null,
    lastClickAt: 0,
    exitSent: false,
    clickHandler: null,
    visibilityHandler: null,
    pageHideHandler: null,
  };

  function parseConsent(value) {
    if (!value || typeof value !== "object") return null;
    if (Number(value.version) !== CONSENT_VERSION) return null;
    if (value.necessary !== true) return null;
    if (typeof value.analytics !== "boolean") return null;
    if (typeof value.marketing !== "boolean") return null;
    if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return null;
    return value;
  }

  function readConsent() {
    try {
      var raw = window.localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      return parseConsent(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function hasAnalyticsConsent() {
    var consent = readConsent();
    return Boolean(consent && consent.analytics);
  }

  function createSessionId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "sess_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }

  function ensureSessionId() {
    if (state.sessionId) return state.sessionId;
    try {
      var stored = window.localStorage.getItem(SESSION_KEY);
      if (stored && stored.trim()) {
        state.sessionId = stored;
        return stored;
      }
      var fresh = createSessionId();
      window.localStorage.setItem(SESSION_KEY, fresh);
      state.sessionId = fresh;
      return fresh;
    } catch {
      var fallback = createSessionId();
      state.sessionId = fallback;
      return fallback;
    }
  }

  function currentPath() {
    return window.location.pathname || "/";
  }

  function truncate(value, maxLength) {
    if (!value) return undefined;
    var normalized = String(value).trim();
    if (!normalized) return undefined;
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
  }

  function sendEvent(payload, keepalive) {
    var body = JSON.stringify(payload);

    if (keepalive && navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(TRACKING_ENDPOINT, blob);
        return;
      } catch {
        // Fallback to fetch below.
      }
    }

    fetch(TRACKING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      keepalive: Boolean(keepalive),
      body: body,
    }).catch(function () {
      // Tracking is best-effort.
    });
  }

  function sendPageView() {
    var params = new URLSearchParams(window.location.search || "");

    sendEvent({
      sessionId: ensureSessionId(),
      type: "PAGE_VIEW",
      path: currentPath(),
      referrer: truncate(document.referrer, 512),
      utmSource: truncate(params.get("utm_source"), 120),
      utmMedium: truncate(params.get("utm_medium"), 120),
    });
  }

  function flushExit() {
    if (!state.active || state.exitSent) return;

    var duration = Date.now() - state.startedAt;
    if (duration < MIN_DURATION_MS) return;

    state.exitSent = true;

    sendEvent(
      {
        sessionId: ensureSessionId(),
        type: "PAGE_EXIT",
        path: currentPath(),
        durationMs: Math.min(Math.max(Math.floor(duration), 0), MAX_DURATION_MS),
      },
      true,
    );
  }

  function handleClick(event) {
    if (!state.active) return;

    var now = Date.now();
    if (now - state.lastClickAt < CLICK_DEBOUNCE_MS) return;

    var target = event.target;
    if (!target || typeof target.closest !== "function") return;

    var clickable = target.closest("button, a, [data-track]");
    if (!clickable) return;

    var label =
      clickable.getAttribute("data-track-label") ||
      clickable.getAttribute("aria-label") ||
      clickable.textContent ||
      "";

    state.lastClickAt = now;

    sendEvent({
      sessionId: ensureSessionId(),
      type: "CLICK",
      path: currentPath(),
      label: truncate(label, 120),
    });
  }

  function attachTrackingListeners() {
    if (state.clickHandler) return;

    state.clickHandler = handleClick;
    state.visibilityHandler = function () {
      if (document.visibilityState === "hidden") {
        flushExit();
      }
    };
    state.pageHideHandler = function () {
      flushExit();
    };

    document.addEventListener("click", state.clickHandler);
    document.addEventListener("visibilitychange", state.visibilityHandler);
    window.addEventListener("pagehide", state.pageHideHandler);
  }

  function detachTrackingListeners() {
    if (state.clickHandler) {
      document.removeEventListener("click", state.clickHandler);
    }
    if (state.visibilityHandler) {
      document.removeEventListener("visibilitychange", state.visibilityHandler);
    }
    if (state.pageHideHandler) {
      window.removeEventListener("pagehide", state.pageHideHandler);
    }

    state.clickHandler = null;
    state.visibilityHandler = null;
    state.pageHideHandler = null;
  }

  function startTracking() {
    if (state.active) return;
    if (!hasAnalyticsConsent()) return;

    state.active = true;
    state.startedAt = Date.now();
    state.exitSent = false;
    state.lastClickAt = 0;

    attachTrackingListeners();
    sendPageView();
  }

  function stopTracking() {
    if (!state.active) return;
    state.active = false;
    state.startedAt = 0;
    state.exitSent = false;
    state.lastClickAt = 0;
    detachTrackingListeners();
  }

  function syncTrackingFromConsent() {
    if (hasAnalyticsConsent()) {
      startTracking();
      return;
    }
    stopTracking();
  }

  function init() {
    syncTrackingFromConsent();

    window.addEventListener(CONSENT_EVENT_NAME, syncTrackingFromConsent);
    window.addEventListener("storage", function (event) {
      if (!event || !event.key || event.key === CONSENT_KEY) {
        syncTrackingFromConsent();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
