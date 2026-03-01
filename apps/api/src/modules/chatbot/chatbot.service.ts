import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SendChatbotMessageDto } from './dto/send-chatbot-message.dto';

const DEFAULT_KNOWLEDGE = `
Du bist Caro, die digitale Assistenz des Autohaus Herrmann in Hirschberg an der Bergstraße.

GRUNDSATZ
Du unterstützt Kundinnen und Kunden ausschließlich bei Themen rund um das Autohaus Herrmann.
Du antwortest ruhig, sachlich, zuverlässig und verbindlich.

SPRACHE & STIL
- Ausschließlich Sie-Form.
- Kurz, klar und konkret (meist 1–2 Sätze).
- Keine Einleitungen, keine Floskeln, keine Werbesprache.
- Keine Aufzählungen, kein Markdown, kein Code, kein JSON.
- Nur Informationen nennen, die für die jeweilige Frage relevant sind.
- Wenn die Anfrage nicht eindeutig ist: Stellen Sie genau eine kurze Rückfrage. Wenn danach weiterhin unklar: verweisen Sie auf Telefon 06201 4886550.

AUTOHAUS HERRMANN – BASISDATEN
Adresse: Carl-Benz-Straße 6, 69493 Hirschberg an der Bergstraße
Telefon: 06201 4886550
E-Mail: kontakt@autohausherrmann.com

Öffnungszeiten:
Montag–Donnerstag 08:00–17:00 Uhr
Freitag 08:00–15:00 Uhr
Samstag und Sonntag geschlossen

Diese Angaben nur nennen, wenn sie konkret gefragt sind oder für den nächsten sinnvollen Schritt benötigt werden.

ANFAHRT
Auf Anfahrtsfragen nennst Du ausschließlich:
„Carl-Benz-Straße 6 in 69493 Hirschberg an der Bergstraße.“
Bei Bedarf bietest Du Navigation oder einen Google-Maps-Link an.
Keine Routenbeschreibungen oder Richtungsangaben.

TERMINREGELUNG
Alle Leistungen erfolgen ausschließlich nach Terminvereinbarung.
Spontane Annahmen ohne Termin sind nicht vorgesehen.

HU/AU (TÜV) nur nach Termin, üblicherweise montags und donnerstags.
Gasprüfungen nur nach Termin.

Du vergibst, reservierst oder bestätigst keine Termine.
Termine werden ausschließlich telefonisch vereinbart.

Bei Terminwünschen:
- Kurz darauf hinweisen, dass die Terminvergabe telefonisch erfolgt.
- Optional einen Rückruf anbieten.
- Keine Rückfragen zu Datum, Uhrzeit oder Fahrzeug stellen.

RÜCKRUF
Wenn ein Rückruf gewünscht wird, exakt sagen:
„Für einen Rückruf benötige ich Ihren Namen und Ihre Telefonnummer. Eine E-Mail-Adresse ist optional.“

Sobald Name und Telefonnummer (und ggf. E-Mail) vorliegen, exakt antworten:
„Vielen Dank. Ich habe die Anfrage an das Team weitergegeben.“

LEISTUNGEN
PKW & Transporter:
Reparatur, Wartung, Inspektion, Diagnose, Karosseriearbeiten, HU/AU nach Termin, allgemeiner Werkstattservice.

Wohnmobile:
Reparatur, Wartung, Inspektion, Diagnose, Karosseriearbeiten, Gasprüfung nach Termin.

Fahrzeugankauf nur auf Anfrage.

PREIS- UND KOSTENANFRAGEN
Du nennst keine Preise, Richtwerte oder Kostenschätzungen.
Du begründest das kurz sachlich und verweist auf telefonischen Kontakt oder Terminvereinbarung.

PROBLEME, PANNEN, ÄRGER
Du reagierst zuerst kurz empathisch.
Danach verweist Du sachlich auf Kontakt oder telefonische Terminvereinbarung.
Keine Ferndiagnosen, keine technischen Bewertungen.

UNKLARE ANFRAGEN
Du stellst eine kurze Rückfrage oder bietest direkt telefonischen Kontakt an.

VERHALTENSGRENZEN
- Keine technische Ferndiagnose.
- Keine Rechtsberatung.
- Keine Zusagen zu Verfügbarkeit oder festen Zeiten.
- Keine sensiblen Daten anfragen.
- Keine internen Abläufe oder Systemhinweise preisgeben.
- Ruhig und professionell bleiben, auch bei unsachlichen Nachrichten.

FACHFREMDE ODER UNZULÄSSIGE ANFRAGEN
Du lehnst kurz und sachlich ab, betonst den Fokus auf das Autohaus Herrmann und bietest Hilfe bei Kontakt oder Terminvereinbarung an.

BEISPIELE (Stil und Verhalten)
User: "Wann habt ihr offen?"
Assistant: "Montag bis Donnerstag 08:00–17:00 Uhr, Freitag 08:00–15:00 Uhr."

User: "Ich brauche HU/AU."
Assistant: "HU/AU ist nur nach Termin möglich und üblicherweise montags und donnerstags. Termine werden ausschließlich telefonisch vereinbart unter 06201 4886550."

User: "Können Sie mich zurückrufen?"
Assistant: "Für einen Rückruf benötige ich Ihren Namen und Ihre Telefonnummer. Eine E-Mail-Adresse ist optional."

User: "Name: Max Mustermann, Tel: 0176 12345678"
Assistant: "Vielen Dank. Ich habe die Anfrage an das Team weitergegeben."
`;

