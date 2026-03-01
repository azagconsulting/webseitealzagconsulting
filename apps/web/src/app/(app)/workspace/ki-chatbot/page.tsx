"use client";

import { useEffect, useState } from "react";
import { Bot, Eye, EyeOff, KeyRound, BookOpen } from "lucide-react";
import { clsx } from "clsx";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatbotOpenAiKey } from "@/hooks/use-chatbot-openai-key";
import { useChatbotKnowledge } from "@/hooks/use-chatbot-knowledge";
import { useChatbotVisibility } from "@/hooks/use-chatbot-visibility";

const DEFAULT_KNOWLEDGE = `Wissensbasis – Standard

Rolle & Ton:
Du bist ein digitaler Assistent. Antworte seriös, zuverlässig und in der Sie-Form. 1-3 Sätze.
Individuell und konkret antworten, keine Standardfloskeln oder langen Textbausteine. Nur relevante Infos nennen.
Vermeide Einleitungen wie „Bitte beachten Sie“ oder „Gerne helfe ich Ihnen“.

Preis-Anfragen:
- Keine Preise oder Kostenschätzungen.
- Kurz begründen und Kontakt oder Termin anbieten, ohne Standardformel.

Antwort-/Verhaltensregeln:
- Häufige Fragen aktiv beantworten: Öffnungszeiten, Kontakt, Termine, Leistungen.
- Bei Unklarheit kurze Rückfrage + Termin oder Kontakt anbieten.
- Bei Terminwünschen keine Rückfragen nach Datum/Uhrzeit stellen. Stattdessen auf die hinterlegte Terminlogik verweisen.
- Wenn der Nutzer einen Rückruf möchte oder danach fragt, frage: „Für einen Rückruf benötige ich Ihren Namen und Ihre Telefonnummer. Eine E-Mail-Adresse ist optional.“
- Sobald Name, Telefonnummer und E-Mail vorliegen: „Vielen Dank. Ich habe die Anfrage an das Team weitergegeben.“
- Technische Ferndiagnose und Rechtsberatung ablehnen.
- Keine sensiblen Daten erfragen.
- Kontaktinformationen nur nennen, wenn sie gefragt sind oder zur nächsten Aktion nötig sind.
- Unzulässige/fremde Fragen: Kurz ablehnen, den Servicefokus nennen und Hilfe bei Terminen/Kontakt anbieten (ohne Standardtext).`;

