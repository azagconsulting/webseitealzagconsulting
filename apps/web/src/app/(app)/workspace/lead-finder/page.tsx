"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Cog,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SERPAPI_KEY_STORAGE } from "@/lib/constants";
import { useOpenAiKey } from "@/hooks/use-openai-key";
import { useAuth } from "@/components/auth-provider";

type SerpResult = {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
};

type LeadInsight = {
  company: string;
  website?: string;
  email?: string;
  phone?: string;
  location?: string;
  postalCode?: string;
  reason?: string;
};

export default function LeadFinderPage() {
  const router = useRouter();
  const { openAiKey, loadingOpenAiKey, saveOpenAiKey, openAiKeyError } = useOpenAiKey();
  const [serpApiKey, setSerpApiKey] = useState<string | null>(null);
  const [serpApiKeyDraft, setSerpApiKeyDraft] = useState("");
  const [query, setQuery] = useState("");
  const [postalHint, setPostalHint] = useState("");
  const [notes, setNotes] = useState("");
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [leads, setLeads] = useState<LeadInsight[]>([]);
  const [loadingSerp, setLoadingSerp] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { authorizedRequest, loading: authLoading } = useAuth();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createWebsite, setCreateWebsite] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createLocation, setCreateLocation] = useState("");
  const [createPostal, setCreatePostal] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [openAiKeyDraft, setOpenAiKeyDraft] = useState("");
  const [keyModalSaving, setKeyModalSaving] = useState(false);
  const [keyModalError, setKeyModalError] = useState<string | null>(null);
  const [showAllLeads, setShowAllLeads] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedSerp = window.localStorage.getItem(SERPAPI_KEY_STORAGE);
    if (savedSerp) {
      setSerpApiKey(savedSerp);
      setSerpApiKeyDraft(savedSerp);
    }
  }, []);

  const missingKeys = useMemo(() => {
    const missing: string[] = [];
    if (!serpApiKey) missing.push("SerpAPI-Key");
    if (!openAiKey && !loadingOpenAiKey) missing.push("OpenAI-Key");
    return missing.join(" & ");
  }, [serpApiKey, openAiKey, loadingOpenAiKey]);

  const buildSerpPrompt = (results: SerpResult[]) =>
    results
      .map((item, index) => {
        return `#${index + 1} ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet ?? "–"}`;
      })
      .join("\n\n");

  const handleSaveKeys = useCallback(async () => {
    setKeyModalError(null);
    setKeyModalSaving(true);
    try {
      await saveOpenAiKey(openAiKeyDraft.trim() ? openAiKeyDraft : null);
      const trimmedSerp = serpApiKeyDraft.trim();
      if (typeof window !== "undefined") {
        if (trimmedSerp) {
          window.localStorage.setItem(SERPAPI_KEY_STORAGE, trimmedSerp);
        } else {
          window.localStorage.removeItem(SERPAPI_KEY_STORAGE);
        }
      }
      setSerpApiKey(trimmedSerp || null);
      setKeyModalOpen(false);
    } catch (err) {
      setKeyModalError(
        err instanceof Error ? err.message : "API-Keys konnten nicht gespeichert werden.",
      );
    } finally {
      setKeyModalSaving(false);
    }
  }, [openAiKeyDraft, saveOpenAiKey, serpApiKeyDraft]);

  const handleSearch = useCallback(async () => {
    if (!serpApiKey || !openAiKey) {
      setError("Bitte hinterlege OpenAI- und SerpAPI-Key, um Leads zu finden.");
      return;
    }
    if (!query.trim()) {
      setError("Bitte gib eine Suchanfrage ein.");
      return;
    }

    setError(null);
      setStatus("SerpAPI: Suche startet…");
      setLoadingSerp(true);
      setLoadingAi(false);
      setLeads([]);
      setSerpResults([]);

    try {
      const baseQuery = query.trim();
      const finalQuery = postalHint.trim() ? `${baseQuery} ${postalHint.trim()}` : baseQuery;
      const serpResponse = await fetch("/api/serpapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery, serpApiKey }),
      });
      const serpBody = await serpResponse.json();
      if (!serpResponse.ok || !Array.isArray(serpBody?.results)) {
        const errorMessage =
          (typeof serpBody?.error === "string" && serpBody.error) ||
          `SerpAPI-Proxy-Fehler: ${serpResponse.status}`;
        throw new Error(errorMessage);
      }
      const filtered: SerpResult[] = serpBody.results;
      setSerpResults(filtered);

      if (!filtered.length) {
        setError("Keine Ergebnisse von SerpAPI gefunden. Bitte Anfrage anpassen.");
        setStatus(null);
        return;
      }

      setStatus("OpenAI: Ergebnisse werden angereichert…");
      setLoadingAi(true);

      const prompt = `Analysiere diese Google-Suchergebnisse und finde passende Firmen-Leads.
Suche: ${finalQuery}
Hinweise/Wunsch: ${notes || "Keine"}
PLZ/Region: ${postalHint || "Keine"}

Ergebnisse:
${buildSerpPrompt(filtered)}

Bitte gib die Antwort als kompaktes JSON-Objekt im Format:
{"leads":[{"company":"","website":"","email":"","phone":"","location":"","postalCode":"","reason":""}]}
 Maximal 15 Leads, sortiert nach Relevanz, Felder leer lassen wenn unbekannt. Keine Freitext-Kommentare außerhalb des JSON.`;

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "Du bist ein Lead-Research-Agent. Du reicherst Suchergebnisse an und gibst nur JSON im geforderten Format zurück.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`OpenAI-Fehler: ${aiResponse.status}`);
      }
      const aiBody = await aiResponse.json();
      const content = aiBody?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Keine Antwort von OpenAI erhalten.");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("OpenAI-Antwort konnte nicht gelesen werden.");
      }

      const parsedLeads: LeadInsight[] = Array.isArray((parsed as { leads?: unknown }).leads)
        ? ((parsed as { leads: unknown[] }).leads || []).map((item) => {
            const record = item as Record<string, unknown>;
            const company = typeof record.company === "string" ? record.company : "";
            const website = typeof record.website === "string" ? record.website : undefined;
            const email = typeof record.email === "string" ? record.email : undefined;
            const phone = typeof record.phone === "string" ? record.phone : undefined;
            const location = typeof record.location === "string" ? record.location : undefined;
            const postalCode = typeof record.postalCode === "string" ? record.postalCode : undefined;
            const reason = typeof record.reason === "string" ? record.reason : undefined;

            return { company, website, email, phone, location, postalCode, reason };
          })
        : [];

      const normalized = parsedLeads
        .filter((item) => item.company)
        .slice(0, 15)
        .map((lead) => ({
          ...lead,
          website: lead.website || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          location: lead.location || undefined,
          reason: lead.reason || undefined,
        }));

      if (!normalized.length) {
        setError("OpenAI hat keine verwertbaren Leads zurückgegeben. Bitte Anfrage anpassen.");
      }
      setLeads(normalized);
      setShowAllLeads(false);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lead-Suche fehlgeschlagen.");
      setStatus(null);
    } finally {
      setLoadingSerp(false);
      setLoadingAi(false);
    }
  }, [buildSerpPrompt, notes, openAiKey, query, serpApiKey]);

  const openCreateModal = useCallback(
    (lead: LeadInsight) => {
      const noteParts = [
        lead.reason,
        lead.website ? `Website: ${lead.website}` : "",
        lead.postalCode ? `PLZ: ${lead.postalCode}` : "",
        lead.location ? `Ort: ${lead.location}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      setCreateName(lead.company ?? "");
      setCreateWebsite(lead.website ?? "");
      setCreateEmail(lead.email ?? "");
      setCreatePhone(lead.phone ?? "");
      setCreateLocation(lead.location ?? "");
      setCreatePostal(lead.postalCode ?? "");
      setCreateNote(noteParts);
      setCreateError(null);
      setCreateSuccess(null);
      setCreateModalOpen(true);
    },
    [],
  );

  const handleCreateCustomer = useCallback(async () => {
    if (authLoading) {
      return;
    }
    const name = createName.trim();
    if (!name) {
      setCreateError("Bitte einen Namen für den Kunden angeben.");
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const region = [createLocation.trim(), createPostal.trim()].filter(Boolean).join(" ");
      const payload: Record<string, unknown> = {
        name,
        segment: "TRIAL",
        health: "GOOD",
        mrrCents: 0,
        region: region || undefined,
        tags: ["lead-finder"],
      };
      const contactEmail = createEmail.trim();
      const contactPhone = createPhone.trim();
      if (contactEmail || contactPhone) {
        payload.contacts = [
          {
            name,
            email: contactEmail || undefined,
            phone: contactPhone || undefined,
            channel: "Lead Finder",
          },
        ];
      }
      if (createNote.trim()) {
        payload.nextStep = createNote.trim();
      } else {
        const stitched = [
          createWebsite ? `Website: ${createWebsite}` : "",
          createPostal ? `PLZ: ${createPostal}` : "",
          createLocation ? `Ort: ${createLocation}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        if (stitched) {
          payload.nextStep = stitched;
        }
      }
      const response = await authorizedRequest("/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreateSuccess("Kunde angelegt.");
      setCreateLoading(false);
      // close after short delay to show message
      setTimeout(() => {
        setCreateModalOpen(false);
        setCreateSuccess(null);
      }, 800);
    } catch (err) {
      setCreateLoading(false);
      setCreateError(err instanceof Error ? err.message : "Kunde konnte nicht angelegt werden.");
    }
  }, [
    authLoading,
    authorizedRequest,
    createEmail,
    createLocation,
    createName,
    createNote,
    createPhone,
  ]);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">KI Tool</p>
          <h1 className="text-3xl font-semibold text-white">Lead Finder</h1>
          <p className="text-sm text-slate-400">
            SerpAPI liefert frische Treffer, OpenAI sortiert und reichert mit Kontaktdaten an.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpenAiKeyDraft(openAiKey ?? "");
              setSerpApiKeyDraft(serpApiKey ?? "");
              setKeyModalError(null);
              setKeyModalOpen(true);
            }}
          >
            <Cog className="h-4 w-4" /> Keys
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push("/workspace/messages")}>
            <ArrowRight className="h-4 w-4" /> Zurück zur Inbox
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card
          title="Suchkriterien"
          description="Query definieren, optional PLZ/Region und Hinweis für die KI."
          className="space-y-4"
        >

          <label className="block text-sm text-slate-300">
            Suchanfrage
            <div className="mt-2 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <Input
                className="flex-1"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="z.B. B2B SaaS Customer Success Software Berlin"
              />
            </div>
          </label>

          <label className="block text-sm text-slate-300">
            Postleitzahl / Region (optional)
            <Input
              className="mt-2"
              value={postalHint}
              onChange={(event) => setPostalHint(event.target.value)}
              placeholder="z.B. 10115, DACH, NRW..."
            />
          </label>

          <label className="block text-sm text-slate-300">
            Hinweise für KI (optional)
            <Textarea
              className="mt-2"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="z.B. Branche, Regionen, Teamgröße, Zielpersonen"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSearch()}
              disabled={loadingSerp || loadingAi}
            >
              {loadingSerp || loadingAi ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loadingSerp ? "SerpAPI..." : loadingAi ? "KI reichert an..." : "Leads finden"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSerpResults([]);
                setLeads([]);
                setError(null);
                setStatus(null);
              }}
            >
              Zurücksetzen
            </Button>
          </div>
          {status && <p className="text-xs text-slate-400">{status}</p>}
          {error && (
            <p className="flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Lead-Liste"
            description="KI-sortierte Vorschläge inkl. Kontaktdaten, falls gefunden."
          >
            {loadingAi && !leads.length ? (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> KI bewertet die Ergebnisse...
              </p>
            ) : null}
            {!loadingAi && leads.length === 0 && (
              <p className="text-sm text-slate-400">
                Starte eine Suche, um Leads zu erhalten. Die KI versucht, Websites, E-Mails und Telefonnummern zu ergänzen.
              </p>
            )}
            <div className="mt-4 grid gap-3">
              {(showAllLeads ? leads : leads.slice(0, 10)).map((lead, index) => {
                const absoluteIndex = leads.indexOf(lead);
                return (
                <div
                  key={`${lead.company}-${absoluteIndex}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-slate-200">
                        {absoluteIndex + 1}
                      </span>
                      <div>
                        <p className="text-base font-semibold text-white">{lead.company}</p>
                        {lead.reason && <p className="text-xs text-slate-400">{lead.reason}</p>}
                      </div>
                    </div>
                    {lead.website && (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                      >
                        Website <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    {lead.email && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                        <Mail className="h-3.5 w-3.5" /> {lead.email}
                      </span>
                    )}
                    {lead.phone && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                        <Phone className="h-3.5 w-3.5" /> {lead.phone}
                      </span>
                    )}
                    {lead.location && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                        <MapPin className="h-3.5 w-3.5" /> {lead.location}
                      </span>
                    )}
                    {lead.postalCode && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                        PLZ {lead.postalCode}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openCreateModal(lead)}
                    >
                      Kunde anlegen
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
            {leads.length > 10 && (
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <p>{showAllLeads ? "Alle Leads angezeigt." : `Zeige 10 von ${leads.length} Leads.`}</p>
                <Button size="sm" variant="ghost" onClick={() => setShowAllLeads((prev) => !prev)}>
                  {showAllLeads ? "Weniger anzeigen" : "Mehr anzeigen"}
                </Button>
              </div>
            )}
          </Card>

          <Card
            title="SerpAPI-Rohdaten"
            description="Die gefundenen Ergebnisse, bevor die KI filtert."
          >
            {loadingSerp && (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> SerpAPI wird abgefragt...
              </p>
            )}
            {!loadingSerp && serpResults.length === 0 && (
              <p className="text-sm text-slate-400">Noch keine Ergebnisse. Starte eine Suche.</p>
            )}
            <div className="mt-4 space-y-3">
              {serpResults.map((result) => (
                <div
                  key={`${result.link}-${result.position ?? result.title}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200"
                >
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    <span>Treffer {result.position ?? "-"}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-white">{result.title}</p>
                  {result.snippet && <p className="mt-1 text-xs text-slate-400">{result.snippet}</p>}
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                  >
                    {result.link} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {createModalOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-4 py-8">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Lead übernehmen</p>
                <h2 className="text-xl font-semibold text-white">Neuen Kunden anlegen</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Schließen
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-300">
                Firmenname
                <Input
                  className="mt-1.5"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="Firma GmbH"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Website
                <Input
                  className="mt-1.5"
                  value={createWebsite}
                  onChange={(event) => setCreateWebsite(event.target.value)}
                  placeholder="https://"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  E-Mail
                  <Input
                    className="mt-1.5"
                    value={createEmail}
                    onChange={(event) => setCreateEmail(event.target.value)}
                    placeholder="kontakt@firma.de"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Telefon
                  <Input
                    className="mt-1.5"
                    value={createPhone}
                    onChange={(event) => setCreatePhone(event.target.value)}
                    placeholder="+49 ..."
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Standort
                  <Input
                    className="mt-1.5"
                    value={createLocation}
                    onChange={(event) => setCreateLocation(event.target.value)}
                    placeholder="Berlin, Remote..."
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Postleitzahl
                  <Input
                    className="mt-1.5"
                    value={createPostal}
                    onChange={(event) => setCreatePostal(event.target.value)}
                    placeholder="10115"
                  />
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Notiz / Grund
                <Textarea
                  className="mt-1.5"
                  rows={3}
                  value={createNote}
                  onChange={(event) => setCreateNote(event.target.value)}
                  placeholder="Warum ist der Lead spannend?"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => void handleCreateCustomer()}
                disabled={createLoading || authLoading}
              >
                {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Kunde speichern
              </Button>
              <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
                Abbrechen
              </Button>
            </div>
            {createError && (
              <p className="mt-2 flex items-center gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {createError}
              </p>
            )}
            {createSuccess && (
              <p className="mt-2 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> {createSuccess}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {keyModalOpen ? (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">API Keys</p>
                <h2 className="text-lg font-semibold text-white">OpenAI & SerpAPI</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setKeyModalOpen(false)}>
                Schließen
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-300">
                OpenAI Key
                <Input
                  className="mt-2"
                  type="password"
                  value={openAiKeyDraft}
                  onChange={(event) => setOpenAiKeyDraft(event.target.value)}
                  disabled={loadingOpenAiKey || keyModalSaving}
                  placeholder="sk-..."
                />
              </label>
              <label className="block text-sm text-slate-300">
                SerpAPI Key
                <Input
                  className="mt-2"
                  type="password"
                  value={serpApiKeyDraft}
                  onChange={(event) => setSerpApiKeyDraft(event.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void handleSaveKeys()}
                disabled={keyModalSaving}
              >
                {keyModalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Speichern"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setKeyModalOpen(false);
                }}
              >
                Abbrechen
              </Button>
            </div>
            {(keyModalError || openAiKeyError) && (
              <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {keyModalError || openAiKeyError}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