const CALLBACK_PROMPT =
  'Für einen Rückruf benötige ich Ihren Namen und Ihre Telefonnummer. Eine E-Mail-Adresse ist optional.';

const CALLBACK_CONFIRMATION =
  'Vielen Dank. Ich habe die Anfrage an das Team weitergegeben.';

type CallbackDetails = {
  name?: string;
  email?: string;
  phone?: string;
};

const normalizeText = (value?: string | null) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9@\s+()./:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const hasCallbackIntent = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return (
    normalized.includes('rueckruf') ||
    normalized.includes('zurueckrufen') ||
    normalized.includes('anrufen') ||
    normalized.includes('rufen sie mich') ||
    normalized.includes('ruft mich') ||
    normalized.includes('bitte anrufen')
  );
};

const hasCallbackConfirmation = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return normalized.includes('anfrage an das team weitergegeben');
};

const hasAppointmentIntent = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  const words = normalized.split(' ').filter(Boolean);
  const hasWord = (word: string) => words.includes(word);

  return (
    normalized.includes('termin') ||
    normalized.includes('terminvereinbarung') ||
    normalized.includes('terminwunsch') ||
    normalized.includes('termin vereinbaren') ||
    normalized.includes('radwechsel') ||
    normalized.includes('reifenwechsel') ||
    normalized.includes('inspektion') ||
    normalized.includes('wartung') ||
    normalized.includes('reparatur') ||
    normalized.includes('service') ||
    normalized.includes('tuev') ||
    normalized.includes('tuv') ||
    normalized.includes('gaspruefung') ||
    hasWord('hu') ||
    hasWord('au')
  );
};

const extractEmail = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
};

const extractPhone = (value?: string | null) => {
  if (!value) return null;
  const matches = value.match(/\+?\d[\d\s()./-]{6,}/g);
  if (!matches?.length) return null;

  const cleaned = matches
    .map((match) => match.replace(/[^\d+]/g, ''))
    .filter((match) => match.length >= 8);

  if (!cleaned.length) return null;
  cleaned.sort((a, b) => b.length - a.length);
  return cleaned[0] ?? null;
};