export default function KiChatbotPage() {
  const [status, setStatus] = useState<string | null>(null);
  const {
    openAiKey,
    loadingOpenAiKey,
    savingOpenAiKey,
    openAiKeyError,
    saveOpenAiKey,
  } = useChatbotOpenAiKey();
  const [keyDraft, setKeyDraft] = useState("");
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const {
    knowledge,
    loadingKnowledge,
    savingKnowledge,
    knowledgeError,
    saveKnowledge,
  } = useChatbotKnowledge();
  const [knowledgeDraft, setKnowledgeDraft] = useState("");
  const [knowledgeStatus, setKnowledgeStatus] = useState<string | null>(null);
  const {
    enabled,
    loadingVisibility,
    savingVisibility,
    visibilityError,
    saveVisibility,
    setVisibilityError,
  } = useChatbotVisibility();

  useEffect(() => {
    if (!loadingOpenAiKey && openAiKey !== undefined) {
      setKeyDraft(openAiKey ?? "");
    }
  }, [loadingOpenAiKey, openAiKey]);

  useEffect(() => {
    if (!loadingKnowledge && knowledge !== undefined) {
      setKnowledgeDraft(knowledge ?? DEFAULT_KNOWLEDGE);
    }
  }, [knowledge, loadingKnowledge]);

  const isEnabled = Boolean(enabled);
  const visibilityDisabled = loadingVisibility || savingVisibility || enabled === null;

  const handleVisibilityChange = async (value: boolean) => {
    setStatus(null);
    setVisibilityError(null);
    try {
      await saveVisibility(value);
      setStatus(value ? "Chatbot-Launcher ist jetzt sichtbar." : "Chatbot im Frontend ausgeblendet.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sichtbarkeit konnte nicht gespeichert werden.");
    }
  };

  const handleKeySave = async (event: React.FormEvent) => {
    event.preventDefault();
    setKeyStatus(null);
    try {
      await saveOpenAiKey(keyDraft.trim() ? keyDraft : null);
      setKeyStatus("OpenAI Key gespeichert (Server).");
    } catch (err) {
      setKeyStatus(err instanceof Error ? err.message : "Key konnte nicht gespeichert werden.");
    }
  };

  const handleKeyRemove = async () => {
    setKeyStatus(null);
    try {
      await saveOpenAiKey(null);
      setKeyDraft("");
      setKeyStatus("OpenAI Key gelöscht.");
    } catch (err) {
      setKeyStatus(err instanceof Error ? err.message : "Key konnte nicht gelöscht werden.");
    }
  };

  const handleKnowledgeSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setKnowledgeStatus(null);
    try {
      await saveKnowledge(knowledgeDraft.trim() ? knowledgeDraft : null);
      setKnowledgeStatus("Wissensbasis gespeichert.");
    } catch (err) {
      setKnowledgeStatus(err instanceof Error ? err.message : "Wissensbasis konnte nicht gespeichert werden.");
    }
  };

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">KI Tool</p>
          <h1 className="text-2xl font-semibold text-white">KI Chatbot</h1>
          <p className="text-sm text-slate-300">
            Button und Panel im Frontend sichtbar schalten. Standard: versteckt.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-white/10 bg-white/5 p-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <Bot className="h-5 w-5 text-sky-300" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Sichtbarkeit</p>
                <h2 className="text-lg font-semibold">Public Launcher</h2>
                <p className="text-sm text-slate-300">Steuert den runden Assist-Button auf der Webseite.</p>
              </div>
            </div>
            <Button
              onClick={() => handleVisibilityChange(!isEnabled)}
              disabled={visibilityDisabled}
              className={clsx(
                "min-w-[160px] justify-center",
                isEnabled ? "bg-emerald-500 hover:bg-emerald-400" : "bg-slate-800 hover:bg-slate-700",
              )}
            >
              {savingVisibility
                ? "Speichere..."
                : loadingVisibility
                  ? "Lädt..."
                  : isEnabled
                    ? "Deaktivieren"
                    : "Aktivieren"}
            </Button>
          </div>

          <div
            className={clsx(
              "mt-4 rounded-2xl border p-4",
              isEnabled
                ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-50"
                : "border-white/10 bg-white/5 text-slate-200",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {isEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {isEnabled ? "Sichtbar auf der Website" : "Aktuell verborgen"}
            </div>
            <p className="mt-2 text-sm">
              {isEnabled
                ? "Widget erscheint unten rechts und öffnet den Chat mit Caro."
                : "Widget bleibt unsichtbar, bis du es aktivierst."}
            </p>
          </div>

          {(loadingVisibility || visibilityError || status) && (
            <div className="mt-3 space-y-1">
              {loadingVisibility && <p className="text-sm text-slate-300">Aktueller Status wird geladen...</p>}
              {(visibilityError || status) && (
                <p className="text-sm text-slate-200">
                  {visibilityError ?? status}
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="border border-white/10 bg-white/5 p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <KeyRound className="h-5 w-5 text-sky-300" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">OpenAI</p>
              <h2 className="text-lg font-semibold">API-Key speichern</h2>
              <p className="text-sm text-slate-300">Serverseitig für Caro hinterlegt.</p>
            </div>
          </div>

          <form className="mt-4 grid gap-3" onSubmit={handleKeySave}>
            <label className="text-sm text-slate-200" htmlFor="openai-key">
              OpenAI Secret Key
            </label>
            <Input
              id="openai-key"
              type="password"
              placeholder="sk-..."
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              disabled={savingOpenAiKey}
              className="bg-slate-900/60 text-white"
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="min-w-[140px]" disabled={savingOpenAiKey}>
                {savingOpenAiKey ? "Speichere..." : "Speichern"}
              </Button>
              {openAiKey && (
                <Button type="button" variant="ghost" onClick={handleKeyRemove} disabled={savingOpenAiKey}>
                  Entfernen
                </Button>
              )}
            </div>
            {(openAiKeyError || keyStatus) && (
              <p className="text-sm text-slate-200">
                {openAiKeyError ?? keyStatus}
              </p>
            )}
          </form>
        </Card>
      </div>

      <Card className="border border-white/10 bg-white/5 p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <BookOpen className="h-5 w-5 text-sky-300" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Wissensbasis</p>
            <h2 className="text-lg font-semibold">Inhalt bearbeiten</h2>
            <p className="text-sm text-slate-300">
              Vorgaben für Antworten (Öffnungszeiten, Kontakt, Regeln). Wird serverseitig gespeichert.
            </p>
          </div>
        </div>

        <form className="mt-4 grid gap-3" onSubmit={handleKnowledgeSave}>
          <label className="text-sm text-slate-200" htmlFor="chatbot-knowledge">
            Wissensbasis
          </label>
          <textarea
            id="chatbot-knowledge"
            value={knowledgeDraft}
            onChange={(event) => setKnowledgeDraft(event.target.value)}
            className="min-h-[360px] w-full rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white"
            placeholder="Texte für den Chatbot..."
            disabled={savingKnowledge || loadingKnowledge}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="min-w-[140px]" disabled={savingKnowledge}>
              {savingKnowledge ? "Speichere..." : "Speichern"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={savingKnowledge || loadingKnowledge}
              onClick={() => setKnowledgeDraft(DEFAULT_KNOWLEDGE)}
            >
              Auf Vorlage setzen
            </Button>
          </div>
          {(knowledgeError || knowledgeStatus) && (
            <p className="text-sm text-slate-200">
              {knowledgeError ?? knowledgeStatus}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
