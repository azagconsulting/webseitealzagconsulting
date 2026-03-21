"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { apiRequest } from "@/lib/api";
import { CONSENT_EVENT_NAME, hasAnalyticsConsent, isMarketingPath, readConsent } from "@/lib/consent";

type TrackingEventType = "PAGE_VIEW" | "PAGE_EXIT" | "CLICK";

interface TrackingPayload {
  sessionId: string;
  type: TrackingEventType;
  path: string;
  label?: string;
  durationMs?: number;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
}

const SESSION_KEY = "arcto-tracking-session";

function getStoredSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  return raw && raw.trim() ? raw : null;
}

function persistSession(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, id);
}

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess_${Math.random().toString(36).slice(2, 11)}`;
}

function formatDurationMs(startedAt?: number | null) {
  if (!startedAt) return null;
  const diff = Date.now() - startedAt;
  if (diff < 150) return null;
  return diff;
}

export function TrackingProvider() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const searchSignature = useMemo(() => searchParams?.toString() ?? "", [searchParams]);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const pageStartRef = useRef<number | null>(null);
  const lastClickRef = useRef<number>(0);
  const initialReferrerRef = useRef<string | null>(null);
  const referrerSentRef = useRef<boolean>(false);

  const trackingActiveRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      initialReferrerRef.current = document.referrer || null;
    }
  }, []);

  useEffect(() => {
    const syncConsent = () => {
      setAnalyticsAllowed(hasAnalyticsConsent(readConsent()));
    };

    syncConsent();
    window.addEventListener(CONSENT_EVENT_NAME, syncConsent as EventListener);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(CONSENT_EVENT_NAME, syncConsent as EventListener);
      window.removeEventListener("storage", syncConsent);
    };
  }, []);

  const ensureSession = useCallback(() => {
    if (sessionRef.current) return sessionRef.current;
    const existing = getStoredSession();
    if (existing) {
      sessionRef.current = existing;
      return existing;
    }
    const fresh = createSessionId();
    persistSession(fresh);
    sessionRef.current = fresh;
    return fresh;
  }, []);

  const sendEvent = useCallback(async (payload: TrackingPayload, keepalive = false) => {
    try {
      await apiRequest("/public/tracking/events", {
        method: "POST",
        body: JSON.stringify(payload),
        keepalive,
      });
    } catch {
      // Tracking is best-effort – ignore network errors.
    }
  }, []);

  const flushDuration = useCallback(
    (reason: "navigation" | "unload") => {
      if (!trackingActiveRef.current) {
        return;
      }
      const path = currentPathRef.current;
      const startedAt = pageStartRef.current;
      const durationMs = formatDurationMs(startedAt);
      if (!path || durationMs === null) {
        return;
      }
      const sessionId = ensureSession();
      void sendEvent(
        {
          type: "PAGE_EXIT",
          path,
          durationMs,
          sessionId,
        },
        reason === "unload",
      );
      pageStartRef.current = Date.now();
    },
    [ensureSession, sendEvent],
  );

  useEffect(() => {
    if (!analyticsAllowed) {
      trackingActiveRef.current = false;
      currentPathRef.current = null;
      pageStartRef.current = null;
      return;
    }

    flushDuration("navigation");
    const marketingPage = isMarketingPath(pathname);
    trackingActiveRef.current = marketingPage;
    if (!marketingPage) {
      currentPathRef.current = null;
      pageStartRef.current = null;
      return;
    }

    const sessionId = ensureSession();
    const now = Date.now();
    currentPathRef.current = pathname;
    pageStartRef.current = now;

    const utmSource = searchParams?.get("utm_source") ?? undefined;
    const utmMedium = searchParams?.get("utm_medium") ?? undefined;

    void sendEvent({
      type: "PAGE_VIEW",
      path: pathname,
      sessionId,
      referrer: referrerSentRef.current ? undefined : initialReferrerRef.current || undefined,
      utmSource,
      utmMedium,
    });
    referrerSentRef.current = true;
  }, [analyticsAllowed, ensureSession, flushDuration, pathname, searchParams, searchSignature, sendEvent]);

  useEffect(() => {
    if (!analyticsAllowed) return;

    const handleClick = (event: MouseEvent) => {
      if (!trackingActiveRef.current) return;
      const now = Date.now();
      if (now - lastClickRef.current < 200) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const clickable = target?.closest("button, a, [data-track]") as HTMLElement | null;
      if (!clickable) return;
      const label =
        clickable.getAttribute("data-track-label") ??
        clickable.getAttribute("aria-label") ??
        clickable.textContent?.trim();
      lastClickRef.current = now;
      void sendEvent({
        type: "CLICK",
        path: currentPathRef.current ?? pathname,
        sessionId: ensureSession(),
        label: label ? label.slice(0, 120) : undefined,
      });
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [analyticsAllowed, ensureSession, pathname, sendEvent]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushDuration("unload");
      }
    };
    const handlePageHide = () => flushDuration("unload");

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [flushDuration]);

  return null;
}
