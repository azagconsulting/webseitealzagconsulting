"use client";

import { ShieldCheck, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import {
  CONSENT_EVENT_NAME,
  createConsent,
  isMarketingPath,
  readConsent,
  writeConsent,
} from "@/lib/consent";

type ConsentDraft = {
  analytics: boolean;
  marketing: boolean;
};

type ToggleRowProps = {
  title: string;
  description: string;
  detail?: string;
  enabled: boolean;
  locked?: boolean;
  onToggle?: () => void;
};

function ToggleRow({ title, description, detail, enabled, locked = false, onToggle }: ToggleRowProps) {
  return (
    <div className="rounded-lg border border-[#262a30] bg-[#111318]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-white">{title}</p>
          <p className="mt-1 text-sm leading-6 text-[#c8ccd2]">{description}</p>
          {detail && <p className="mt-3 text-[12px] font-semibold text-[#b4a04b]">{detail}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${title} ${enabled ? "aktiviert" : "deaktiviert"}`}
          disabled={locked}
          onClick={onToggle}
          className={[
            "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4a04b]",
            enabled
              ? "border-[#b4a04b] bg-[#b4a04b]"
              : "border-[#2c2f35] bg-[#111214]",
            locked ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.38)] transition-all",
              enabled ? "left-[22px]" : "left-0.5",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}

function subscribeConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const notify = () => onStoreChange();
  window.addEventListener(CONSENT_EVENT_NAME, notify as EventListener);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(CONSENT_EVENT_NAME, notify as EventListener);
    window.removeEventListener("storage", notify);
  };
}

function getConsentSnapshot() {
  return readConsent();
}

export function CookieConsent() {
  const pathname = usePathname() || "/";
  const isRelevantPath = useMemo(() => isMarketingPath(pathname), [pathname]);
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, () => null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentDraft>({
    analytics: false,
    marketing: false,
  });

  const hasDecision = Boolean(consent);
  const baseBtnClass =
    "inline-flex items-center justify-center rounded-md border px-4 py-2.5 text-[12px] font-bold tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4a04b]";
  const primaryBtnClass = `${baseBtnClass} border-[#b4a04b] bg-[#b4a04b] text-[#050506] hover:bg-[#ffffff] hover:text-[#b4a04b]`;
  const secondaryBtnClass = `${baseBtnClass} border-[#2c2f35] bg-[#15171a] text-[#ffffff] hover:border-[#b4a04b] hover:text-[#b4a04b]`;

  const applyConsent = (next: ConsentDraft) => {
    writeConsent(
      createConsent({
        analytics: next.analytics,
        marketing: next.marketing,
      }),
    );
    setDraft(next);
    setSettingsOpen(false);
  };

  const openSettings = () => {
    setDraft({
      analytics: Boolean(consent?.analytics),
      marketing: Boolean(consent?.marketing),
    });
    setSettingsOpen(true);
  };

  if (!isRelevantPath) return null;

  return (
    <>
      {!hasDecision && (
        <section className="fixed inset-x-4 bottom-4 z-[90] sm:inset-x-auto sm:left-4 sm:max-w-[700px]">
          <div className="relative overflow-hidden rounded-xl border border-[#b4a04b]/35 bg-[linear-gradient(155deg,rgba(16,18,22,0.98),rgba(7,8,10,0.97))] p-6 shadow-[0_30px_60px_-38px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <span className="pointer-events-none absolute left-0 top-0 h-[3px] w-full bg-[linear-gradient(90deg,#b4a04b,rgba(180,160,75,0.02))]" />
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md border border-[#2c2f35] bg-[#15171a] p-2 text-[#b4a04b]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#b4a04b]">Cookie-Einstellungen</p>
                <p className="text-[15px] leading-6 text-[#d4d8de]">
                  Wir nutzen nur notwendige Cookies standardmäßig. Analyse- und Marketing-Cookies aktivieren wir erst nach
                  deiner Einwilligung. Analyse läuft über unser eigenes Tool Arcto CRM Tracking, Marketing optional über den
                  Facebook Pixel.
                </p>
                <a
                  href="/Webseite-AlzagConsultig/datenschutz.html"
                  className="inline-flex text-[12px] font-semibold text-[#b4a04b] hover:text-[#ffffff]"
                >
                  Datenschutzerklärung ansehen
                </a>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className={secondaryBtnClass} onClick={() => applyConsent({ analytics: false, marketing: false })}>
                Nur notwendige
              </button>
              <button className={primaryBtnClass} onClick={() => applyConsent({ analytics: true, marketing: true })}>
                Alle akzeptieren
              </button>
              <button className={secondaryBtnClass} onClick={openSettings}>
                Einstellungen
              </button>
            </div>
          </div>
        </section>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[5px]">
          <div className="w-full max-w-3xl rounded-xl border border-[#b4a04b]/35 bg-[linear-gradient(155deg,rgba(16,18,22,0.99),rgba(6,7,9,0.98))] p-6 shadow-[0_38px_75px_-45px_rgba(0,0,0,0.95)] sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#b4a04b]">Cookie-Einstellungen</p>
                <h2 className="mt-1 text-3xl font-extrabold leading-tight text-white sm:text-4xl">Privatsphäre verwalten</h2>
                <p className="mt-3 text-[15px] leading-6 text-[#d4d8de]">
                  Du kannst die Einwilligung jederzeit ändern. Notwendige Cookies bleiben aktiv, damit die Seite funktioniert.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#2b2f36] bg-[#13161b] px-3 py-1 text-[11px] font-semibold text-[#b4a04b]">
                    Arcto CRM Tracking
                  </span>
                  <span className="rounded-full border border-[#2b2f36] bg-[#13161b] px-3 py-1 text-[11px] font-semibold text-[#b4a04b]">
                    Facebook Pixel
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cookie-Einstellungen schließen"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#2c2f35] text-[#d4d4d6] transition hover:border-[#b4a04b] hover:text-[#b4a04b]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <ToggleRow
                title="Notwendige Cookies"
                description="Erforderlich für Grundfunktionen wie Sicherheit und Sitzungsverwaltung."
                detail="System: Consent-Speicherung und technische Basisfunktionen"
                enabled
                locked
              />
              <ToggleRow
                title="Analyse"
                description="Hilft uns, Seitenaufrufe, Klickpfade und Verweildauer auszuwerten."
                detail="Tool: Arcto CRM Tracking (eigenes Tracking-Tool)"
                enabled={draft.analytics}
                onToggle={() => setDraft((current) => ({ ...current, analytics: !current.analytics }))}
              />
              <ToggleRow
                title="Marketing"
                description="Erlaubt Kampagnenmessung, Conversion-Tracking und Retargeting."
                detail="Tool: Facebook Pixel"
                enabled={draft.marketing}
                onToggle={() => setDraft((current) => ({ ...current, marketing: !current.marketing }))}
              />
            </div>

            <div className="mt-7 flex flex-wrap justify-end gap-2">
              <button className={secondaryBtnClass} onClick={() => applyConsent({ analytics: false, marketing: false })}>
                Nur notwendige
              </button>
              <button className={secondaryBtnClass} onClick={() => applyConsent({ analytics: draft.analytics, marketing: draft.marketing })}>
                Auswahl speichern
              </button>
              <button className={primaryBtnClass} onClick={() => applyConsent({ analytics: true, marketing: true })}>
                Alle akzeptieren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
