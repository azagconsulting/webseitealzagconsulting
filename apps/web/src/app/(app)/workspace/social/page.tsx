"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Loader2, PenLine, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOpenAiKey } from "@/hooks/use-openai-key";
import { clsx } from "clsx";

const platformPresets = [
  { value: "linkedin", label: "LinkedIn", description: "B2B, Thought Leadership" },
  { value: "twitter", label: "X / Twitter", description: "Kurz, pointiert" },
  { value: "instagram", label: "Instagram", description: "Storytelling & Emojis" },
  { value: "facebook", label: "Facebook", description: "Community & Dialog" },
  { value: "tiktok", label: "TikTok", description: "Snackable Hooks" },
];

const OPENAI_MAX_RETRIES = 2;
const OPENAI_MIN_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PlatformSample {
  variation: string;
  text: string;
}

const HASHTAG_SPLIT_REGEX = /(#[A-Za-z0-9ÄÖÜäöüß_]+)/g;
const HASHTAG_CHECK_REGEX = /^#[A-Za-z0-9ÄÖÜäöüß_]+$/;

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function paragraphToLines(paragraph: string) {
  const manualLines = paragraph
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (manualLines.length > 1) {
    return manualLines;
  }

  const sentenceMatches = paragraph.match(/[^.!?]+[.!?]?/g);
  const sentenceLines =
    sentenceMatches?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

  if (sentenceLines.length > 1) {
    return sentenceLines;
  }

  return manualLines.length ? manualLines : [paragraph];
}

function buildCopyPayload(text: string) {
  const paragraphs = splitParagraphs(text);
  const blocks = paragraphs.map((paragraph) => paragraphToLines(paragraph).join("\n"));
  return blocks.join("\n\n");
}

function renderHashtagLine(line: string) {
  return line.split(HASHTAG_SPLIT_REGEX).map((segment, index) => {
    if (!segment) {
      return null;
    }

    if (HASHTAG_CHECK_REGEX.test(segment)) {
      return (
        <span key={`hash-${index}`} className="font-semibold text-sky-300">
          {segment}
        </span>
      );
    }

    return <span key={`text-${index}`}>{segment}</span>;
  });
}

function formatSocialText(text: string) {
  const paragraphs = splitParagraphs(text);

  if (!paragraphs.length) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2 text-sm text-slate-100">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraphToLines(paragraph);
        return (
          <p key={`paragraph-${paragraphIndex}`} className="leading-relaxed">
            {lines.map((line, lineIndex) => (
              <span key={`line-${paragraphIndex}-${lineIndex}`}>
                {renderHashtagLine(line)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default function SocialAutomationPage() {
  const router = useRouter();
  const { openAiKey } = useOpenAiKey();
  const [topic, setTopic] = useState("Neues AI-Dashboard für Account-Teams");
  const [tone, setTone] = useState("modern, empathisch, aber klar");
  const [cta, setCta] = useState("Buche die Live-Demo & sichere dir Early Access");
  const [audience, setAudience] = useState("B2B SaaS Entscheider:innen");
  const [hookStyle, setHookStyle] = useState("Konkrete KPI-Hooks mit Zahlen");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([platformPresets[0].value]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, PlatformSample[]>>({});
  const [editingSample, setEditingSample] = useState<{
    platform: string;
    index: number;
    text: string;
  } | null>(null);

  const togglePlatform = useCallback((value: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }, []);

  const canGenerate = useMemo(() => {
    return Boolean(openAiKey && topic.trim() && selectedPlatforms.length);
  }, [openAiKey, topic, selectedPlatforms.length]);

  const handleCopy = useCallback(async (value: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    const payload = buildCopyPayload(value);
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore copy failures silently
    }
  }, []);

  const handleEdit = useCallback((platform: string, index: number, text: string) => {
    setEditingSample({ platform, index, text });
  }, []);

  const handleEditChange = useCallback((value: string) => {
    setEditingSample((current) => (current ? { ...current, text: value } : current));
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingSample(null);
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editingSample) {
      return;
    }

    setOutputs((prev) => {
      const next = { ...prev };
      const samples = next[editingSample.platform];
      if (!samples) {
        return prev;
      }
      next[editingSample.platform] = samples.map((sample, index) =>
        index === editingSample.index ? { ...sample, text: editingSample.text } : sample,
      );
      return next;
    });
    setEditingSample(null);
  }, [editingSample]);

  const handleGenerate = useCallback(async () => {
    if (!openAiKey) {
      setError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const prompt = `Du bist eine Social-Media-Automation für ein CRM. Erstelle für jede Plattform (${selectedPlatforms.join(
        ", ",
      )}) genau zwei Varianten eines Posts.
Thema: ${topic}.
Tonalität: ${tone}.
Zielpersona: ${audience}.
Hook-Stil: ${hookStyle}.
CTA: ${cta}.
Gewünschte Länge: ${length}.
Nutze moderne Emojis (mindestens zwei pro Variante) direkt im Text, möglichst passend zum Inhalt.
Beende jede Variante mit mindestens drei relevanten Hashtags in einer eigenen Zeile (z. B. "#CRM #SaaS #Automation").
Gib reinen Text ohne Markdown oder Bulletpoints zurück.
Struktur: { "platform": [ { "variation": "Variante 1", "text": "..." }, { "variation": "Variante 2", "text": "..." } ] }`;

      const runWithRetry = async () => {
        let lastRateLimitError: Error | null = null;

        for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt++) {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              temperature: 0.8,
              messages: [
                {
                  role: "system",
                  content: "Du erzeugst Social Posts mit modernen Hooks und klarer Copy. Antworte nur mit JSON.",
                },
                { role: "user", content: prompt },
              ],
            }),
          });

          if (response.status === 429) {
            lastRateLimitError = new Error(
              "OpenAI-Ratelimit erreicht. Wir versuchen es gleich erneut...",
            );

            if (attempt < OPENAI_MAX_RETRIES) {
              const retryAfterHeader = response.headers.get("retry-after");
              const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
              const retryDelay =
                Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                  ? retryAfterSeconds * 1000
                  : OPENAI_MIN_DELAY_MS * (attempt + 1);
              await sleep(retryDelay);
              continue;
            }

            throw lastRateLimitError;
          }

          if (!response.ok) {
            try {
              const payload = await response.json();
              if (payload?.error?.message) {
                throw new Error(payload.error.message as string);
              }
            } catch {
              // ignore parse errors
            }
            throw new Error(`OpenAI-Fehler: ${response.status}`);
          }

          return response.json();
        }

        throw lastRateLimitError ?? new Error("OpenAI-Antwort konnte nicht erzeugt werden.");
      };

      const body = await runWithRetry();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("Kein Inhalt von OpenAI erhalten");
      }

      const ensureTwoSamples = (samples: PlatformSample[], fallbackText: string) => {
        if (!samples?.length) {
          return [
            { variation: "Variante 1", text: fallbackText },
            { variation: "Variante 2", text: fallbackText },
          ];
        }

        const normalized = samples
          .map((item, index) => ({
            variation: item?.variation?.trim() || `Variante ${index + 1}`,
            text: item?.text?.trim() || fallbackText,
          }))
          .slice(0, 2);

        while (normalized.length < 2) {
          normalized.push({
            variation: `Variante ${normalized.length + 1}`,
            text: fallbackText,
          });
        }

        return normalized;
      };

      let parsed: Record<string, PlatformSample[]> | null = null;
      try {
        parsed = JSON.parse(content) as Record<string, PlatformSample[]>;
      } catch (parseError) {
        console.warn("Konnte JSON nicht parsen", parseError);
      }

      const mapped = selectedPlatforms.reduce<Record<string, PlatformSample[]>>((acc, platform) => {
        const samples = parsed?.[platform];
        acc[platform] = ensureTwoSamples(samples ?? [], content);
        return acc;
      }, {});

      setOutputs(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Generieren");
    } finally {
      setLoading(false);
    }
  }, [audience, cta, hookStyle, length, openAiKey, selectedPlatforms, tone, topic]);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Automationen</p>
          <h1 className="text-3xl font-semibold text-white">Social Launch Studio</h1>
          <p className="text-sm text-slate-400">Generiere Posts für alle Plattformen – powered by deinem OpenAI-Key.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/settings")}>API-Key verwalten</Button>
      </div>

      {!openAiKey && (
        <Card className="border-rose-500/30 bg-rose-500/5 text-sm text-rose-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5" />
            <div>
              <p className="font-semibold">OpenAI-Schlüssel erforderlich</p>
              <p>Hinterlege deinen Key in den Einstellungen, um Beiträge zu generieren.</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Briefing" description="Beschreibe Thema, Tonalität und Aktionen.">
          <div className="space-y-4">
            <label className="block text-sm text-slate-300">
              Thema oder Kampagne
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                rows={3}
                placeholder="Produktlaunch, Case Study, Event..."
              />
            </label>
            <label className="block text-sm text-slate-300">
              Tonalität
              <input
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                placeholder="z. B. bold, inspirierend"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Call-to-Action
              <input
                value={cta}
                onChange={(event) => setCta(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                placeholder="Ziel der Kampagne"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Zielpersona
              <input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                placeholder="Wer soll den Beitrag lesen?"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Hook-Stil
              <input
                value={hookStyle}
                onChange={(event) => setHookStyle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                placeholder="z. B. KPI, Storytelling, Bold Claim"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Länge der Copy
              <select
                value={length}
                onChange={(event) => setLength(event.target.value as "short" | "medium" | "long")}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white bg-transparent focus:border-sky-400 focus:outline-none"
              >
                <option value="short">Kurz & prägnant</option>
                <option value="medium">Mittel – ausgewogen</option>
                <option value="long">Lang – inklusive Story</option>
              </select>
            </label>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Plattformen</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {platformPresets.map((platform) => (
                  <button
                    type="button"
                    key={platform.value}
                    onClick={() => togglePlatform(platform.value)}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-left",
                      selectedPlatforms.includes(platform.value)
                        ? "border-sky-400/60 bg-sky-500/10 text-white"
                        : "border-white/10 text-slate-400 hover:border-white/30",
                    )}
                  >
                    <p className="text-sm font-semibold">{platform.label}</p>
                    <p className="text-xs text-slate-500">{platform.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={!canGenerate || loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Beiträge generieren
            </Button>
            {!canGenerate && (
              <p className="text-xs text-slate-500">Trage Thema ein, wähle Plattformen und stelle sicher, dass ein Key vorhanden ist.</p>
            )}
          </div>
        </Card>

        <Card title="Status" description="Preview & Copy-Paste.">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> AI komponiert deine Posts...
            </p>
          )}
          {error && !loading && <p className="text-sm text-rose-300">{error}</p>}
          {!loading && !error && Object.keys(outputs).length === 0 && (
            <p className="text-sm text-slate-400">Noch keine Ausgabe – starte mit einem Briefing.</p>
          )}
          <div className="mt-4 space-y-4">
            {Object.entries(outputs).map(([platform, samples]) => (
              <div key={platform} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white uppercase tracking-[0.3em]">{platform}</p>
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="space-y-3">
                  {samples.map((sample, index) => (
                    <div
                      key={`${platform}-${index}`}
                      className="rounded-2xl border border-white/10 bg-white/5/20 p-3 transition hover:border-white/30"
                    >
                      {(() => {
                        const isEditing =
                          editingSample?.platform === platform && editingSample.index === index;
                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                {sample.variation}
                              </p>
                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded-full border border-emerald-400/30 bg-emerald-500/20 p-1 text-emerald-200 transition hover:text-white"
                                      aria-label="Änderungen speichern"
                                      title="Speichern"
                                      onClick={handleEditSave}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-full border border-white/10 bg-white/5 p-1 text-slate-300 transition hover:text-white"
                                      aria-label="Bearbeitung abbrechen"
                                      title="Abbrechen"
                                      onClick={handleEditCancel}
                                    >
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded-full border border-white/10 bg-white/5 p-1 text-slate-300 transition hover:text-white"
                                      aria-label="Variante bearbeiten"
                                      title="Bearbeiten"
                                      onClick={() => handleEdit(platform, index, sample.text)}
                                    >
                                      <PenLine className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-full border border-white/10 bg-white/5 p-1 text-slate-300 transition hover:text-white"
                                      aria-label="In Zwischenablage kopieren"
                                      title="Copy"
                                      onClick={() => handleCopy(sample.text)}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              <div className="mt-3 space-y-3">
                                <textarea
                                  value={editingSample?.text ?? ""}
                                  onChange={(event) => handleEditChange(event.target.value)}
                                  rows={6}
                                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                                />
                                <div className="flex flex-wrap gap-3">
                                  <Button size="sm" onClick={handleEditSave}>
                                    Speichern
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={handleEditCancel}>
                                    Abbrechen
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              formatSocialText(sample.text)
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-500">⚠️ Bitte prüfe AI-Inhalte, bevor du sie veröffentlichst.</p>
        </Card>
      </div>
    </section>
  );
}
