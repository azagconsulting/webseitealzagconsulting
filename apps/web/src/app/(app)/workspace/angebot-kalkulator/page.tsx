"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertTriangle,
  BadgeEuro,
  Brain,
  Calculator,
  CheckCircle2,
  FileDown,
  Hammer,
  Loader2,
  Percent,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-provider";
import { useOpenAiKey } from "@/hooks/use-openai-key";
import type { WorkspaceSettings } from "@/lib/types";

type CalcState = {
  packageName: string;
  seats: string;
  pricePerSeat: string;
  setupFee: string;
  discountPercent: string;
  termMonths: string;
  currency: string;
  customCosts: string;
  notes: string;
};

type CraftState = {
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
  packageName: "Pro",
  seats: "25",
  pricePerSeat: "79",
  setupFee: "1200",
  discountPercent: "10",
  termMonths: "12",
  currency: "EUR",
  customCosts: "",
  notes: "Early Access Rabatt gültig bis EoM.",
};

const defaultCraft: CraftState = {
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

export default function OfferCalculatorPage() {
  const router = useRouter();
  const { authorizedRequest, loading: authLoading, user } = useAuth();
  const { openAiKey } = useOpenAiKey();
  const [mode, setMode] = useState<"saas" | "craft">("saas");
  const [calc, setCalc] = useState<CalcState>(defaultState);
  const [craft, setCraft] = useState<CraftState>(defaultCraft);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    void fetchWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const fetchWorkspaceData = async () => {
    if (authLoading) return;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    const controller = new AbortController();
    try {
      const data = await authorizedRequest<WorkspaceSettings | null>("/settings/workspace", {
        signal: controller.signal,
      });
      setWorkspace(data ?? null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : "Workspace-Daten konnten nicht geladen werden.");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const numeric = useMemo(() => {
    const seats = Number.parseFloat(calc.seats) || 0;
    const pricePerSeat = Number.parseFloat(calc.pricePerSeat) || 0;
    const setupFee = Number.parseFloat(calc.setupFee) || 0;
    const discountRate = Math.min(Math.max(Number.parseFloat(calc.discountPercent) || 0, 0), 100) / 100;
    const termMonths = Math.max(1, Number.parseInt(calc.termMonths || "1", 10));
    const customCosts = Number.parseFloat(calc.customCosts) || 0;

    const recurring = seats * pricePerSeat;
    const recurringDiscounted = recurring * (1 - discountRate);
    const mrr = recurringDiscounted;
    const tcv = recurringDiscounted * termMonths + setupFee + customCosts;
    const arr = mrr * 12;

    return { seats, pricePerSeat, setupFee, discountRate, termMonths, customCosts, recurring, recurringDiscounted, mrr, arr, tcv };
  }, [calc.customCosts, calc.discountPercent, calc.pricePerSeat, calc.seats, calc.setupFee, calc.termMonths]);

  const craftNumeric = useMemo(() => {
    const hours = Number.parseFloat(craft.hours) || 0;
    const hourlyRate = Number.parseFloat(craft.hourlyRate) || 0;
    const materialCost = Number.parseFloat(craft.materialCost) || 0;
    const travelKm = Number.parseFloat(craft.travelKm) || 0;
    const travelRate = Number.parseFloat(craft.travelRate) || 0;
    const marginRate = Math.min(Math.max(Number.parseFloat(craft.marginPercent) || 0, 0), 100) / 100;
    const discountRate = Math.min(Math.max(Number.parseFloat(craft.discountPercent) || 0, 0), 100) / 100;
    const vatRate = Math.min(Math.max(Number.parseFloat(craft.vatPercent) || 0, 0), 100) / 100;

    const labor = hours * hourlyRate;
    const travel = travelKm * travelRate;
    const base = labor + materialCost + travel;
    const margin = base * marginRate;
    const subtotal = base + margin;
    const discount = subtotal * discountRate;
    const net = subtotal - discount;
    const vat = net * vatRate;
    const gross = net + vat;

    return { hours, hourlyRate, materialCost, travelKm, travelRate, marginRate, discountRate, vatRate, labor, travel, base, margin, subtotal, discount, net, vat, gross };
  }, [craft.discountPercent, craft.hours, craft.hourlyRate, craft.marginPercent, craft.materialCost, craft.travelKm, craft.travelRate, craft.vatPercent]);

  const handleAiReview = async () => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiFeedback(null);

    const payload =
      mode === "saas"
        ? {
            package: calc.packageName || "Unbenannt",
            seats: numeric.seats,
            pricePerSeat: numeric.pricePerSeat,
            setupFee: numeric.setupFee,
            discountPercent: Number.parseFloat(calc.discountPercent) || 0,
            termMonths: numeric.termMonths,
            customCosts: numeric.customCosts,
            notes: calc.notes,
            totals: {
              mrr: numeric.mrr,
              arr: numeric.arr,
              tcv: numeric.tcv,
            },
          }
        : {
            titel: craft.jobTitle || "Projekt",
            stunden: craftNumeric.hours,
            stundensatz: craftNumeric.hourlyRate,
            material: craftNumeric.materialCost,
            anfahrtKm: craftNumeric.travelKm,
            anfahrtRate: craftNumeric.travelRate,
            margeProzent: craftNumeric.marginRate * 100,
            rabattProzent: craftNumeric.discountRate * 100,
            mwstProzent: craftNumeric.vatRate * 100,
            netto: craftNumeric.net,
            brutto: craftNumeric.gross,
            notizen: craft.notes,
          };

    const prompt =
      mode === "saas"
        ? `Du bist Deal Desk & Finance. Prüfe das Angebot, finde Risiken und schlage konkrete Anpassungen vor.
Angebot:
${JSON.stringify(payload, null, 2)}

Gib eine knappe Bullet-Liste mit:
- Go/No-Go Empfehlung
- Risiken (Pricing, Marge, Laufzeit)
- Empfohlene Rabatte oder Mindestpreise
- Nächste Schritte für den Vertrieb
Antworte auf Deutsch.`
        : `Du bist Kalkulations-Profi im Handwerk. Prüfe Angebot auf Marge, Aufwand, Risiken.
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
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: "Du unterstützt Vertrieb mit Angebotskalkulationen. Sei konkret, prägnant, deutsch.",
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
      setAiError(err instanceof Error ? err.message : "KI-Auswertung fehlgeschlagen.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleChange = (key: keyof CalcState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCalc((prev) => ({ ...prev, [key]: event.target.value }));
  };
  const handleCraftChange = (key: keyof CraftState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCraft((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const buildCraftPdfHtml = (customer?: { name?: string; address?: string; email?: string; phone?: string }) => {
    const companyName = workspace?.companyName || workspace?.legalName || "Dein Unternehmen";
    const companyAddress = [
      workspace?.address?.street,
      workspace?.address?.postalCode,
      workspace?.address?.city,
      workspace?.address?.country,
    ]
      .filter(Boolean)
      .join(" · ");
    const contactLine = [workspace?.supportEmail, workspace?.supportPhone].filter(Boolean).join(" · ");
    const legalLine = [workspace?.vatNumber ? `USt-Id: ${workspace.vatNumber}` : "", workspace?.registerNumber ? `HRB: ${workspace.registerNumber}` : ""]
      .filter(Boolean)
      .join(" · ");
    const customerLine = [customer?.name, customer?.address].filter(Boolean).join(" · ");
    const customerContact = [customer?.email, customer?.phone].filter(Boolean).join(" · ");
    const createdBy =
      (user?.firstName || user?.lastName) ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() : user?.email ?? "Arcto Team";

    const timestamp = new Date().toLocaleString("de-DE");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Kostenvoranschlag</title>
  <style>
    body { font-family: "Inter", system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #0d121c; color: #e3e8ef; }
    .card { background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
    h1 { margin: 0 0 6px 0; font-size: 20px; color: #f8fafc; }
    h2 { margin: 8px 0 4px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.16em; color: #cbd5e1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.08); margin-right: 8px; margin-top: 4px; font-size: 11px; color: #e2e8f0; }
    .label { font-size: 10px; letter-spacing: 0.16em; color: #a1acc4; text-transform: uppercase; }
    .value { font-size: 18px; font-weight: 700; margin-top: 2px; color: #f8fafc; }
    .muted { color: #a1acc4; font-size: 11px; margin-top: 3px; }
    .divider { height: 1px; background-color: rgba(255,255,255,0.28); margin: 8px 0; border: none; }
    .panel { background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.14); border-radius: 10px; padding: 10px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
      <div>
        <div class="muted">${companyName}${companyAddress ? " · " + companyAddress : ""}</div>
        <div class="muted">${contactLine || ""}</div>
        ${legalLine ? `<div class="muted">${legalLine}</div>` : ""}
        ${companyAddress ? `<div class="muted">Unternehmensadresse: ${companyAddress}</div>` : ""}
      </div>
    </div>
    ${customerLine || customerContact ? `<div style="margin-top:14px;">
      <h2 style="margin:6px 0 2px 0;">Kunde</h2>
      <div class="muted">${customerLine || "Keine Kundendaten"}</div>
      ${customerContact ? `<div class="muted">${customerContact}</div>` : ""}
      <div class="muted" style="margin-top:4px;">Auftrag: ${craft.jobTitle || "Projekt"}</div>
    </div>` : ""}
    <div class="divider"></div>
  </div>

    <div class="card">
    <h2>Auftrag</h2>
    <div class="grid">
        <div class="label" style="display:inline-flex; margin-bottom:6px;">${craft.jobTitle || "Projekt"}</div>
    </div>
  </div>

  <div class="card">
    <h2>Zusammenfassung</h2>
    <div class="grid">
      <div>
        <p class="label">Arbeitskosten</p>
        <p class="value">${craftNumeric.labor.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
        <p class="muted">${craftNumeric.hours}h x ${craftNumeric.hourlyRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
      </div>
      <div>
        <p class="label">Material</p>
        <p class="value">${craftNumeric.materialCost.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
      </div>
      <div>
        <p class="label">Anfahrt</p>
        <p class="value">${craftNumeric.travel.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
        <p class="muted">${craftNumeric.travelKm} km x ${craftNumeric.travelRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Gesamt</h2>
    <div class="grid">
      <div>
        <p class="label">Zwischensumme</p>
        <p class="value">${craftNumeric.subtotal.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
        <p class="muted">inkl. Marge, vor Rabatt</p>
      </div>
      <div>
        <p class="label">Rabatt</p>
        <p class="value">-${craftNumeric.discount.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
        <p class="muted">${(craftNumeric.discountRate * 100).toFixed(1)} %</p>
      </div>
      <div>
        <p class="label">Netto</p>
        <p class="value">${craftNumeric.net.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
      </div>
      <div>
        <p class="label">MwSt</p>
        <p class="value">${craftNumeric.vat.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
        <p class="muted">@ ${(craftNumeric.vatRate * 100).toFixed(1)} %</p>
      </div>
    </div>
    <div style="margin-top:12px; padding:14px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.08);">
      <p class="label">Brutto</p>
      <p class="value">${craftNumeric.gross.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${craft.currency}</p>
    </div>
  </div>

  <div class="card">
    <h2>Hinweise</h2>
    <p class="muted">${craft.notes ? craft.notes : "Keine zusätzlichen Hinweise hinterlegt."}</p>
    <div class="divider"></div>
    <div class="panel">
      <p class="muted">Dies ist ein vorläufiger Kostenvoranschlag. Der Endpreis kann abweichen, gibt aber eine gute Annäherung an die erwarteten Kosten.</p>
    </div>
  </div>
  <div class="muted" style="margin-top:6px; font-size:10px;">Erstellt von ${createdBy} · Stand: ${timestamp}</div>
</body>
</html>`;
  };

  const handleCraftPdfExport = async () => {
    if (!workspace && !workspaceLoading) {
      await fetchWorkspaceData();
    }

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const now = new Date();
    const currency = craft.currency;
    const company =
      workspace?.companyName ||
      workspace?.legalName ||
      "Ihre Firma";
    const fmt = (num: number) =>
      num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
    const primary: [number, number, number] = [56, 189, 248];
    const muted: [number, number, number] = [90, 100, 110];

    // Hintergrund
    doc.setFillColor(248, 250, 255);
    doc.rect(0, 0, 210, 297, "F");

    // Header
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(0, 0, 210, 28, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("Ungefähre Ersteinschätzung", 12, 13);
    doc.setFontSize(9);
    doc.text(`Projekt: ${craft.jobTitle || "-"}`, 120, 9);
    doc.text(`Datum: ${now.toLocaleDateString("de-DE")}`, 120, 14);
    doc.text(`Währung: ${currency}`, 120, 19);
    doc.text(`Firma: ${company}`, 12, 23);

    // Kundendaten (optional)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("Kunde / Firma", 12, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(customerName || "–", 12, 36);
    doc.text(customerAddress || "–", 12, 40);
    doc.text(customerEmail || "–", 12, 44);
    doc.text(customerPhone || "–", 12, 48);

    // Projektübersicht
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Projektübersicht", 12, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(`Stunden: ${craftNumeric.hours} @ ${fmt(craftNumeric.hourlyRate)}/Std.`, 12, 64);
    doc.text(`Material: ${fmt(craftNumeric.materialCost)}`, 12, 68);
    doc.text(`Anfahrt: ${craftNumeric.travelKm} km @ ${fmt(craftNumeric.travelRate)}/km`, 12, 72);
    doc.text(`Rabatt: ${(craftNumeric.discountRate * 100).toFixed(1)} %  |  MwSt: ${(craftNumeric.vatRate * 100).toFixed(1)} %`, 12, 76);

    // Tabelle
    autoTable(doc, {
      startY: 82,
      head: [["Position", "Beschreibung", "Betrag"]],
      body: [
        ["Arbeitsleistung", `${craftNumeric.hours} Std. à ${fmt(craftNumeric.hourlyRate)}/Std.`, fmt(craftNumeric.labor)],
        ["Material", "Pauschal / nach Aufwand", fmt(craftNumeric.materialCost)],
        ["Anfahrt", `${craftNumeric.travelKm} km à ${fmt(craftNumeric.travelRate)}/km`, fmt(craftNumeric.travel)],
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

    // Summenblock
    let finalY = (doc as any).lastAutoTable.finalY + 10;
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
    addSummary("Zwischensumme:", fmt(craftNumeric.subtotal));
    if (craftNumeric.discount > 0) {
      addSummary(`Rabatt (${(craftNumeric.discountRate * 100).toFixed(1)} %):`, `- ${fmt(craftNumeric.discount)}`, [200, 70, 70]);
    }
    addSummary("Netto:", fmt(craftNumeric.net), undefined, true);
    addSummary(`zzgl. MwSt (${craft.vatPercent}%):`, fmt(craftNumeric.vat));
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(0.6);
    doc.line(125, finalY - 4, 195, finalY - 4);
    finalY += 2;
    addSummary("Gesamt (Brutto):", fmt(craftNumeric.gross), primary as any, true);

    // Notizen
    finalY += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Notizen / Besonderheiten", 12, finalY);
    finalY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(craft.notes || "-", 180);
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
    doc.text(`PDF v4 ${now.toISOString()}`, 12, pageHeight - 7);

    doc.save(`Kostenvoranschlag_v4_${craft.jobTitle.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">KI Tool</p>
          <h1 className="text-3xl font-semibold text-white">Angebotskalkulator</h1>
          <p className="text-sm text-slate-400">Rechne SaaS-Deals oder Handwerksprojekte – inkl. KI-Risiko-Check.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/workspace/messages")}>
            Zur Inbox
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setMode("saas")}
          className={`${mode === "saas" ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10"} flex-1 rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2`}
        >
          <Calculator className="h-4 w-4" /> SaaS Kalkulator
        </button>
        <button
          type="button"
          onClick={() => setMode("craft")}
          className={`${mode === "craft" ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10"} flex-1 rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2`}
        >
          <Hammer className="h-4 w-4" /> Handwerk Kalkulator
        </button>
      </div>

      {mode === "saas" ? (
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,40%)_minmax(0,60%)]">
        <Card title="Eingaben" description="Pakete, Mengen und Rabatte festlegen.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Paket
              <Input className="mt-2" value={calc.packageName} onChange={handleChange("packageName")} placeholder="z.B. Pro, Enterprise" />
            </label>
            <label className="block text-sm text-slate-300">
              Seats
              <Input className="mt-2" value={calc.seats} onChange={handleChange("seats")} placeholder="z.B. 25" />
            </label>
            <label className="block text-sm text-slate-300">
              Preis pro Seat ({calc.currency})
              <Input className="mt-2" value={calc.pricePerSeat} onChange={handleChange("pricePerSeat")} placeholder="z.B. 79" />
            </label>
            <label className="block text-sm text-slate-300">
              Setup ({calc.currency})
              <Input className="mt-2" value={calc.setupFee} onChange={handleChange("setupFee")} placeholder="z.B. 1200" />
            </label>
            <label className="block text-sm text-slate-300">
              Rabatt (%)
              <div className="mt-2 flex items-center gap-2">
                <Percent className="h-4 w-4 text-slate-500" />
                <Input className="flex-1" value={calc.discountPercent} onChange={handleChange("discountPercent")} placeholder="z.B. 10" />
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Laufzeit (Monate)
              <Input className="mt-2" value={calc.termMonths} onChange={handleChange("termMonths")} placeholder="z.B. 12" />
            </label>
            <label className="block text-sm text-slate-300">
              Zusatzkosten ({calc.currency})
              <Input className="mt-2" value={calc.customCosts} onChange={handleChange("customCosts")} placeholder="z.B. 500" />
            </label>
            <label className="block text-sm text-slate-300">
              Währung
              <Input className="mt-2" value={calc.currency} onChange={handleChange("currency")} placeholder="EUR oder USD" />
            </label>
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            Notizen / Kontext
            <Textarea className="mt-2" rows={3} value={calc.notes} onChange={handleChange("notes")} placeholder="z.B. Deal-Info, Kompensation, Sonderkonditionen" />
          </label>
          {!openAiKey && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> OpenAI-Key fehlt. Hinterlege ihn in den Einstellungen.
            </p>
          )}
        </Card>

        <Card title="Zusammenfassung" description="Automatisch berechnete Kennzahlen.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">MRR ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.mrr.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">Seats x Preis x (1 - Rabatt)</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">ARR ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.arr.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">MRR x 12</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">TCV ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.tcv.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">ARR/Laufzeit + Setup + Zusatzkosten</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Listen-MRR ({calc.currency})</p>
              <p className="mt-2 text-xl font-semibold text-white">{numeric.recurring.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">Vor Rabatt</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <BadgeEuro className="h-4 w-4" /> Rabatt: {(numeric.discountRate * 100).toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <TrendingUp className="h-4 w-4" /> Laufzeit: {numeric.termMonths} Monate
            </span>
            {numeric.customCosts ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                <Calculator className="h-4 w-4" /> Zusatz: {numeric.customCosts.toLocaleString("de-DE", { maximumFractionDigits: 2 })} {calc.currency}
              </span>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleAiReview()} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />} KI-Check & Empfehlung
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
      ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,40%)_minmax(0,60%)]">
        <Card title="Eingaben" description="Projekt, Aufwand und Preise anpassen.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Projekt / Auftrag
              <Input className="mt-2" value={craft.jobTitle} onChange={handleCraftChange("jobTitle")} placeholder="z.B. Dachsanierung" />
            </label>
            <label className="block text-sm text-slate-300">
              Stunden
              <Input className="mt-2" value={craft.hours} onChange={handleCraftChange("hours")} placeholder="z.B. 40" />
            </label>
            <label className="block text-sm text-slate-300">
              Stundensatz ({craft.currency})
              <Input className="mt-2" value={craft.hourlyRate} onChange={handleCraftChange("hourlyRate")} placeholder="z.B. 65" />
            </label>
            <label className="block text-sm text-slate-300">
              Material ({craft.currency})
              <Input className="mt-2" value={craft.materialCost} onChange={handleCraftChange("materialCost")} placeholder="z.B. 3200" />
            </label>
            <label className="block text-sm text-slate-300">
              Anfahrt (km)
              <Input className="mt-2" value={craft.travelKm} onChange={handleCraftChange("travelKm")} placeholder="z.B. 60" />
            </label>
            <label className="block text-sm text-slate-300">
              Anfahrtssatz ({craft.currency}/km)
              <Input className="mt-2" value={craft.travelRate} onChange={handleCraftChange("travelRate")} placeholder="z.B. 0.35" />
            </label>
            <label className="block text-sm text-slate-300">
              Marge (%)
              <div className="mt-2 flex items-center gap-2">
                <Percent className="h-4 w-4 text-slate-500" />
                <Input className="flex-1" value={craft.marginPercent} onChange={handleCraftChange("marginPercent")} placeholder="z.B. 12" />
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Rabatt (%)
              <Input className="mt-2" value={craft.discountPercent} onChange={handleCraftChange("discountPercent")} placeholder="z.B. 5" />
            </label>
            <label className="block text-sm text-slate-300">
              MwSt (%)
              <Input className="mt-2" value={craft.vatPercent} onChange={handleCraftChange("vatPercent")} placeholder="z.B. 19" />
            </label>
            <label className="block text-sm text-slate-300">
              Währung
              <Input className="mt-2" value={craft.currency} onChange={handleCraftChange("currency")} placeholder="z.B. EUR" />
            </label>
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            Notizen / Besonderheiten
            <Textarea className="mt-2" rows={3} value={craft.notes} onChange={handleCraftChange("notes")} placeholder="z.B. Aufmaß, Saisonaufschlag, Materialrisiko" />
          </label>
          {!openAiKey && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> OpenAI-Key fehlt. Hinterlege ihn in den Einstellungen.
            </p>
          )}
        </Card>

        <Card title="Ergebnis" description="Netto, MwSt. und Brutto auf einen Blick.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Arbeitskosten ({craft.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{craftNumeric.labor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">{craftNumeric.hours}h x {craftNumeric.hourlyRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Material ({craft.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{craftNumeric.materialCost.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">Einkauf + Puffer</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Anfahrt ({craft.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{craftNumeric.travel.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">{craftNumeric.travelKm} km x {craftNumeric.travelRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Marge ({craft.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{craftNumeric.margin.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">{(craftNumeric.marginRate * 100).toFixed(1)} % auf Basis</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Zwischensumme ({craft.currency})</p>
              <p className="mt-2 text-xl font-semibold text-white">{craftNumeric.subtotal.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">inkl. Marge, vor Rabatt</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Rabatt ({craft.currency})</p>
              <p className="mt-2 text-xl font-semibold text-white">-{craftNumeric.discount.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">({(craftNumeric.discountRate * 100).toFixed(1)} %)</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Netto ({craft.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{craftNumeric.net.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">nach Rabatt</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">MwSt ({craft.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{craftNumeric.vat.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">@ {(craftNumeric.vatRate * 100).toFixed(1)} %</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Brutto ({craft.currency})</p>
            <p className="mt-2 text-3xl font-semibold text-white">{craftNumeric.gross.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Hammer className="h-4 w-4" /> {craft.jobTitle || "Projekt"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <BadgeEuro className="h-4 w-4" /> Rabatt {(craftNumeric.discountRate * 100).toFixed(1)} %
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Percent className="h-4 w-4" /> Marge {(craftNumeric.marginRate * 100).toFixed(1)} %
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleAiReview()} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} KI-Check & Empfehlung
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPersonalizeOpen(true)}
            >
              <FileDown className="h-4 w-4" /> PDF Export
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
      )}

      {personalizeOpen ? (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Kostenvoranschlag</p>
                <h2 className="text-lg font-semibold text-white">Möchtest du personalisieren?</h2>
                <p className="text-sm text-slate-400">Kundendaten werden im PDF Header angezeigt.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPersonalizeOpen(false)}>
                Schließen
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-300">
                Kunde / Firma
                <Input className="mt-1.5" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="z.B. Müller Bau GmbH" />
              </label>
              <label className="block text-sm text-slate-300">
                Adresse
                <Input className="mt-1.5" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Straße, PLZ Ort" />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  E-Mail
                  <Input className="mt-1.5" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="kunde@example.com" />
                </label>
                <label className="block text-sm text-slate-300">
                  Telefon
                  <Input className="mt-1.5" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+49 ..." />
                </label>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setPersonalizeOpen(false);
                  void handleCraftPdfExport();
                }}
              >
                Exportieren
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCustomerName("");
                  setCustomerAddress("");
                  setCustomerEmail("");
                  setCustomerPhone("");
                  setPersonalizeOpen(false);
                  void handleCraftPdfExport();
                }}
              >
                Ohne Personalisierung
              </Button>
              <Button variant="ghost" onClick={() => setPersonalizeOpen(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
