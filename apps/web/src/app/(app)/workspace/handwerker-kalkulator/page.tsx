"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertTriangle,
  BadgeEuro,
  Hammer,
  Loader2,
  Percent,
  Sparkles,
  FileDown, // Neues Icon für PDF
} from "lucide-react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOpenAiKey } from "@/hooks/use-openai-key";

type CalcState = {
  jobTitle: string;
  hours: string;
  hourlyRate: string;
  materialCost: string;
  travelKm: string;
  travelRate: string;
  marginPercent: string;
  discountPercent: string;
  vatPercent: string;
  currency: string;
  notes: string;
};

const defaultState: CalcState = {
  jobTitle: "Badezimmer Renovierung",
  hours: "40",
  hourlyRate: "65",
  materialCost: "3200",
  travelKm: "60",
  travelRate: "0.35",
  marginPercent: "12",
  discountPercent: "5",
  vatPercent: "19",
  currency: "EUR",
  notes: "Anfahrt ca. 3 Termine, Materialpreise können schwanken.",
};

export default function HandwerkerKalkulatorPage() {
  const router = useRouter();
  const [calc, setCalc] = useState<CalcState>(defaultState);
  const { openAiKey } = useOpenAiKey();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const numeric = useMemo(() => {
    const hours = Number.parseFloat(calc.hours) || 0;
    const hourlyRate = Number.parseFloat(calc.hourlyRate) || 0;
    const materialCost = Number.parseFloat(calc.materialCost) || 0;
    const travelKm = Number.parseFloat(calc.travelKm) || 0;
    const travelRate = Number.parseFloat(calc.travelRate) || 0;
    const marginRate =
      Math.min(Math.max(Number.parseFloat(calc.marginPercent) || 0, 0), 100) /
      100;
    const discountRate =
      Math.min(Math.max(Number.parseFloat(calc.discountPercent) || 0, 0), 100) /
      100;
    const vatRate =
      Math.min(Math.max(Number.parseFloat(calc.vatPercent) || 0, 0), 100) / 100;

    const labor = hours * hourlyRate;
    const travel = travelKm * travelRate;
    const base = labor + materialCost + travel;
    const margin = base * marginRate;
    const subtotal = base + margin; // Zwischensumme vor Rabatt
    const discount = subtotal * discountRate;
    const net = subtotal - discount;
    const vat = net * vatRate;
    const gross = net + vat;

    return {
      hours,
      hourlyRate,
      materialCost,
      travelKm,
      travelRate,
      marginRate,
      discountRate,
      vatRate,
      labor,
      travel,
      base,
      margin,
      subtotal,
      discount,
      net,
      vat,
      gross,
    };
  }, [
    calc.discountPercent,
    calc.hours,
    calc.hourlyRate,
    calc.marginPercent,
    calc.materialCost,
    calc.travelKm,
    calc.travelRate,
    calc.vatPercent,
  ]);

  const handleChange =
    (key: keyof CalcState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCalc((prev) => ({ ...prev, [key]: event.target.value }));
    };

  // --- PDF GENERATOR FUNKTION ---
  const generatePdf = () => {
    console.log("[Kalkulator] Generiere PDF v4");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const currency = calc.currency;
    const now = new Date();
    const fmt = (num: number) =>
      num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;

    // Farbpalette und Hintergrund
    const primary: [number, number, number] = [56, 189, 248]; // cyan
    const muted: [number, number, number] = [80, 90, 100];
    doc.setFillColor(248, 250, 255);
    doc.rect(0, 0, 210, 297, "F"); // heller Hintergrund für deutliche Änderung

    // Header-Leiste
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(0, 0, 210, 26, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("Kostenschaetzung v4", 12, 14);
    doc.setFontSize(9);
    doc.text(`Projekt: ${calc.jobTitle || "-"}`, 120, 9);
    doc.text(`Datum: ${now.toLocaleDateString("de-DE")}`, 120, 14);
    doc.text(`Währung: ${currency}`, 120, 19);
    doc.text(`Version: ${now.toISOString()}`, 120, 24);

    // Projektübersicht Block
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Projektübersicht", 12, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(`Stunden: ${numeric.hours} @ ${fmt(numeric.hourlyRate)}/Std.`, 12, 38);
    doc.text(`Material: ${fmt(numeric.materialCost)}`, 12, 42);
    doc.text(`Anfahrt: ${numeric.travelKm} km @ ${fmt(numeric.travelRate)}/km`, 12, 46);
    doc.text(`Marge: ${(numeric.marginRate * 100).toFixed(1)} %  |  Rabatt: ${(numeric.discountRate * 100).toFixed(1)} %  |  MwSt: ${(numeric.vatRate * 100).toFixed(1)} %`, 12, 50);

    // Haupttabelle
    autoTable(doc, {
      startY: 56,
      head: [["Position", "Beschreibung", "Betrag"]],
      body: [
        [
          "Arbeitsleistung",
          `${numeric.hours} Std. à ${fmt(numeric.hourlyRate)}/Std.`,
          fmt(numeric.labor),
        ],
        ["Material", "Pauschal / nach Aufwand", fmt(numeric.materialCost)],
        [
          "Anfahrt",
          `${numeric.travelKm} km à ${fmt(numeric.travelRate)}/km`,
          fmt(numeric.travel),
        ],
        [
          { content: "Aufschlag (Marge)", styles: { fontStyle: "italic", textColor: muted } },
          { content: `${(numeric.marginRate * 100).toFixed(1)} %`, styles: { fontStyle: "italic", textColor: muted } },
          { content: fmt(numeric.margin), styles: { fontStyle: "italic", textColor: muted } },
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: primary, textColor: 255 },
      styles: { cellPadding: 3, fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: "bold" },
        1: { cellWidth: 90 },
        2: { cellWidth: 40, halign: "right" },
      },
    });

    // Summenblock rechts
    let finalY = (doc as any).lastAutoTable.finalY + 10;
    // Hintergrundbox für Summen
    doc.setFillColor(245, 248, 255);
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.roundedRect(118, finalY - 6, 80, 38, 2, 2, "FD");
    finalY += 4;
    const addSummary = (label: string, value: string, color?: [number, number, number], bold?: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(10);
      if (color) doc.setTextColor(...color);
      doc.text(label, 125, finalY);
      doc.text(value, 195, finalY, { align: "right" });
      doc.setTextColor(0);
      finalY += 6;
    };

    addSummary("Zwischensumme:", fmt(numeric.subtotal));
    if (numeric.discount > 0) {
      addSummary(`Rabatt (${(numeric.discountRate * 100).toFixed(1)} %):`, `- ${fmt(numeric.discount)}`, [200, 70, 70]);
    }
    addSummary("Netto:", fmt(numeric.net), undefined, true);
    addSummary(`zzgl. MwSt (${calc.vatPercent}%):`, fmt(numeric.vat));
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(0.6);
    doc.line(125, finalY - 4, 195, finalY - 4);
    finalY += 2;
    addSummary("Gesamt (Brutto):", fmt(numeric.gross), primary as any, true);

    // Notizen
    finalY += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Notizen / Besonderheiten", 12, finalY);
    finalY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(calc.notes || "-", 180);
    doc.text(splitNotes, 12, finalY);

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(
      "Vorläufige Einschätzung, kein verbindliches Festpreisangebot. Tatsächliche Kosten können nach Aufmaß abweichen.",
      12,
      pageHeight - 12,
    );
    doc.text(`PDF Version ${now.toISOString()}`, 12, pageHeight - 7);

    // Wasserzeichen
    doc.setTextColor(230, 236, 245);
    doc.setFontSize(42);
    doc.setFont("helvetica", "bold");
    doc.text("ENTWURF", 105, 150, { align: "center", angle: -25 });

    doc.save(`Kostenschaetzung_v4_${calc.jobTitle.replace(/\s+/g, "_")}.pdf`);
  };

  const handleAiReview = async () => {
    if (!openAiKey) {
      setAiError("Bitte OpenAI-Key in den Einstellungen hinterlegen.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiFeedback(null);

    const payload = {
      titel: calc.jobTitle || "Projekt",
      stunden: numeric.hours,
      stundensatz: numeric.hourlyRate,
      material: numeric.materialCost,
      anfahrtKm: numeric.travelKm,
      anfahrtRate: numeric.travelRate,
      margeProzent: numeric.marginRate * 100,
      rabattProzent: numeric.discountRate * 100,
      mwstProzent: numeric.vatRate * 100,
      nettopreis: numeric.net,
      bruttopreis: numeric.gross,
      notizen: calc.notes,
    };

    const prompt = `Du bist Kalkulations-Profi im Handwerk. Prüfe Angebot auf Marge, Aufwand, Risiken.
Angebot:
${JSON.stringify(payload, null, 2)}

Antwort als kurze Bullet-Liste:
- Einschätzung: fair / knapp / Risiko
- Empfohlene Anpassungen (Satz, Material, Anfahrt, Marge)
- Hinweis zu MwSt / Rabatt
- Nächste Schritte für Kund:in
Deutsch, prägnant.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.25,
          messages: [
            {
              role: "system",
              content: "Du prüfst Handwerker-Angebote. Sei klar, kurz, deutsch, praxisnah.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI-Fehler: ${response.status}`);
      }
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("Keine Antwort von OpenAI erhalten.");
      }
      setAiFeedback(content);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Bewertung fehlgeschlagen.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">KI Tool</p>
          <h1 className="text-3xl font-semibold text-white">Handwerker-Kalkulator</h1>
          <p className="text-sm text-slate-400">
            Arbeitszeit, Material, Anfahrt & Marge durchrechnen – inkl. KI-Risiko-Check.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/workspace/messages")}>
            Zur Inbox
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,40%)_minmax(0,60%)]">
        <Card title="Eingaben" description="Projekt, Aufwand und Preise anpassen.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Projekt / Auftrag
              <Input
                className="mt-2"
                value={calc.jobTitle}
                onChange={handleChange("jobTitle")}
                placeholder="z.B. Dachsanierung"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Stunden
              <Input
                className="mt-2"
                value={calc.hours}
                onChange={handleChange("hours")}
                placeholder="z.B. 40"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Stundensatz ({calc.currency})
              <Input
                className="mt-2"
                value={calc.hourlyRate}
                onChange={handleChange("hourlyRate")}
                placeholder="z.B. 65"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Material ({calc.currency})
              <Input
                className="mt-2"
                value={calc.materialCost}
                onChange={handleChange("materialCost")}
                placeholder="z.B. 3200"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Anfahrt (km)
              <Input
                className="mt-2"
                value={calc.travelKm}
                onChange={handleChange("travelKm")}
                placeholder="z.B. 60"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Anfahrtssatz ({calc.currency}/km)
              <Input
                className="mt-2"
                value={calc.travelRate}
                onChange={handleChange("travelRate")}
                placeholder="z.B. 0.35"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Marge (%)
              <div className="mt-2 flex items-center gap-2">
                <Percent className="h-4 w-4 text-slate-500" />
                <Input
                  className="flex-1"
                  value={calc.marginPercent}
                  onChange={handleChange("marginPercent")}
                  placeholder="z.B. 12"
                />
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Rabatt (%)
              <Input
                className="mt-2"
                value={calc.discountPercent}
                onChange={handleChange("discountPercent")}
                placeholder="z.B. 5"
              />
            </label>
            <label className="block text-sm text-slate-300">
              MwSt (%)
              <Input
                className="mt-2"
                value={calc.vatPercent}
                onChange={handleChange("vatPercent")}
                placeholder="z.B. 19"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Währung
              <Input
                className="mt-2"
                value={calc.currency}
                onChange={handleChange("currency")}
                placeholder="z.B. EUR"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            Notizen / Besonderheiten
            <Textarea
              className="mt-2"
              rows={3}
              value={calc.notes}
              onChange={handleChange("notes")}
              placeholder="z.B. Aufmaß, Saisonaufschlag, Materialrisiko"
            />
          </label>
          {!openAiKey && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> OpenAI-Key fehlt. Hinterlege ihn in den
              Einstellungen.
            </p>
          )}
        </Card>

        <Card title="Ergebnis" description="Netto, MwSt. und Brutto auf einen Blick.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Arbeitskosten ({calc.currency})
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {numeric.labor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {numeric.hours}h x{" "}
                {numeric.hourlyRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Material ({calc.currency})
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {numeric.materialCost.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">Einkauf + Puffer</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Anfahrt ({calc.currency})
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {numeric.travel.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {numeric.travelKm} km x{" "}
                {numeric.travelRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Marge ({calc.currency})
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {numeric.margin.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {(numeric.marginRate * 100).toFixed(1)} % auf Basis
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Zwischensumme ({calc.currency})
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                {numeric.subtotal.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">inkl. Marge, vor Rabatt</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Rabatt ({calc.currency})
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                -{numeric.discount.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                ({(numeric.discountRate * 100).toFixed(1)} %)
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Netto ({calc.currency})
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {numeric.net.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">nach Rabatt</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                MwSt ({calc.currency})
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {numeric.vat.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                @ {(numeric.vatRate * 100).toFixed(1)} %
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Brutto ({calc.currency})
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {numeric.gross.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Hammer className="h-4 w-4" /> {calc.jobTitle || "Projekt"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <BadgeEuro className="h-4 w-4" /> Rabatt {(numeric.discountRate * 100).toFixed(1)} %
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Percent className="h-4 w-4" /> Marge {(numeric.marginRate * 100).toFixed(1)} %
            </span>
          </div>
          
          {/* ACTION BUTTONS */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={generatePdf}>
                <FileDown className="mr-2 h-4 w-4" /> PDF Export (v4)
            </Button>

            <Button type="button" variant="secondary" onClick={() => void handleAiReview()} disabled={aiLoading}>
              {aiLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              KI-Check & Empfehlung
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAiFeedback(null);
                setAiError(null);
              }}
            >
              Reset Feedback
            </Button>
          </div>

          {aiError && (
            <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {aiError}
            </p>
          )}
          {aiFeedback && (
            <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">KI Feedback</p>
              <p className="whitespace-pre-line">{aiFeedback}</p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
