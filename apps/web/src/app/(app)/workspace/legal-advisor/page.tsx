"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, Paperclip, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { clsx } from "clsx";

type AttachmentItem = {
  id: string;
  file: File;
  url: string;
};

export default function LegalAdvisorPage() {
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const next = Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}`,
        file,
        url: URL.createObjectURL(file),
      }));
      setAttachments((prev) => [...prev, ...next]);
      // allow re-selecting the same file name after add/remove
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [],
  );

  const handleSend = useCallback(() => {
    if (!question.trim() && attachments.length === 0) {
      setNotice("Bitte eine Frage stellen oder ein Dokument anhängen.");
      return;
    }
    setNotice(null);
    setLoading(true);
    setAnalysis(null);

    const cleanQuestion = question.trim();
    const questionLine = cleanQuestion ? `Frage: ${cleanQuestion}` : "Frage: (keine Frage formuliert)";

    const attachmentList = attachments
      .map((att) => `• ${att.file.name} (${(att.file.size / 1024).toFixed(0)} KB)`)
      .join("\n");

    const lower = cleanQuestion.toLowerCase();
    const isOffer =
      lower.includes("angebot") ||
      lower.includes("kostenvoranschlag") ||
      lower.includes("kv") ||
      lower.includes("preis") ||
      lower.includes("honorar");

    const isContract =
      lower.includes("vertrag") ||
      lower.includes("vereinbarung") ||
      lower.includes("agb") ||
      lower.includes("klausel");

    const offerRisks = [
      "- Unklare Leistungsbeschreibung: was genau geschuldet ist, Änderungsprozesse fehlen.",
      "- Preisrisiko: Nachträge/Mehrleistungen nicht geregelt, Indexierung oder Festpreis unklar.",
      "- Zahlungsplan/Fälligkeiten: Abschläge, Sicherheiten, Verzugskosten nicht vereinbart.",
      "- Termine/Abnahme: keine klaren Fristen oder Folgen bei Verzögerung/Mitwirkung.",
      "- Haftung/Gewährleistung: Umfang/Ausschlüsse/Verjährung nicht definiert.",
      "- Kündigung/Widerruf: keine Regel zu vorzeitiger Beendigung oder Entschädigung.",
      "- Datenschutz/Geheimhaltung: kein Umgang mit personenbezogenen oder vertraulichen Daten.",
    ];

    const contractRisks = [
      "- Scope unpräzise: Mitwirkung, Ausschlüsse, Verantwortlichkeiten unklar.",
      "- Laufzeit/Verlängerung/Kündigung schwammig oder einseitig.",
      "- Haftung/Gewährleistung ohne Höchstgrenzen oder zu weitreichend.",
      "- Vergütung/Preisanpassung, Nebenkosten und Zahlungsmodalitäten unklar.",
      "- Vertraulichkeit/Datenschutz: Rollen, Zweck, Löschfristen, AVV fehlen.",
      "- Gerichtsstand/Rechtswahl oder Streitbeilegung nicht geregelt.",
    ];

    const genericRisks = [
      "- Unklarer Regelungsgegenstand oder fehlende Mitwirkungspflichten.",
      "- Preise/Entgelte und Anpassungsklauseln nicht transparent.",
      "- Haftung/Gewährleistung oder Verjährung nicht austariert.",
      "- Laufzeit/Kündigung/Widerruf/Abnahme nicht geregelt.",
      "- Datenschutz/Vertraulichkeit bei Personen- oder Geschäftsdaten ungeklärt.",
      "- Streitbeilegung/Anwendbares Recht/Standorte fehlen.",
    ];

    const focusPoints = isOffer
      ? [
          "- Leistung & Ausschlüsse konkret; Change Requests/Mehr-/Minderaufwand regeln.",
          "- Preisbasis, Nachträge, Indexierung; Nebenkosten transparent.",
          "- Zahlungsplan/Fälligkeiten, Sicherheiten, Verzugsschäden.",
          "- Termine/Meilensteine, Mitwirkung, Abnahmeprozesse.",
          "- Haftung/Gewährleistung (Umfang, Ausschlüsse, Verjährung, Caps).",
          "- Kündigung/Widerruf/Beendigung, Entschädigung.",
          "- Datenschutz/Geheimhaltung für Anhänge/Personendaten.",
        ]
      : isContract
      ? [
          "- Scope und Verantwortlichkeiten schriftlich fixieren.",
          "- Laufzeit, Verlängerung, Kündigung/Widerruf klar regeln.",
          "- Haftung/Gewährleistung: Umfang, Ausschlüsse, Verjährung, Caps.",
          "- Vergütung/Preisanpassung, Nebenkosten, Zahlungsmodalitäten.",
          "- Datenschutz/Vertraulichkeit (Rollen, Zweck, Löschfristen, AVV).",
          "- Streitbeilegung: Gerichtsstand, Rechtwahl, Eskalation/ADR.",
        ]
      : [
          "- Regelungsgegenstand/Scope festziehen, Mitwirkung/Ausschlüsse erfassen.",
          "- Preise/Entgelte, Anpassung, Nebenkosten, Zahlungsmodalitäten klären.",
          "- Haftung/Gewährleistung & Verjährung prüfen, Caps erwägen.",
          "- Laufzeit, Kündigung/Widerruf, Abnahme/Übergabe definieren.",
          "- Datenschutz/Vertraulichkeit bei sensiblen Daten sicherstellen.",
          "- Streitbeilegung/Rechtswahl/Standort definieren.",
        ];

    const riskBlock = isOffer ? offerRisks : isContract ? contractRisks : genericRisks;

    const nextSteps = [
      "- Fehlende Punkte (Leistung, Preis, Haftung, Laufzeit) konkretisieren und schriftlich festhalten.",
      "- Dokument mit Version/Datum kennzeichnen; Annahme/Abnahme schriftlich sichern.",
      "- Bei Unsicherheit: Kurz-Check durch Kanzlei, bevor du unterschreibst/versendest.",
    ];

    const positives = isOffer
      ? [
          "- Positiv: Kostenvoranschlag deutet auf Vorhersehbarkeit der Kosten hin (sofern klar formuliert).",
          "- Positiv: Bei klaren Leistungsbeschreibungen lassen sich spätere Streitigkeiten reduzieren.",
        ]
      : isContract
      ? [
          "- Positiv: Vertragliche Regelung schafft Rechtssicherheit, sofern die Hauptpunkte sauber gefasst sind.",
          "- Positiv: AGB/Verträge können Standardfälle vereinheitlichen, wenn transparent gestaltet.",
        ]
      : [
          "- Positiv: Schriftliche Fixierung gibt dir Beweisbarkeit und Klarheit.",
          "- Positiv: Wenn Eckpunkte (Preis, Haftung, Laufzeit) enthalten sind, sinkt das Streitpotenzial.",
        ];

    const negatives = [
      "- Mögliche Schwäche: Unklare oder fehlende Regelungen zu Haftung/Gewährleistung/Laufzeit/Preis.",
      "- Mögliche Schwäche: Keine klaren Abnahme-/Mitwirkungsregeln oder Folgen bei Verzug.",
      "- Mögliche Schwäche: Datenschutz/Vertraulichkeit nicht adressiert, obwohl Personen-/Geschäftsdaten betroffen sein könnten.",
    ];

    setTimeout(() => {
      setAnalysis(
        [
          questionLine && `👉 ${questionLine}`,
          attachmentList && `📎 Anhänge:\n${attachmentList}`,
          "✅ Was wirkt solide/positiv:",
          positives.map((p) => `  • ${p}`).join("\n"),
          "⚠️ Risiken/Hinweise:",
          riskBlock.map((r) => `  • ${r}`).join("\n"),
          "🔍 Prüfpunkte:",
          focusPoints.map((p) => `  • ${p}`).join("\n"),
          "⚡ Potenzielle Schwachstellen:",
          negatives.map((n) => `  • ${n}`).join("\n"),
          "🛠️ Nächste Schritte (unverbindlich):",
          nextSteps.map((s) => `  • ${s}`).join("\n"),
          "— Kein Ersatz für anwaltliche Beratung —",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
      setLoading(false);
    }, 350);
  }, [question, attachments]);

  const totalSizeMb = useMemo(() => {
    return attachments.reduce((acc, item) => acc + item.file.size, 0) / (1024 * 1024);
  }, [attachments]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-white">Legal Advisor</h1>
          <p className="text-sm text-slate-400">
            Informelle Ersteinschätzung mit Upload von Verträgen oder Bildern. Keine Dateien werden als Output erzeugt.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Kein Ersatz für anwaltliche Beratung.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1.2fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-slate-200">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">Fragestellung</span>
          </div>
          <Textarea
            placeholder="Beschreibe dein Anliegen (z. B. Kündigungsfrist, AGB-Klausel, Bildrecht)..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={10}
            className="text-sm"
          />

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-slate-300" />
              <span className="text-sm text-slate-200">Dateien anhängen</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              className="border-white/20 text-slate-200"
            >
              <Paperclip className="mr-2 h-4 w-4" />
              Dateien auswählen
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <span className="text-xs text-slate-400">PDF, Bilder, DOCX – max. 25 MB gesamt</span>
          </div>

          {attachments.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Angehängt</span>
                <span>{totalSizeMb.toFixed(2)} MB</span>
              </div>
              <div className="space-y-2">
                {attachments.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="truncate max-w-[220px]">{item.file.name}</span>
                      <span className="text-xs text-slate-500">
                        {(item.file.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    <button
                      className="text-slate-400 hover:text-white"
                      onClick={() =>
                        setAttachments((prev) => {
                          URL.revokeObjectURL(item.url);
                          return prev.filter((f) => f.id !== item.id);
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notice && <p className="text-sm text-rose-300">{notice}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleSend}
              disabled={loading}
              className="bg-emerald-500/90 text-white hover:bg-emerald-500"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Einschätzung anfordern
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-slate-200">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <span className="text-sm font-semibold">Hinweis</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>Dies ist eine informelle Einschätzung – keine Rechtsberatung.</li>
            <li>Es werden keine Dateien ausgegeben, nur Hinweise im Text.</li>
            <li>Schütze vertrauliche Daten, bevor du sie anhängst.</li>
          </ul>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Antwort</p>
            <div className="mt-2 min-h-[140px] rounded-xl bg-white/5 p-3 text-sm text-slate-100">
              {loading && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analysiere…
                </div>
              )}
              {!loading && analysis && <p className="whitespace-pre-line">{analysis}</p>}
              {!loading && !analysis && (
                <p className="text-slate-400">Bereit für deine Frage oder ein Dokument.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
