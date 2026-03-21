import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentSlotStatus,
  AppointmentTemplate,
  AppointmentTemplateRecurrence,
  CustomerType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import fetch from 'node-fetch';

import type { AppConfig } from '../../config/app.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { EmailService } from '../../infra/mailer/email.service';
import { SettingsService } from '../settings/settings.service';
import { CreateTermineSlotDto } from './dto/create-termine-slot.dto';
import { CreateTermineTemplateDto } from './dto/create-termine-template.dto';
import { ListTermineSlotsDto } from './dto/list-termine-slots.dto';
import { UpdateTermineSlotDto } from './dto/update-termine-slot.dto';
import { UpdateTermineTemplateDto } from './dto/update-termine-template.dto';
import {
  ALL_WEEKDAYS,
  DATE_PATTERN,
  RECURRENCE_VALUES,
  SLOT_STATUS_VALUES,
  TIME_PATTERN,
  type RecurrenceValue,
  type SlotStatusValue,
} from './termine.constants';

type TermineSlotResponse = {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  status: SlotStatusValue;
  createdById: string | null;
  bookedById: string | null;
  customerId: string | null;
  customerName: string | null;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  meetingLink: string | null;
  bookingNotes: string | null;
  bookedAt: string | null;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TermineTemplateResponse = {
  id: string;
  title: string;
  start: string;
  end: string;
  status: SlotStatusValue;
  recurrence: RecurrenceValue;
  weekdays: number[];
  createdAt: string;
  updatedAt: string;
};

type TermineCustomerSuggestionResponse = {
  customer: {
    name: string | null;
    type: CustomerType;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    preferredChannel: string | null;
    marketingOptIn: boolean;
    notes: string | null;
    tags: string[];
    lastContactAt: string | null;
  };
  contact: {
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    channel: string | null;
  };
};

type AppointmentSlotWithCustomer = Prisma.AppointmentSlotGetPayload<{
  include: { customer: { select: { id: true; name: true; email: true } } };
}>;

const APPOINTMENT_DURATION_MINUTES = 30;
const APPOINTMENT_CANCEL_TOKEN_BYTES = 24;

@Injectable()
export class TermineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private requireTenantId() {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private getUserId() {
    return this.context.getUserId() ?? null;
  }

  private normalizeDate(value: string) {
    const trimmed = value.trim();
    if (!DATE_PATTERN.test(trimmed)) {
      throw new BadRequestException('Datum muss im Format YYYY-MM-DD sein.');
    }

    const [yearRaw, monthRaw, dayRaw] = trimmed.split('-');
    const year = Number.parseInt(yearRaw, 10);
    const month = Number.parseInt(monthRaw, 10);
    const day = Number.parseInt(dayRaw, 10);

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(candidate.getTime()) ||
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() + 1 !== month ||
      candidate.getUTCDate() !== day
    ) {
      throw new BadRequestException('Datum ist ungueltig.');
    }

    return trimmed;
  }

  private normalizeTime(value: string) {
    const trimmed = value.trim();
    if (!TIME_PATTERN.test(trimmed)) {
      throw new BadRequestException('Zeit muss im Format HH:MM sein.');
    }
    return trimmed;
  }

  private normalizeTitle(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Titel darf nicht leer sein.');
    }
    return trimmed;
  }

  private normalizeCustomerId(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeBookedById(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeBookingNotes(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeAttendeeName(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeAttendeeEmail(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    return trimmed || null;
  }

  private normalizeAttendeePhone(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeMeetingLink(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  }

  private resolveBookingVariant(input: {
    customerId: string | null;
    attendeeName: string | null;
    attendeeEmail: string | null;
    attendeePhone: string | null;
  }) {
    const hasCustomer = Boolean(input.customerId);
    const hasManualAny = Boolean(
      input.attendeeName || input.attendeeEmail || input.attendeePhone,
    );
    const hasManualAll = Boolean(
      input.attendeeName && input.attendeeEmail && input.attendeePhone,
    );

    if (hasCustomer && hasManualAny) {
      throw new BadRequestException(
        'Bitte entweder Kunde auswaehlen oder Name, E-Mail und Telefon angeben.',
      );
    }

    if (!hasCustomer && hasManualAny && !hasManualAll) {
      throw new BadRequestException(
        'Bitte Name, E-Mail und Telefon vollstaendig angeben oder einen Kunden auswaehlen.',
      );
    }

    return {
      hasCustomer,
      hasManualAll,
      hasBooking: hasCustomer || hasManualAll,
    };
  }

  private async ensureCustomer(customerId: string | null, tenantId: string) {
    if (!customerId) return null;

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      throw new BadRequestException(
        'Ausgewaehlter Kunde wurde nicht gefunden.',
      );
    }

    return customer;
  }

  private async ensureAssignableUser(userId: string | null, tenantId: string) {
    if (!userId) return null;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        'Ausgewaehlter Mitarbeiter wurde nicht gefunden.',
      );
    }

    return user;
  }

  private async resolveDefaultBookedById(
    tenantId: string,
    fallbackUserId: string | null,
  ) {
    const admin = await this.prisma.user.findFirst({
      where: { tenantId, role: UserRole.ADMIN },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true },
    });

    if (admin) {
      return admin.id;
    }

    if (!fallbackUserId) {
      return null;
    }

    const fallbackUser = await this.prisma.user.findFirst({
      where: { id: fallbackUserId, tenantId },
      select: { id: true },
    });

    return fallbackUser?.id ?? null;
  }

  private toDbStatus(value?: SlotStatusValue) {
    return value === 'blocked'
      ? AppointmentSlotStatus.BLOCKED
      : AppointmentSlotStatus.FREE;
  }

  private fromDbStatus(value: AppointmentSlotStatus): SlotStatusValue {
    return value === AppointmentSlotStatus.BLOCKED ? 'blocked' : 'free';
  }

  private toDbRecurrence(value?: RecurrenceValue) {
    return value === 'daily'
      ? AppointmentTemplateRecurrence.DAILY
      : AppointmentTemplateRecurrence.WEEKLY;
  }

  private fromDbRecurrence(
    value: AppointmentTemplateRecurrence,
  ): RecurrenceValue {
    return value === AppointmentTemplateRecurrence.DAILY ? 'daily' : 'weekly';
  }

  private validateWeekdays(values: number[]) {
    const normalized = Array.from(
      new Set(
        values
          .filter(
            (value) => Number.isInteger(value) && value >= 0 && value <= 6,
          )
          .map((value) => Number(value)),
      ),
    ).sort((a, b) => a - b);

    return normalized;
  }

  private parseWeekdaysCsv(value?: string | null) {
    if (!value?.trim()) return [];
    const parsed = value
      .split(',')
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((entry) => Number.isInteger(entry));

    return this.validateWeekdays(parsed);
  }

  private serializeWeekdays(values: number[]) {
    const normalized = this.validateWeekdays(values);
    return normalized.length ? normalized.join(',') : null;
  }

  private resolveWeekdays(
    recurrence: AppointmentTemplateRecurrence,
    weekdays?: number[],
  ) {
    if (recurrence === AppointmentTemplateRecurrence.DAILY) {
      return [...ALL_WEEKDAYS];
    }

    const normalized = this.validateWeekdays(weekdays ?? []);
    if (!normalized.length) {
      throw new BadRequestException(
        'Bei woechentlicher Wiederholung muss mindestens ein Wochentag gesetzt sein.',
      );
    }

    return normalized;
  }

  private recurrenceOverlaps(
    recurrenceA: AppointmentTemplateRecurrence,
    weekdaysA: number[],
    recurrenceB: AppointmentTemplateRecurrence,
    weekdaysB: number[],
  ) {
    if (
      recurrenceA === AppointmentTemplateRecurrence.DAILY ||
      recurrenceB === AppointmentTemplateRecurrence.DAILY
    ) {
      return true;
    }

    return weekdaysA.some((weekday) => weekdaysB.includes(weekday));
  }

  private timeRangesOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string,
  ) {
    return !(endA <= startB || startA >= endB);
  }

  private validateSlotWindow(startTime: string, endTime: string) {
    if (endTime <= startTime) {
      throw new BadRequestException('Endzeit muss nach der Startzeit liegen.');
    }
  }

  private mapSlot(entity: AppointmentSlotWithCustomer): TermineSlotResponse {
    return {
      id: entity.id,
      date: entity.date,
      start: entity.startTime,
      end: entity.endTime,
      title: entity.title,
      status: this.fromDbStatus(entity.status),
      createdById: entity.createdById ?? null,
      bookedById: entity.bookedById ?? null,
      customerId: entity.customerId ?? null,
      customerName: entity.customer?.name ?? null,
      attendeeName: entity.attendeeName ?? null,
      attendeeEmail: entity.attendeeEmail ?? null,
      attendeePhone: entity.attendeePhone ?? null,
      meetingLink: entity.meetingLink ?? null,
      bookingNotes: entity.bookingNotes ?? null,
      bookedAt: entity.bookedAt ? entity.bookedAt.toISOString() : null,
      reminderSentAt: entity.reminderSentAt
        ? entity.reminderSentAt.toISOString()
        : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private mapTemplate(entity: AppointmentTemplate): TermineTemplateResponse {
    const recurrence = this.fromDbRecurrence(entity.recurrence);
    const weekdays =
      recurrence === 'daily'
        ? [...ALL_WEEKDAYS]
        : this.parseWeekdaysCsv(entity.weekdays);

    return {
      id: entity.id,
      title: entity.title,
      start: entity.startTime,
      end: entity.endTime,
      status: this.fromDbStatus(entity.status),
      recurrence,
      weekdays,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private sanitizeSuggestionString(value: unknown, maxLength = 191) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.slice(0, maxLength);
  }

  private sanitizeSuggestionEmail(value: unknown) {
    const email = this.sanitizeSuggestionString(value, 191);
    if (!email) {
      return null;
    }
    const normalized = email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return null;
    }
    return normalized;
  }

  private sanitizeSuggestionBoolean(value: unknown, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }
    return fallback;
  }

  private sanitizeSuggestionCustomerType(value: unknown): CustomerType | null {
    if (value === CustomerType.PRIVATE) return CustomerType.PRIVATE;
    if (value === CustomerType.BUSINESS) return CustomerType.BUSINESS;
    if (value === CustomerType.FLEET) return CustomerType.FLEET;
    return null;
  }

  private sanitizeSuggestionTags(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    const unique = new Set<string>();
    value.forEach((entry) => {
      const normalized = this.sanitizeSuggestionString(entry, 48);
      if (normalized) {
        unique.add(normalized);
      }
    });
    return Array.from(unique).slice(0, 5);
  }

  private sanitizeSuggestionIsoDateTime(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  }

  private buildCustomerSuggestionPrompt(slot: AppointmentSlotWithCustomer) {
    const dateLabel = this.formatDateLabel(slot.date);
    const bookedAt = slot.bookedAt
      ? slot.bookedAt.toISOString()
      : '(unbekannt)';
    const attendeeName = slot.attendeeName?.trim() || '(nicht gesetzt)';
    const attendeeEmail = slot.attendeeEmail?.trim() || '(nicht gesetzt)';
    const attendeePhone = slot.attendeePhone?.trim() || '(nicht gesetzt)';
    const meetingLink = slot.meetingLink?.trim() || '(nicht gesetzt)';
    const bookingNotes = slot.bookingNotes?.trim() || '(keine Notiz)';

    return [
      'Sie arbeiten als CRM-Assistenz und erstellen aus Termindaten einen Vorschlag fuer die Kundenanlage.',
      'Nutzen Sie ausschliesslich Informationen aus den bereitgestellten Daten. Keine Vermutungen.',
      'Wenn ein Feld fehlt oder unklar ist, geben Sie null zurueck.',
      'customer.type darf nur PRIVATE, BUSINESS oder FLEET sein.',
      'marketingOptIn ist nur true, wenn eine ausdrueckliche Einwilligung vorliegt.',
      'customer.notes fasst Anlass und Inhalt in 1-2 deutschen Saetzen zusammen.',
      'tags: maximal 5 kurze Stichworte.',
      'Gib exakt dieses JSON zurueck, ohne zusaetzlichen Text:',
      '{\n  "customer": {"name": null, "type": "PRIVATE", "email": null, "phone": null, "mobile": null, "street": null, "postalCode": null, "city": null, "preferredChannel": null, "marketingOptIn": false, "notes": null, "tags": [], "lastContactAt": null},\n  "contact": {"name": null, "role": null, "email": null, "phone": null, "channel": null}\n}',
      `Termin:\nTitel: ${slot.title}\nDatum: ${slot.date} (${dateLabel})\nZeit: ${slot.startTime} - ${slot.endTime}\nGebucht am: ${bookedAt}\nAttendee Name: ${attendeeName}\nAttendee E-Mail: ${attendeeEmail}\nAttendee Telefon: ${attendeePhone}\nMeeting-Link: ${meetingLink}`,
      `Notiz:\n${bookingNotes}`,
    ].join('\n\n');
  }

  private async requestCustomerSuggestion(prompt: string, apiKey: string) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'Du extrahierst fuer ein CRM nur belegbare, strukturierte Kundendaten aus Termininformationen.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`OpenAI ${response.status}: ${detail}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Die OpenAI-Antwort war leer.');
    }

    const normalized = content
      .replace(/^```json\s*/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      throw new Error(
        'Die OpenAI-Antwort konnte nicht als JSON interpretiert werden.',
      );
    }
  }

  private sanitizeCustomerSuggestionPayload(
    payload: unknown,
  ): TermineCustomerSuggestionResponse {
    const suggestion: TermineCustomerSuggestionResponse = {
      customer: {
        name: null,
        type: CustomerType.PRIVATE,
        email: null,
        phone: null,
        mobile: null,
        street: null,
        postalCode: null,
        city: null,
        preferredChannel: null,
        marketingOptIn: false,
        notes: null,
        tags: [],
        lastContactAt: null,
      },
      contact: {
        name: null,
        role: null,
        email: null,
        phone: null,
        channel: null,
      },
    };

    if (!payload || typeof payload !== 'object') {
      return suggestion;
    }

    const record = payload as Record<string, unknown>;
    const customerPayload = record.customer;
    if (customerPayload && typeof customerPayload === 'object') {
      const customer = customerPayload as Record<string, unknown>;
      const type = this.sanitizeSuggestionCustomerType(customer.type);
      suggestion.customer = {
        name: this.sanitizeSuggestionString(customer.name, 191),
        type: type ?? CustomerType.PRIVATE,
        email: this.sanitizeSuggestionEmail(customer.email),
        phone: this.sanitizeSuggestionString(customer.phone, 64),
        mobile: this.sanitizeSuggestionString(customer.mobile, 64),
        street: this.sanitizeSuggestionString(customer.street, 191),
        postalCode: this.sanitizeSuggestionString(customer.postalCode, 32),
        city: this.sanitizeSuggestionString(customer.city, 120),
        preferredChannel: this.sanitizeSuggestionString(
          customer.preferredChannel,
          64,
        ),
        marketingOptIn: this.sanitizeSuggestionBoolean(
          customer.marketingOptIn,
          false,
        ),
        notes: this.sanitizeSuggestionString(customer.notes, 5000),
        tags: this.sanitizeSuggestionTags(customer.tags),
        lastContactAt: this.sanitizeSuggestionIsoDateTime(
          customer.lastContactAt,
        ),
      };
    }

    const contactPayload = record.contact;
    if (contactPayload && typeof contactPayload === 'object') {
      const contact = contactPayload as Record<string, unknown>;
      suggestion.contact = {
        name: this.sanitizeSuggestionString(contact.name, 180),
        role: this.sanitizeSuggestionString(contact.role, 120),
        email: this.sanitizeSuggestionEmail(contact.email),
        phone: this.sanitizeSuggestionString(contact.phone, 64),
        channel: this.sanitizeSuggestionString(contact.channel, 64),
      };
    }

    return suggestion;
  }

  async suggestCustomerFromSlot(id: string) {
    const tenantId = this.requireTenantId();

    const slot = await this.prisma.appointmentSlot.findFirst({
      where: { id, tenantId },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('Slot nicht gefunden.');
    }

    if (slot.customerId) {
      throw new BadRequestException(
        'Dieser Termin ist bereits mit einem Kunden verknuepft.',
      );
    }

    if (
      !this.isBookedSlot({
        customerId: slot.customerId,
        attendeeName: slot.attendeeName,
        attendeeEmail: slot.attendeeEmail,
        attendeePhone: slot.attendeePhone,
      })
    ) {
      throw new BadRequestException(
        'Kundenvorschlaege sind nur fuer gebuchte Termine verfuegbar.',
      );
    }

    const openAiSettings = await this.settingsService.getOpenAiSettings({
      includeSecret: true,
    });
    const chatbotOpenAiSettings = openAiSettings?.apiKey?.trim()
      ? null
      : await this.settingsService.getChatbotOpenAiSettings({
          includeSecret: true,
        });
    const apiKey =
      openAiSettings?.apiKey?.trim() ??
      chatbotOpenAiSettings?.apiKey?.trim() ??
      null;
    if (!apiKey) {
      throw new BadRequestException(
        'Fuer diese Funktion muss in den Einstellungen ein OpenAI-API-Schluessel hinterlegt werden (persoenlich oder fuer den Chatbot).',
      );
    }

    const prompt = this.buildCustomerSuggestionPrompt(slot);

    let payload: unknown;
    try {
      payload = await this.requestCustomerSuggestion(prompt, apiKey);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unbekannter Fehler';
      throw new BadRequestException(
        `Kundenvorschlag konnte nicht erzeugt werden: ${detail}`,
      );
    }

    const suggestion = this.sanitizeCustomerSuggestionPayload(payload);
    const attendeeName = this.sanitizeSuggestionString(slot.attendeeName, 191);
    const attendeeEmail = this.sanitizeSuggestionEmail(slot.attendeeEmail);
    const attendeePhone = this.sanitizeSuggestionString(slot.attendeePhone, 64);

    if (!suggestion.customer.name) {
      suggestion.customer.name =
        attendeeName ??
        attendeeEmail ??
        this.sanitizeSuggestionString(
          `${slot.title} ${this.formatDateLabel(slot.date)}`,
          191,
        ) ??
        'Terminkontakt';
    }
    if (!suggestion.customer.email && attendeeEmail) {
      suggestion.customer.email = attendeeEmail;
    }
    if (!suggestion.customer.phone && attendeePhone) {
      suggestion.customer.phone = attendeePhone;
    }
    if (!suggestion.customer.preferredChannel) {
      suggestion.customer.preferredChannel = suggestion.customer.email
        ? 'E-Mail'
        : suggestion.customer.phone
          ? 'Telefon'
          : null;
    }
    if (!suggestion.customer.lastContactAt) {
      suggestion.customer.lastContactAt =
        slot.bookedAt?.toISOString() ?? `${slot.date}T00:00:00.000Z`;
    }

    if (!suggestion.customer.notes) {
      const noteParts = [
        this.sanitizeSuggestionString(slot.bookingNotes, 4000),
        slot.meetingLink?.trim()
          ? `Meeting-Link: ${slot.meetingLink.trim()}`
          : null,
      ].filter((entry): entry is string => Boolean(entry));
      suggestion.customer.notes = noteParts.length
        ? noteParts.join('\n')
        : null;
    }

    if (!suggestion.contact.name) {
      suggestion.contact.name = attendeeName ?? suggestion.customer.name;
    }
    if (!suggestion.contact.email && attendeeEmail) {
      suggestion.contact.email = attendeeEmail;
    }
    if (!suggestion.contact.phone && attendeePhone) {
      suggestion.contact.phone = attendeePhone;
    }
    if (!suggestion.contact.channel) {
      suggestion.contact.channel = suggestion.customer.preferredChannel;
    }

    return suggestion;
  }

  async listSlots(dto: ListTermineSlotsDto) {
    const tenantId = this.requireTenantId();

    const where: Prisma.AppointmentSlotWhereInput = { tenantId };
    const from = dto.from ? this.normalizeDate(dto.from) : null;
    const to = dto.to ? this.normalizeDate(dto.to) : null;

    if (from && to && from > to) {
      throw new BadRequestException('Der Zeitraum ist ungueltig.');
    }

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }

    const items = await this.prisma.appointmentSlot.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
    });

    return { items: items.map((item) => this.mapSlot(item)) };
  }

  async createSlot(dto: CreateTermineSlotDto) {
    const tenantId = this.requireTenantId();
    const userId = this.getUserId();

    const date = this.normalizeDate(dto.date);
    const startTime = this.normalizeTime(dto.start);
    const endTime = this.normalizeTime(dto.end);
    this.validateSlotWindow(startTime, endTime);

    const title = this.normalizeTitle(dto.title);
    const customerId = this.normalizeCustomerId(dto.customerId);
    const inputBookedById = this.normalizeBookedById(dto.bookedById);
    const attendeeName = this.normalizeAttendeeName(dto.attendeeName);
    const attendeeEmail = this.normalizeAttendeeEmail(dto.attendeeEmail);
    const attendeePhone = this.normalizeAttendeePhone(dto.attendeePhone);
    const meetingLink = this.normalizeMeetingLink(dto.meetingLink);
    const bookingVariant = this.resolveBookingVariant({
      customerId,
      attendeeName,
      attendeeEmail,
      attendeePhone,
    });
    const customer = await this.ensureCustomer(customerId, tenantId);
    const bookingNotes = this.normalizeBookingNotes(dto.bookingNotes);

    if (!bookingVariant.hasBooking && inputBookedById) {
      throw new BadRequestException(
        'Ein Mitarbeiter kann nur fuer gebuchte Termine zugewiesen werden.',
      );
    }

    const assignedUser = bookingVariant.hasBooking
      ? await this.ensureAssignableUser(inputBookedById, tenantId)
      : null;
    const bookedById = bookingVariant.hasBooking
      ? (assignedUser?.id ??
        (await this.resolveDefaultBookedById(tenantId, userId)))
      : null;

    if (!bookingVariant.hasBooking && (bookingNotes || meetingLink)) {
      throw new BadRequestException(
        'Notizen und Link koennen nur bei gebuchten Terminen gesetzt werden.',
      );
    }

    const status = bookingVariant.hasBooking
      ? AppointmentSlotStatus.BLOCKED
      : this.toDbStatus(dto.status);

    const overlap = await this.prisma.appointmentSlot.findFirst({
      where: {
        tenantId,
        date,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new BadRequestException(
        'Dieser Zeitraum ueberschneidet sich mit einem vorhandenen Slot.',
      );
    }

    const created = await this.prisma.appointmentSlot.create({
      data: {
        tenantId,
        createdById: userId,
        bookedById,
        customerId: customer?.id ?? null,
        attendeeName: bookingVariant.hasManualAll ? attendeeName : null,
        attendeeEmail: bookingVariant.hasManualAll ? attendeeEmail : null,
        attendeePhone: bookingVariant.hasManualAll ? attendeePhone : null,
        date,
        startTime,
        endTime,
        title,
        status,
        meetingLink: bookingVariant.hasBooking ? meetingLink : null,
        bookingNotes: bookingVariant.hasBooking ? bookingNotes : null,
        cancelTokenHash: null,
        cancelTokenExpiresAt: null,
        canceledAt: null,
        canceledBy: null,
        cancelReason: null,
        bookedAt: bookingVariant.hasBooking ? new Date() : null,
        reminderSentAt: null,
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return this.mapSlot(created);
  }

  async updateSlot(id: string, dto: UpdateTermineSlotDto) {
    const tenantId = this.requireTenantId();
    const userId = this.getUserId();

    const existing = await this.prisma.appointmentSlot.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Slot nicht gefunden.');
    }

    const date = dto.date ? this.normalizeDate(dto.date) : existing.date;
    const startTime = dto.start
      ? this.normalizeTime(dto.start)
      : existing.startTime;
    const endTime = dto.end ? this.normalizeTime(dto.end) : existing.endTime;
    this.validateSlotWindow(startTime, endTime);

    const title =
      dto.title !== undefined ? this.normalizeTitle(dto.title) : existing.title;
    const nextCustomerId =
      dto.customerId !== undefined
        ? this.normalizeCustomerId(dto.customerId)
        : existing.customerId;
    const nextBookedById =
      dto.bookedById !== undefined
        ? this.normalizeBookedById(dto.bookedById)
        : existing.bookedById;
    const nextAttendeeName =
      dto.attendeeName !== undefined
        ? this.normalizeAttendeeName(dto.attendeeName)
        : existing.attendeeName;
    const nextAttendeeEmail =
      dto.attendeeEmail !== undefined
        ? this.normalizeAttendeeEmail(dto.attendeeEmail)
        : existing.attendeeEmail;
    const nextAttendeePhone =
      dto.attendeePhone !== undefined
        ? this.normalizeAttendeePhone(dto.attendeePhone)
        : existing.attendeePhone;
    const bookingVariant = this.resolveBookingVariant({
      customerId: nextCustomerId,
      attendeeName: nextAttendeeName,
      attendeeEmail: nextAttendeeEmail,
      attendeePhone: nextAttendeePhone,
    });
    const customer = await this.ensureCustomer(nextCustomerId, tenantId);
    if (!bookingVariant.hasBooking && nextBookedById) {
      throw new BadRequestException(
        'Ein Mitarbeiter kann nur fuer gebuchte Termine zugewiesen werden.',
      );
    }
    const assignedUser = bookingVariant.hasBooking
      ? await this.ensureAssignableUser(nextBookedById, tenantId)
      : null;
    let meetingLink =
      dto.meetingLink !== undefined
        ? this.normalizeMeetingLink(dto.meetingLink)
        : existing.meetingLink;
    let bookingNotes =
      dto.bookingNotes !== undefined
        ? this.normalizeBookingNotes(dto.bookingNotes)
        : existing.bookingNotes;
    if (!bookingVariant.hasBooking && (bookingNotes || meetingLink)) {
      throw new BadRequestException(
        'Notizen und Link koennen nur bei gebuchten Terminen gesetzt werden.',
      );
    }
    if (!bookingVariant.hasBooking) {
      bookingNotes = null;
      meetingLink = null;
    }

    let status =
      dto.status !== undefined ? this.toDbStatus(dto.status) : existing.status;
    if (bookingVariant.hasBooking) {
      status = AppointmentSlotStatus.BLOCKED;
    }

    const windowChanged =
      date !== existing.date ||
      startTime !== existing.startTime ||
      endTime !== existing.endTime;

    if (windowChanged) {
      const overlap = await this.prisma.appointmentSlot.findFirst({
        where: {
          tenantId,
          id: { not: existing.id },
          date,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new BadRequestException(
          'Dieser Zeitraum ueberschneidet sich mit einem vorhandenen Slot.',
        );
      }
    }

    const nextResolvedAttendeeName = bookingVariant.hasManualAll
      ? nextAttendeeName
      : null;
    const nextResolvedAttendeeEmail = bookingVariant.hasManualAll
      ? nextAttendeeEmail
      : null;
    const nextResolvedAttendeePhone = bookingVariant.hasManualAll
      ? nextAttendeePhone
      : null;

    const bookingChanged =
      existing.customerId !== (customer?.id ?? null) ||
      (existing.attendeeName ?? null) !== (nextResolvedAttendeeName ?? null) ||
      (existing.attendeeEmail ?? null) !==
        (nextResolvedAttendeeEmail ?? null) ||
      (existing.attendeePhone ?? null) !== (nextResolvedAttendeePhone ?? null);
    const slotDetailsChanged =
      windowChanged ||
      title !== existing.title ||
      meetingLink !== existing.meetingLink;
    const bookedAt = bookingVariant.hasBooking
      ? bookingChanged
        ? new Date()
        : (existing.bookedAt ?? new Date())
      : null;
    const bookedById = bookingVariant.hasBooking
      ? (assignedUser?.id ??
        (await this.resolveDefaultBookedById(tenantId, userId)))
      : null;
    const reminderSentAt =
      bookingVariant.hasBooking && !bookingChanged && !slotDetailsChanged
        ? existing.reminderSentAt
        : null;
    const clearCancelMetadata = !bookingVariant.hasBooking || bookingChanged;

    const updated = await this.prisma.appointmentSlot.update({
      where: { id: existing.id },
      data: {
        date,
        startTime,
        endTime,
        title,
        status,
        customerId: customer?.id ?? null,
        attendeeName: nextResolvedAttendeeName,
        attendeeEmail: nextResolvedAttendeeEmail,
        attendeePhone: nextResolvedAttendeePhone,
        meetingLink,
        bookingNotes,
        cancelTokenHash: clearCancelMetadata ? null : existing.cancelTokenHash,
        cancelTokenExpiresAt: clearCancelMetadata
          ? null
          : existing.cancelTokenExpiresAt,
        canceledAt: clearCancelMetadata ? null : existing.canceledAt,
        canceledBy: clearCancelMetadata ? null : existing.canceledBy,
        cancelReason: clearCancelMetadata ? null : existing.cancelReason,
        bookedAt,
        bookedById,
        reminderSentAt,
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return this.mapSlot(updated);
  }

  async deleteSlot(id: string) {
    const tenantId = this.requireTenantId();

    const existing = await this.prisma.appointmentSlot.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Slot nicht gefunden.');
    }

    await this.prisma.appointmentSlot.delete({ where: { id: existing.id } });
    return { success: true };
  }

  private isBookedSlot(entity: {
    customerId: string | null;
    attendeeName: string | null;
    attendeeEmail: string | null;
    attendeePhone: string | null;
  }) {
    return Boolean(
      entity.customerId ||
        (entity.attendeeName && entity.attendeeEmail && entity.attendeePhone),
    );
  }

  private formatDateLabel(date: string) {
    const [year, month, day] = date.split('-');
    return `${day}.${month}.${year}`;
  }

  private formatDisplayText(value: string) {
    return value
      .replace(/Erstgespraech/g, 'Erstgespräch')
      .replace(/erstgespraech/g, 'erstgespräch')
      .replace(/Gespraech/g, 'Gespräch')
      .replace(/gespraech/g, 'gespräch');
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatSlotDateTime(date: string, time: string) {
    const [yearRaw, monthRaw, dayRaw] = date.split('-');
    const [hourRaw, minuteRaw] = time.split(':');
    const year = Number.parseInt(yearRaw, 10);
    const month = Number.parseInt(monthRaw, 10);
    const day = Number.parseInt(dayRaw, 10);
    const hour = Number.parseInt(hourRaw, 10);
    const minute = Number.parseInt(minuteRaw, 10);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute)
    ) {
      return null;
    }

    const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (Number.isNaN(candidate.getTime())) {
      return null;
    }
    return candidate;
  }

  private resolveCancelTokenExpiry(date: string, end: string) {
    const endDate = this.formatSlotDateTime(date, end);
    if (!endDate) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    return new Date(endDate.getTime() + 2 * 24 * 60 * 60 * 1000);
  }

  private createAppointmentCancelToken() {
    const raw = randomBytes(APPOINTMENT_CANCEL_TOKEN_BYTES).toString('hex');
    const hash = createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
  }

  private buildAppointmentCancelUrl(token: string) {
    const appUrl =
      this.configService.get('app', { infer: true })?.url ??
      'http://localhost:4000';
    const baseUrl = appUrl.replace(/\/+$/, '');
    return `${baseUrl}/api/v1/chatbot/appointments/cancel?token=${encodeURIComponent(token)}`;
  }

  private buildReminderEmailHtml(params: {
    recipientName: string;
    title: string;
    dateLabel: string;
    start: string;
    end: string;
    meetingLink: string;
    cancelUrl: string;
  }) {
    const recipientName = this.escapeHtml(params.recipientName);
    const title = this.escapeHtml(params.title);
    const dateLabel = this.escapeHtml(params.dateLabel);
    const start = this.escapeHtml(params.start);
    const end = this.escapeHtml(params.end);
    const meetingLink = this.escapeHtml(params.meetingLink);
    const cancelUrl = this.escapeHtml(params.cancelUrl);

    return `
<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f1722;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #dbe4ee;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:18px 24px;background:linear-gradient(120deg,#0c223f,#17355b);color:#ffffff;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Alzag Consulting</div>
                <div style="margin-top:6px;font-size:20px;font-weight:700;">Terminerinnerung</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#1c2430;">
                  Hallo ${recipientName},
                </p>
                <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:#475467;">
                  dies ist Ihre Erinnerung für den anstehenden Termin.
                </p>
                <div style="border:1px solid #cfd9e6;border-radius:14px;background:#f8fbff;padding:16px 18px;">
                  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5c6b7e;font-weight:700;">Ihr Termin</div>
                  <div style="margin-top:10px;font-size:16px;font-weight:700;color:#0f1722;">${title}</div>
                  <div style="margin-top:10px;font-size:14px;line-height:1.6;color:#1c2430;">
                    <strong>Datum:</strong> ${dateLabel}<br />
                    <strong>Uhrzeit:</strong> ${start} - ${end}<br />
                    <strong>Dauer:</strong> ${APPOINTMENT_DURATION_MINUTES} Minuten
                  </div>
                </div>
                <div style="margin-top:18px;">
                  <a href="${meetingLink}" style="display:inline-block;background:#0c223f;color:#ffffff;text-decoration:none;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:700;">
                    Zum Termin-Link
                  </a>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid #d6dde6;">
                  <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#6f7782;">
                    Falls sich Ihr Zeitplan ändert, können Sie den Termin direkt über den folgenden Link absagen:
                  </p>
                  <a href="${cancelUrl}" style="display:inline-block;background:#0c223f;color:#ffffff;text-decoration:none;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:700;">
                    Termin absagen
                  </a>
                </div>
                <p style="margin:20px 0 0 0;font-size:13px;line-height:1.6;color:#6f7782;">
                  Viele Grüße<br />
                  <strong style="color:#0f1722;">Alzag Consulting</strong>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim();
  }

  async sendReminder(id: string) {
    const tenantId = this.requireTenantId();

    const existing = await this.prisma.appointmentSlot.findFirst({
      where: { id, tenantId },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Slot nicht gefunden.');
    }

    if (
      !this.isBookedSlot({
        customerId: existing.customerId,
        attendeeName: existing.attendeeName,
        attendeeEmail: existing.attendeeEmail,
        attendeePhone: existing.attendeePhone,
      })
    ) {
      throw new BadRequestException(
        'Erinnerungen koennen nur fuer gebuchte Termine versendet werden.',
      );
    }

    const recipientEmail =
      existing.customer?.email?.trim().toLowerCase() ??
      existing.attendeeEmail?.trim().toLowerCase() ??
      null;

    if (!recipientEmail) {
      throw new BadRequestException(
        'Fuer diesen Termin ist keine E-Mail-Adresse hinterlegt.',
      );
    }

    if (!existing.meetingLink?.trim()) {
      throw new BadRequestException(
        'Bitte zuerst einen Meeting-Link im Termin hinterlegen.',
      );
    }
    const meetingLink = existing.meetingLink.trim();

    const smtpCredentials = await this.settingsService.getSmtpCredentials();
    if (!smtpCredentials) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const cancelToken = this.createAppointmentCancelToken();
    const cancelUrl = this.buildAppointmentCancelUrl(cancelToken.raw);
    const cancelTokenExpiresAt = this.resolveCancelTokenExpiry(
      existing.date,
      existing.endTime,
    );

    const recipientName =
      existing.customer?.name?.trim() ??
      existing.attendeeName?.trim() ??
      'Termin-Kontakt';
    const dateLabel = this.formatDateLabel(existing.date);
    const subject = `Erinnerung: ${existing.title} am ${dateLabel} um ${existing.startTime}`;
    const textLines = [
      `Hallo ${recipientName},`,
      '',
      `dies ist Ihre Erinnerung fuer den anstehenden Termin.`,
      `Termin: ${this.formatDisplayText(existing.title)}`,
      `Datum: ${dateLabel}`,
      `Uhrzeit: ${existing.startTime} - ${existing.endTime}`,
      `Dauer: ${APPOINTMENT_DURATION_MINUTES} Minuten`,
      `Termin-Link: ${meetingLink}`,
      `Termin absagen: ${cancelUrl}`,
      '',
      'Viele Gruesse',
      'Alzag Consulting',
    ].filter(Boolean);
    const text = textLines.join('\n');
    const html = this.buildReminderEmailHtml({
      recipientName,
      title: this.formatDisplayText(existing.title),
      dateLabel,
      start: existing.startTime,
      end: existing.endTime,
      meetingLink,
      cancelUrl,
    });

    await this.emailService.sendEmail(
      {
        to: recipientEmail,
        subject,
        text,
        html,
      },
      smtpCredentials,
    );

    const updated = await this.prisma.appointmentSlot.update({
      where: { id: existing.id },
      data: {
        reminderSentAt: new Date(),
        cancelTokenHash: cancelToken.hash,
        cancelTokenExpiresAt,
        canceledAt: null,
        canceledBy: null,
        cancelReason: null,
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      success: true,
      recipient: recipientEmail,
      slot: this.mapSlot(updated),
    };
  }

  async listTemplates() {
    const tenantId = this.requireTenantId();

    const items = await this.prisma.appointmentTemplate.findMany({
      where: { tenantId },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });

    return { items: items.map((item) => this.mapTemplate(item)) };
  }

  private findTemplateConflict(
    existing: AppointmentTemplate[],
    candidate: {
      id?: string;
      startTime: string;
      endTime: string;
      recurrence: AppointmentTemplateRecurrence;
      weekdays: number[];
    },
  ) {
    return existing.find((template) => {
      if (candidate.id && template.id === candidate.id) return false;

      const weekdays =
        template.recurrence === AppointmentTemplateRecurrence.DAILY
          ? [...ALL_WEEKDAYS]
          : this.parseWeekdaysCsv(template.weekdays);

      if (
        !this.timeRangesOverlap(
          candidate.startTime,
          candidate.endTime,
          template.startTime,
          template.endTime,
        )
      ) {
        return false;
      }

      return this.recurrenceOverlaps(
        candidate.recurrence,
        candidate.weekdays,
        template.recurrence,
        weekdays,
      );
    });
  }

  async createTemplate(dto: CreateTermineTemplateDto) {
    const tenantId = this.requireTenantId();
    const userId = this.getUserId();

    const title = this.normalizeTitle(dto.title);
    const startTime = this.normalizeTime(dto.start);
    const endTime = this.normalizeTime(dto.end);
    this.validateSlotWindow(startTime, endTime);

    const status = this.toDbStatus(dto.status);
    const recurrence = this.toDbRecurrence(dto.recurrence);
    const weekdays = this.resolveWeekdays(recurrence, dto.weekdays);

    const templates = await this.prisma.appointmentTemplate.findMany({
      where: { tenantId },
    });

    const conflict = this.findTemplateConflict(templates, {
      startTime,
      endTime,
      recurrence,
      weekdays,
    });

    if (conflict) {
      throw new BadRequestException(
        'Eine Standard-Vorlage mit ueberschneidender Zeit existiert bereits.',
      );
    }

    const created = await this.prisma.appointmentTemplate.create({
      data: {
        tenantId,
        createdById: userId,
        title,
        startTime,
        endTime,
        status,
        recurrence,
        weekdays:
          recurrence === AppointmentTemplateRecurrence.DAILY
            ? null
            : this.serializeWeekdays(weekdays),
      },
    });

    return this.mapTemplate(created);
  }

  async updateTemplate(id: string, dto: UpdateTermineTemplateDto) {
    const tenantId = this.requireTenantId();

    const existing = await this.prisma.appointmentTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Standard-Slot nicht gefunden.');
    }

    const startTime = dto.start
      ? this.normalizeTime(dto.start)
      : existing.startTime;
    const endTime = dto.end ? this.normalizeTime(dto.end) : existing.endTime;
    this.validateSlotWindow(startTime, endTime);

    const title =
      dto.title !== undefined ? this.normalizeTitle(dto.title) : existing.title;
    const status =
      dto.status !== undefined ? this.toDbStatus(dto.status) : existing.status;

    const recurrence =
      dto.recurrence !== undefined
        ? this.toDbRecurrence(dto.recurrence)
        : existing.recurrence;

    const currentWeekdays = this.parseWeekdaysCsv(existing.weekdays);
    const weekdays = this.resolveWeekdays(
      recurrence,
      dto.weekdays !== undefined ? dto.weekdays : currentWeekdays,
    );

    const templates = await this.prisma.appointmentTemplate.findMany({
      where: { tenantId },
    });

    const conflict = this.findTemplateConflict(templates, {
      id: existing.id,
      startTime,
      endTime,
      recurrence,
      weekdays,
    });

    if (conflict) {
      throw new BadRequestException(
        'Eine Standard-Vorlage mit ueberschneidender Zeit existiert bereits.',
      );
    }

    const updated = await this.prisma.appointmentTemplate.update({
      where: { id: existing.id },
      data: {
        title,
        startTime,
        endTime,
        status,
        recurrence,
        weekdays:
          recurrence === AppointmentTemplateRecurrence.DAILY
            ? null
            : this.serializeWeekdays(weekdays),
      },
    });

    return this.mapTemplate(updated);
  }

  async deleteTemplate(id: string) {
    const tenantId = this.requireTenantId();

    const existing = await this.prisma.appointmentTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Standard-Slot nicht gefunden.');
    }

    await this.prisma.appointmentTemplate.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  getMeta() {
    return {
      statusValues: SLOT_STATUS_VALUES,
      recurrenceValues: RECURRENCE_VALUES,
      weekdays: [...ALL_WEEKDAYS],
    };
  }
}
