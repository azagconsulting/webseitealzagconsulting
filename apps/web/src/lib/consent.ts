export const CONSENT_STORAGE_KEY = "arcto-cookie-consent-v1";
export const CONSENT_EVENT_NAME = "arcto:consent-updated";
export const CONSENT_VERSION = 1;

export type CookieConsentPreferences = {
  version: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

let cachedConsentRaw: string | null | undefined;
let cachedConsentSnapshot: CookieConsentPreferences | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createConsent(values?: {
  analytics?: boolean;
  marketing?: boolean;
  updatedAt?: string;
}): CookieConsentPreferences {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: Boolean(values?.analytics),
    marketing: Boolean(values?.marketing),
    updatedAt: values?.updatedAt ?? new Date().toISOString(),
  };
}

export function normalizeConsent(value: unknown): CookieConsentPreferences | null {
  if (!isRecord(value)) return null;
  if (Number(value.version) !== CONSENT_VERSION) return null;
  if (value.necessary !== true) return null;
  if (typeof value.analytics !== "boolean") return null;
  if (typeof value.marketing !== "boolean") return null;
  if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return null;

  return createConsent({
    analytics: value.analytics,
    marketing: value.marketing,
    updatedAt: value.updatedAt,
  });
}

export function readConsent() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === cachedConsentRaw) {
      return cachedConsentSnapshot;
    }
    if (!raw) {
      cachedConsentRaw = null;
      cachedConsentSnapshot = null;
      return null;
    }

    let normalized: CookieConsentPreferences | null = null;
    try {
      normalized = normalizeConsent(JSON.parse(raw));
    } catch {
      normalized = null;
    }
    cachedConsentRaw = raw;
    cachedConsentSnapshot = normalized;
    return normalized;
  } catch {
    cachedConsentRaw = undefined;
    cachedConsentSnapshot = null;
    return null;
  }
}

export function writeConsent(consent: CookieConsentPreferences) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(consent);
    cachedConsentRaw = raw;
    cachedConsentSnapshot = consent;
    window.localStorage.setItem(CONSENT_STORAGE_KEY, raw);
    window.dispatchEvent(
      new CustomEvent<CookieConsentPreferences>(CONSENT_EVENT_NAME, {
        detail: consent,
      }),
    );
  } catch {
    // Ignore storage issues (private mode, blocked storage, etc.).
  }
}

export function hasAnalyticsConsent(consent?: CookieConsentPreferences | null) {
  const effective = consent ?? readConsent();
  return Boolean(effective?.analytics);
}

export function isMarketingPath(pathname: string) {
  const normalized = pathname || "/";
  if (normalized === "/" || normalized === "/index.html") return true;
  if (normalized.startsWith("/blog")) return true;
  if (normalized.startsWith("/Webseite-AlzagConsultig")) return true;
  return false;
}