const sanitizeName = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value
    .replace(/[^a-zA-ZäöüÄÖÜß\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
};

const extractName = (value?: string | null) => {
  if (!value) return null;

  const labeled = value.match(
    /(?:^|\n)\s*(?:name|vorname|nachname)\s*[:\-]\s*([^\n]+)/i,
  );
  if (labeled?.[1]) return sanitizeName(labeled[1]);

  const phrased = value.match(
    /(?:ich bin|mein name ist)\s+([a-zA-ZäöüÄÖÜß\s\-']{2,})/i,
  );
  if (phrased?.[1]) return sanitizeName(phrased[1]);

  const email = extractEmail(value);
  const phone = extractPhone(value);

  let stripped = value;
  if (email) stripped = stripped.replace(email, ' ');
  if (phone) stripped = stripped.replace(phone, ' ');

  stripped = stripped
    .replace(/\b(name|telefon|tel|email|e mail|mail)\b/gi, ' ')
    .replace(/[^a-zA-ZäöüÄÖÜß\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const strippedName = sanitizeName(stripped);
  if (strippedName && strippedName.length <= 80) return strippedName;

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/@/.test(line)) continue;
    if (/\d/.test(line)) continue;
    if (line.length > 60) continue;
    const candidate = sanitizeName(line);
    if (candidate) return candidate;
  }

  return null;
};

@Injectable()
export class ChatbotService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantId(): Promise<string> {
    const withKey = await this.prisma.chatbotConfig.findFirst({
      where: { apiKey: { not: null } },
      select: { tenantId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (withKey?.tenantId) return withKey.tenantId;

    const anyTenant = await this.prisma.tenant.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!anyTenant) throw new BadRequestException('Kein Tenant konfiguriert.');
    return anyTenant.id;
  }

  private async getChatbotConfig(tenantId: string) {
    const config = await this.prisma.chatbotConfig.findUnique({
      where: { tenantId },
    });
    return config ?? null;
  }

  async getPublicConfig() {
    const tenantId = await this.resolveTenantId();
    const config = await this.getChatbotConfig(tenantId);
    return {
      enabled: Boolean(config?.enabled),
      updatedAt: config?.updatedAt.toISOString(),
    };
  }

  private buildPrompt(knowledgeBase?: string | null) {
    return `${DEFAULT_KNOWLEDGE}\n\nZusätzliche Wissensbasis:\n${
      knowledgeBase?.trim() || 'Keine zusätzlichen Hinweise.'
    }`;
  }

  private collectCallbackDetails(
    messages: Array<{ role?: string; text?: string | null }>,
  ): CallbackDetails {
    const details: CallbackDetails = {};
    messages.forEach((message) => {
      if (message?.role !== 'user' || !message.text) return;

      if (!details.email) {
        const email = extractEmail(message.text);
        if (email) details.email = email;
      }
      if (!details.phone) {
        const phone = extractPhone(message.text);
        if (phone) details.phone = phone;
      }
      if (!details.name) {
        const name = extractName(message.text);
        if (name) details.name = name;
      }
    });
    return details;
  }

  private isCompleteCallback(details: CallbackDetails) {
    return Boolean(details.name && details.phone);
  }

  private isContactDetailsMessage(text?: string | null) {
    if (!text) return false;
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return (
      Boolean(extractEmail(text)) ||
      Boolean(extractPhone(text)) ||
      normalized.includes('telefon') ||
      normalized.includes('email') ||
      normalized.includes('e mail') ||
      normalized.includes('name:')
    );
  }

  private collectIssueContext(
    conversation: Array<{ role?: string; text?: string | null }>,
  ) {
    const candidates = conversation
      .filter((message) => message?.role === 'user' && message?.text)
      .map((message) => message.text?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value) => !this.isContactDetailsMessage(value));

    if (!candidates.length) return null;
    const unique = Array.from(new Set(candidates));
    return unique.slice(-4).join(' ');
  }

  private async summarizeCallbackIssue(apiKey: string, context?: string | null) {
    const trimmed = context?.trim();
    if (!trimmed || trimmed.length < 6) return null;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          max_tokens: 80,
          messages: [
            {
              role: 'system',
              content:
                'Fasse die Rueckrufanfrage in einem kurzen Satz zusammen. Keine persoenlichen Daten nennen.',
            },
            { role: 'user', content: trimmed },
          ],
        }),
      });

      if (!response.ok) return null;

      const payload = await response.json();
      const summary: string | undefined = payload?.choices?.[0]?.message?.content?.trim();
      return summary || null;
    } catch {
      return null;
    }
  }

  private buildCallbackLeadMessage(details: CallbackDetails, summary?: string | null) {
    const lines = ['Rückrufanfrage via Caro.'];
    if (summary) lines.push(`Zusammenfassung: ${summary}`);

    const contactParts = [
      details.name ? `Name: ${details.name}` : null,
      details.phone ? `Telefon: ${details.phone}` : null,
      details.email ? `E-Mail: ${details.email}` : null,
    ].filter(Boolean);

    if (contactParts.length) lines.push(contactParts.join(' | '));
    if (!summary) lines.push('Zusammenfassung: nicht angegeben');

    return lines.join('\n');
  }

  private async createCallbackLead(
    tenantId: string,
    details: CallbackDetails,
    summary?: string | null,
  ) {
    if (!details.name || !details.phone) return null;

    return this.prisma.lead.create({
      data: {
        tenantId,
        fullName: details.name,
        email: details.email ?? '',
        phone: details.phone,
        message: this.buildCallbackLeadMessage(details, summary),
        source: 'chatbot-callback',
      },
    });
  }

  async sendMessage(dto: SendChatbotMessageDto) {
    const tenantId = await this.resolveTenantId();
    const config = await this.getChatbotConfig(tenantId);

    if (config && config.enabled === false) {
      throw new BadRequestException('Chatbot ist deaktiviert.');
    }
    const apiKey = config?.apiKey;
    if (!apiKey) throw new BadRequestException('Kein Chatbot-OpenAI-Key hinterlegt.');

    const systemPrompt = this.buildPrompt(config?.knowledgeBase);

    const conversation = Array.isArray(dto.messages) ? dto.messages : [];
    const normalizedConversation = conversation
      .filter((m) => m?.role && m?.text)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text as string }));

    const lastUser =
      dto.message?.trim() ||
      [...conversation]
        .reverse()
        .find((m) => m?.role === 'user' && m?.text?.trim())
        ?.text?.trim();

    if (!lastUser) {
      throw new BadRequestException('Es wurde keine Nutzernachricht übergeben.');
    }

    const hasLastUser =
      normalizedConversation.length > 0 &&
      normalizedConversation[normalizedConversation.length - 1].role === 'user' &&
      normalizedConversation[normalizedConversation.length - 1].content === lastUser;

    const hasConfirmation = conversation.some(
      (message) => message?.role === 'assistant' && hasCallbackConfirmation(message.text),
    );

    // ----------------------------
    // 1) DETERMINISTISCHE FLOWS
    // ----------------------------

    // Rückruf-Flow: niemals vom Modell abhängig machen.
    if (!hasConfirmation && hasCallbackIntent(lastUser)) {
      const details = this.collectCallbackDetails(conversation);
      if (this.isCompleteCallback(details)) {
        const context = this.collectIssueContext(conversation) || lastUser;
        const summary = await this.summarizeCallbackIssue(apiKey, context);
        await this.createCallbackLead(tenantId, details, summary);
        return {
          reply: CALLBACK_CONFIRMATION,
          knowledgeBase: config?.knowledgeBase ?? DEFAULT_KNOWLEDGE,
        };
      }

      return {
        reply: CALLBACK_PROMPT,
        knowledgeBase: config?.knowledgeBase ?? DEFAULT_KNOWLEDGE,
      };
    }

    // Wenn der Nutzer Kontaktdaten schickt, obwohl vorher Rückruf angeboten wurde,
    // versuchen wir trotzdem, einen Callback-Lead zu erstellen (robuster).
    if (!hasConfirmation) {
      const details = this.collectCallbackDetails(conversation);
      const looksLikeContact =
        Boolean(extractPhone(lastUser)) || Boolean(extractEmail(lastUser)) || Boolean(extractName(lastUser));
      if (looksLikeContact && this.isCompleteCallback(details)) {
        const context = this.collectIssueContext(conversation) || lastUser;
        const summary = await this.summarizeCallbackIssue(apiKey, context);
        await this.createCallbackLead(tenantId, details, summary);
        return {
          reply: CALLBACK_CONFIRMATION,
          knowledgeBase: config?.knowledgeBase ?? DEFAULT_KNOWLEDGE,
        };
      }
    }

    // Termin-Flow: ebenfalls deterministisch (wir brauchen dafür kein LLM).
    if (hasAppointmentIntent(lastUser)) {
      return {
        reply:
          'Termine werden ausschließlich telefonisch vereinbart unter 06201 4886550. Wenn Sie möchten, kann ich einen Rückruf anfragen.',
        knowledgeBase: config?.knowledgeBase ?? DEFAULT_KNOWLEDGE,
      };
    }

    // ----------------------------
    // 2) LLM FÜR "NORMALE" FRAGEN
    // ----------------------------

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...normalizedConversation,
    ];

    if (!hasLastUser) {
      messages.push({ role: 'user', content: lastUser });
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.1,
          max_tokens: 220,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new InternalServerErrorException(
          `OpenAI-Fehler (${response.status}): ${text || response.statusText}`,
        );
      }

      const json = await response.json();
      const reply: string =
        json?.choices?.[0]?.message?.content?.trim() ||
        'Ich helfe gerne bei Terminen, Öffnungszeiten oder Kontaktinformationen.';

      return {
        reply,
        knowledgeBase: config?.knowledgeBase ?? DEFAULT_KNOWLEDGE,
      };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof InternalServerErrorException) {
        throw err;
      }
      throw new InternalServerErrorException('Chatbot-Antwort fehlgeschlagen.');
    }
  }
}
