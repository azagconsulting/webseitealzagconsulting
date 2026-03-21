import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerMessageDirection,
  CustomerMessageStatus,
  CustomerType,
  LeadPriority,
  LeadStatus,
  Prisma,
  VehicleFuelType,
  VehicleTransmission,
} from '@prisma/client';

import {
  EmailService,
  type EmailAttachment,
  type EmailSendResult,
} from '../../infra/mailer/email.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import {
  SendAttachmentDto,
  SendCustomerMessageDto,
} from './dto/send-customer-message.dto';

type CustomerMessageEntity = Prisma.CustomerMessageGetPayload<{
  include: { contact: true };
}>;

interface CustomerMessageContact {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  channel?: string | null;
}

interface CustomerMessageAttachment {
  name: string;
  type?: string | null;
  size?: number | null;
  data?: string | null;
}

export interface CustomerMessageResponse {
  id: string;
  customerId?: string | null;
  leadId?: string | null;
  contact: CustomerMessageContact | null;
  direction: CustomerMessageDirection;
  status: CustomerMessageStatus;
  subject?: string | null;
  preview?: string | null;
  body: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  attachments: CustomerMessageAttachment[];
  readAt?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  isSpam?: boolean;
  category?: string | null;
  sentiment?: string | null;
  urgency?: string | null;
  summary?: string | null;
  analyzedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMessageListResponse {
  customer: {
    id: string;
    name: string;
    contacts: CustomerMessageContact[];
  };
  items: CustomerMessageResponse[];
}

export interface CustomerExtractionSuggestion {
  customer: {
    name?: string;
    type?: CustomerType;
    email?: string;
    phone?: string;
    mobile?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    preferredChannel?: string;
    marketingOptIn?: boolean;
    notes?: string;
    tags?: string[];
    lastContactAt?: string;
  };
  contact?: {
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
    channel?: string;
  } | null;
  vehicle?: {
    manufacturer?: string;
    model?: string;
    trim?: string;
    licensePlate?: string;
    vin?: string;
    year?: number;
    mileageKm?: number;
    fuelType?: VehicleFuelType;
    transmission?: VehicleTransmission;
    color?: string;
    notes?: string;
  } | null;
}

export interface CustomerExtractionResult {
  messageId: string;
  suggestion: CustomerExtractionSuggestion;
}

const CUSTOMER_PRISMA_SCHEMA_CONTEXT = `model Customer {
  id               String
  tenantId         String
  name             String
  type             CustomerType // PRIVATE | BUSINESS | FLEET
  email            String?
  phone            String?
  mobile           String?
  street           String?
  postalCode       String?
  city             String?
  preferredChannel String?
  marketingOptIn   Boolean
  notes            String?
  tags             Json?
  totalSpendCents  Int
  lastContactAt    DateTime?
  createdAt        DateTime
  updatedAt        DateTime
}

model CustomerContact {
  id         String
  customerId String
  name       String
  role       String?
  channel    String?
  email      String?
  phone      String?
  createdAt  DateTime
  updatedAt  DateTime
}

model Vehicle {
  id            String
  tenantId      String
  customerId    String
  manufacturer  String?
  model         String?
  trim          String?
  licensePlate  String?
  vin           String?
  year          Int?
  mileageKm     Int?
  fuelType      VehicleFuelType?
  transmission  VehicleTransmission?
  color         String?
  lastServiceAt DateTime?
  nextServiceAt DateTime?
  notes         String?
  createdAt     DateTime
  updatedAt     DateTime
}`;

interface LeadSummary {
  id: string;
  fullName: string;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  message?: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  createdAt: string;
}

export interface LeadMessageListResponse {
  lead: LeadSummary;
  items: CustomerMessageResponse[];
}

@Injectable()
export class CustomerMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    private readonly context: RequestContextService,
  ) {}

  async list(
    customerId: string,
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageListResponse> {
    const tenantId = this.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      include: { contacts: true },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden');
    }

    const limit = Math.min(dto?.limit ?? 30, 100);

    const contactEmails = Array.from(
      new Set(
        customer.contacts
          .map((contact) => this.normalizeEmail(contact.email))
          .filter((email): email is string => Boolean(email)),
      ),
    );

    const userId = this.requireUserId();

    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        isSpam: false,
        OR: [
          { customerId },
          contactEmails.length ? { toEmail: { in: contactEmails } } : undefined,
          contactEmails.length
            ? { fromEmail: { in: contactEmails } }
            : undefined,
        ].filter(Boolean) as Prisma.CustomerMessageWhereInput[],
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const seen = new Set<string>();
    const normalized = records.filter((record) => {
      if (seen.has(record.id)) {
        return false;
      }
      seen.add(record.id);
      return true;
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        contacts: customer.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role,
          email: contact.email,
          channel: contact.channel,
        })),
      },
      items: normalized.map((record) => this.toResponse(record)),
    };
  }

  async send(
    customerId: string,
    dto: SendCustomerMessageDto,
  ): Promise<CustomerMessageResponse> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      include: { contacts: true },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden');
    }

    const contact = dto.contactId
      ? customer.contacts.find((item) => item.id === dto.contactId)
      : null;

    if (dto.contactId && !contact) {
      throw new BadRequestException('Kontakt konnte nicht gefunden werden');
    }

    const toEmail = (contact?.email ?? dto.toEmail)?.trim().toLowerCase();

    if (!toEmail) {
      throw new BadRequestException(
        'Für den Versand ist eine Zieladresse erforderlich.',
      );
    }

    const subject =
      dto.subject?.trim() ??
      `Update von ${customer.name ?? 'Autohaus Herrmann'}`;
    const preview = dto.preview?.trim() ?? this.buildPreview(dto.body);
    const attachments = this.normalizeAttachments(dto.attachments);

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    if (!smtpCredentials) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const fromEmail =
      dto.fromEmail?.trim() ??
      smtpCredentials.fromEmail ??
      smtpCredentials.username ??
      undefined;

    const sendResult = await this.emailService.sendEmail(
      {
        to: toEmail,
        subject,
        text: dto.body,
        html: dto.body.replace(/\n/g, '<br />'),
        from: fromEmail,
        attachments,
      },
      smtpCredentials,
    );

    const saved = await this.prisma.customerMessage.create({
      data: {
        tenant: { connect: { id: tenantId } },
        ownerUser: { connect: { id: userId } },
        customer: { connect: { id: customerId } },
        lead: undefined,
        contact: contact ? { connect: { id: contact.id } } : undefined,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        attachments: dto.attachments
          ? (dto.attachments.map((attachment) => ({
              name: attachment.name,
              type: attachment.type ?? null,
              size:
                typeof attachment.size === 'number' ? attachment.size : null,
              data: attachment.data ?? null,
            })) as Prisma.JsonArray)
          : undefined,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  async listLeadMessages(
    leadId: string,
    dto: ListCustomerMessagesDto,
  ): Promise<LeadMessageListResponse> {
    const tenantId = this.requireTenantId();
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId, tenantId },
    });

    if (!lead) {
      throw new NotFoundException('Kontaktanfrage nicht gefunden');
    }

    const limit = Math.min(dto?.limit ?? 40, 200);
    const normalizedEmail = this.normalizeEmail(lead.email);
    const orFilters: Prisma.CustomerMessageWhereInput[] = [{ leadId }];
    if (normalizedEmail) {
      orFilters.push(
        { toEmail: normalizedEmail },
        { fromEmail: normalizedEmail },
      );
    }

    const userId = this.requireUserId();

    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        OR: orFilters,
        isSpam: false,
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const seen = new Set<string>();
    const normalized = records.filter((record) => {
      if (seen.has(record.id)) {
        return false;
      }
      seen.add(record.id);
      return true;
    });

    const items = normalized.map((record) => this.toResponse(record));

    if (lead.message) {
      items.push(this.buildLeadInitialMessage(lead));
    }

    const resolveTimestamp = (item: CustomerMessageResponse) =>
      item.receivedAt ?? item.sentAt ?? item.createdAt;
    const ordered = items.sort(
      (a, b) =>
        new Date(resolveTimestamp(a)).getTime() -
        new Date(resolveTimestamp(b)).getTime(),
    );

    return {
      lead: {
        id: lead.id,
        fullName: lead.fullName,
        email: lead.email,
        company: lead.company,
        phone: lead.phone,
        message: lead.message,
        status: lead.status,
        priority: lead.priority,
        createdAt: lead.createdAt.toISOString(),
      },
      items: ordered,
    };
  }

  async sendLeadMessage(
    leadId: string,
    dto: SendCustomerMessageDto,
  ): Promise<CustomerMessageResponse> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId, tenantId },
    });

    if (!lead) {
      throw new NotFoundException('Kontaktanfrage nicht gefunden');
    }

    const toEmail = (dto.toEmail ?? lead.email)?.trim().toLowerCase();

    if (!toEmail) {
      throw new BadRequestException(
        'Für den Versand ist eine Zieladresse erforderlich.',
      );
    }

    const subject = dto.subject?.trim() ?? `Update für ${lead.fullName}`;
    const preview = dto.preview?.trim() ?? this.buildPreview(dto.body);
    const attachments = this.normalizeAttachments(dto.attachments);

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    if (!smtpCredentials) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const fromEmail =
      dto.fromEmail?.trim() ??
      smtpCredentials.fromEmail ??
      smtpCredentials.username ??
      undefined;

    const sendResult = await this.emailService.sendEmail(
      {
        to: toEmail,
        subject,
        text: dto.body,
        html: dto.body.replace(/\n/g, '<br />'),
        from: fromEmail,
        attachments,
      },
      smtpCredentials,
    );

    const saved = await this.prisma.customerMessage.create({
      data: {
        tenant: { connect: { id: tenantId } },
        ownerUser: { connect: { id: userId } },
        lead: { connect: { id: leadId } },
        customer: undefined,
        contact: undefined,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        attachments: dto.attachments
          ? (dto.attachments.map((attachment) => ({
              name: attachment.name,
              type: attachment.type ?? null,
              size:
                typeof attachment.size === 'number' ? attachment.size : null,
              data: attachment.data ?? null,
            })) as Prisma.JsonArray)
          : undefined,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  async listSent(
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageResponse[]> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const limit = Math.min(dto?.limit ?? 50, 200);
    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        direction: CustomerMessageDirection.OUTBOUND,
        deletedAt: null,
        ...(dto.customerId && { customerId: dto.customerId }),
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map((record) => this.toResponse(record));
  }

  async listInbox(
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageResponse[]> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const limit = Math.min(dto?.limit ?? 50, 200);
    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        direction: CustomerMessageDirection.INBOUND,
        isSpam: false,
        deletedAt: null,
        ...(dto.customerId && { customerId: dto.customerId }),
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map((record) => this.toResponse(record));
  }

  async listSpam(
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageResponse[]> {
    if (dto.customerId) {
      // If a customerId is provided, it doesn't make sense to show spam,
      // as spam is typically not associated with a specific customer.
      return Promise.resolve([]);
    }

    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const limit = Math.min(dto?.limit ?? 40, 200);
    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        isSpam: true,
        direction: CustomerMessageDirection.INBOUND,
        deletedAt: null,
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((record) => this.toResponse(record));
  }

  async listTrash(
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageResponse[]> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const limit = Math.min(dto?.limit ?? 50, 200);
    const records = await this.prisma.customerMessage.findMany({
      where: { tenantId, ownerUserId: userId, deletedAt: { not: null } },
      include: { contact: true },
      orderBy: { deletedAt: 'desc' },
      take: limit,
    });
    return records.map((record) => this.toResponse(record));
  }

  async listUnassignedMessages(
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageResponse[]> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const limit = Math.min(dto?.limit ?? 40, 200);
    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        customerId: null,
        leadId: null,
        direction: CustomerMessageDirection.INBOUND,
        isSpam: false,
        deletedAt: null,
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map((record) => this.toResponse(record));
  }

  async sendUnassignedMessage(
    dto: SendCustomerMessageDto,
  ): Promise<CustomerMessageResponse> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const toEmail = dto.toEmail?.trim().toLowerCase();
    if (!toEmail) {
      throw new BadRequestException(
        'Für den Versand ist eine Zieladresse erforderlich.',
      );
    }

    const subject = dto.subject?.trim() ?? 'Antwort aus deinem Workspace';
    const preview = dto.preview?.trim() ?? this.buildPreview(dto.body);
    const attachments = this.normalizeAttachments(dto.attachments);

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    if (!smtpCredentials) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const fromEmail =
      dto.fromEmail?.trim() ??
      smtpCredentials.fromEmail ??
      smtpCredentials.username ??
      undefined;

    const sendResult = await this.emailService.sendEmail(
      {
        to: toEmail,
        subject,
        text: dto.body,
        html: dto.body.replace(/\n/g, '<br />'),
        from: fromEmail,
        attachments,
      },
      smtpCredentials,
    );

    const saved = await this.prisma.customerMessage.create({
      data: {
        tenant: { connect: { id: tenantId } },
        ownerUser: { connect: { id: userId } },
        customer: undefined,
        lead: undefined,
        contact: undefined,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        attachments: dto.attachments
          ? (dto.attachments.map((attachment) => ({
              name: attachment.name,
              type: attachment.type ?? null,
              size:
                typeof attachment.size === 'number' ? attachment.size : null,
              data: attachment.data ?? null,
            })) as Prisma.JsonArray)
          : undefined,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  async listByEmail(email: string): Promise<CustomerMessageResponse[]> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      return [];
    }

    const records = await this.prisma.customerMessage.findMany({
      where: {
        tenantId,
        ownerUserId: userId,
        isSpam: false,
        deletedAt: null,
        OR: [{ toEmail: normalized }, { fromEmail: normalized }],
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return records.map((record) => this.toResponse(record));
  }

  private toResponse(entity: CustomerMessageEntity): CustomerMessageResponse {
    return {
      id: entity.id,
      customerId: entity.customerId,
      leadId: entity.leadId,
      contact: entity.contact
        ? {
            id: entity.contact.id,
            name: entity.contact.name,
            role: entity.contact.role,
            email: entity.contact.email,
            channel: entity.contact.channel,
          }
        : null,
      direction: entity.direction,
      status: entity.status,
      subject: entity.subject,
      preview: entity.preview,
      body: entity.body,
      fromEmail: entity.fromEmail,
      toEmail: entity.toEmail,
      attachments: this.toAttachmentResponse(entity.attachments),
      readAt: entity.readAt?.toISOString() ?? null,
      sentAt: entity.sentAt?.toISOString() ?? null,
      receivedAt: entity.receivedAt?.toISOString() ?? null,
      isSpam: entity.isSpam ?? false,
      category: entity.category,
      summary: entity.summary,
      urgency: entity.urgency,
      sentiment: entity.sentiment,
      analyzedAt: entity.analyzedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private requireTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private requireUserId(): string {
    const userId = this.context.getUserId();
    if (!userId) {
      throw new BadRequestException('Benutzer-Kontext fehlt.');
    }
    return userId;
  }

  private buildLeadInitialMessage(lead: {
    id: string;
    fullName: string;
    email: string | null;
    message: string | null;
    createdAt: Date;
  }): CustomerMessageResponse {
    return {
      id: `lead-${lead.id}`,
      customerId: null,
      leadId: lead.id,
      contact: lead.fullName
        ? {
            id: lead.id,
            name: lead.fullName,
            role: lead.email ? 'Kontaktformular' : null,
            email: lead.email,
            channel: 'Web',
          }
        : null,
      direction: CustomerMessageDirection.INBOUND,
      status: CustomerMessageStatus.SENT,
      subject: 'Neue Anfrage über Kontaktformular',
      preview: this.buildPreview(lead.message ?? ''),
      body: lead.message ?? '',
      fromEmail: lead.email ?? undefined,
      toEmail: undefined,
      readAt: null,
      sentAt: lead.createdAt.toISOString(),
      receivedAt: lead.createdAt.toISOString(),
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.createdAt.toISOString(),
      attachments: [],
    };
  }

  private toAttachmentResponse(
    payload: Prisma.JsonValue | null,
  ): CustomerMessageAttachment[] {
    if (!payload || !Array.isArray(payload)) {
      return [];
    }

    return payload.reduce<CustomerMessageAttachment[]>((acc, item) => {
      if (!item || typeof item !== 'object') {
        return acc;
      }
      const attachment = item as Record<string, unknown>;
      const name = typeof attachment.name === 'string' ? attachment.name : null;
      if (!name) {
        return acc;
      }
      acc.push({
        name,
        type: typeof attachment.type === 'string' ? attachment.type : null,
        size: typeof attachment.size === 'number' ? attachment.size : null,
        data: typeof attachment.data === 'string' ? attachment.data : null,
      });
      return acc;
    }, []);
  }

  private normalizeAttachments(
    attachments?: SendAttachmentDto[],
  ): EmailAttachment[] | undefined {
    if (!attachments?.length) {
      return undefined;
    }

    try {
      return attachments.map((attachment) => ({
        filename: attachment.name,
        content: Buffer.from(attachment.data, 'base64'),
        contentType: attachment.type || 'application/octet-stream',
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unbekannter Fehler';
      throw new BadRequestException(
        `Anhänge konnten nicht verarbeitet werden: ${message}`,
      );
    }
  }

  private buildPreview(body: string) {
    const normalized = body.trim().replace(/\s+/g, ' ');
    return normalized.slice(0, 140);
  }

  private resolveMessageId(result: EmailSendResult) {
    return result.messageId ?? undefined;
  }

  private normalizeEmail(value?: string | null) {
    return value?.trim().toLowerCase() || null;
  }

  async markMessagesRead(ids: string[]): Promise<number> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) {
      return 0;
    }
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    const result = await this.prisma.customerMessage.updateMany({
      where: {
        id: { in: uniqueIds },
        tenantId,
        ownerUserId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count ?? 0;
  }

  async moveMessagesToTrash(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) {
      return 0;
    }
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const result = await this.prisma.customerMessage.updateMany({
      where: { id: { in: uniqueIds }, tenantId, ownerUserId: userId },
      data: { deletedAt: new Date() },
    });
    return result.count ?? 0;
  }

  async restoreMessagesFromTrash(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) {
      return 0;
    }
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const result = await this.prisma.customerMessage.updateMany({
      where: { id: { in: uniqueIds }, tenantId, ownerUserId: userId },
      data: { deletedAt: null },
    });
    return result.count ?? 0;
  }

  async extractCustomerFromMessage(
    messageId: string,
  ): Promise<CustomerExtractionResult> {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();

    const message = await this.prisma.customerMessage.findFirst({
      where: { id: messageId, tenantId, ownerUserId: userId },
      include: { contact: true },
    });

    if (!message) {
      throw new NotFoundException('Nachricht wurde nicht gefunden.');
    }

    const openAiSettings = await this.settingsService.getOpenAiSettings({
      includeSecret: true,
    });
    const apiKey = openAiSettings?.apiKey?.trim();
    if (!apiKey) {
      throw new BadRequestException(
        'Für diese Funktion muss in den Einstellungen ein OpenAI-API-Schlüssel hinterlegt werden.',
      );
    }

    const prompt = this.buildCustomerExtractionPrompt(message);

    let payload: unknown;
    try {
      payload = await this.requestCustomerExtraction(prompt, apiKey);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unbekannter Fehler';
      throw new BadRequestException(`Kundenanalyse fehlgeschlagen: ${detail}`);
    }

    const suggestion = this.sanitizeExtractionPayload(payload);

    return {
      messageId: message.id,
      suggestion,
    };
  }

  async getUnreadSummary() {
    const tenantId = this.requireTenantId();
    const userId = this.requireUserId();
    const unassigned = await this.prisma.customerMessage.count({
      where: {
        tenantId,
        ownerUserId: userId,
        customerId: null,
        leadId: null,
        direction: CustomerMessageDirection.INBOUND,
        isSpam: false,
        readAt: null,
        deletedAt: null,
      },
    });

    const leadGroups = await this.prisma.customerMessage.groupBy({
      by: ['leadId'],
      where: {
        tenantId,
        ownerUserId: userId,
        leadId: { not: null },
        direction: CustomerMessageDirection.INBOUND,
        isSpam: false,
        readAt: null,
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const leadCounts = leadGroups.reduce<Record<string, number>>(
      (acc, group) => {
        if (group.leadId) {
          const value =
            typeof group._count === 'object' &&
            group._count &&
            '_all' in group._count
              ? Number((group._count as { _all?: number })._all ?? 0)
              : 0;
          acc[group.leadId] = value;
        }
        return acc;
      },
      {},
    );

    const contactRequests = await this.prisma.lead.count({
      where: {
        tenantId,
        source: 'contact-form',
        processedAt: null,
      },
    });

    const total =
      unassigned +
      Object.values(leadCounts).reduce((sum, value) => sum + value, 0) +
      contactRequests;

    return {
      unassigned,
      leads: leadCounts,
      contactRequests,
      total,
    };
  }

  private buildCustomerExtractionPrompt(message: CustomerMessageEntity) {
    const subject = message.subject?.trim() || '(ohne Betreff)';
    const fromEmail = message.fromEmail || '(unbekannt)';
    const toEmail = message.toEmail || '(unbekannt)';
    const contactName = message.contact?.name || 'kein Eintrag';
    const contactEmail = message.contact?.email || 'unbekannt';
    const receivedAt =
      message.receivedAt?.toISOString() ??
      message.sentAt?.toISOString() ??
      message.createdAt.toISOString();
    const body = this.buildBodySnippet(message);

    return [
      'Du arbeitest als CRM-Spezialist:in und extrahierst strukturierte Daten aus E-Mails.',
      'Nutze ausschließlich Informationen, die explizit im Text oder in den Kopfzeilen stehen. Wenn etwas fehlt oder unklar bleibt, gib null zurück.',
      'Du kennst folgende Prisma-Modelle (Systemfelder dienen nur zur Orientierung und werden nicht befuellt):\n' +
        CUSTOMER_PRISMA_SCHEMA_CONTEXT,
      'Regeln:\n- type darf nur PRIVATE, BUSINESS oder FLEET sein.\n- BUSINESS nur bei klar erkennbarem Unternehmen (z. B. GmbH, AG, Firma, Werkstatt).\n- FLEET nur bei klarer Flotten- oder Mehrfahrzeug-Angabe.\n- marketingOptIn nur true, wenn eine ausdrueckliche Einwilligung genannt wird.\n- customer.notes fasst das Hauptanliegen der Mail in 1-2 Saetzen auf Deutsch zusammen.\n- tags: max. 5 kurze Stichworte aus dem Text; sonst [].\n- vehicle.year ist eine vierstellige Jahreszahl, mileageKm eine Zahl.\n- Extrahiere Daten aus Betreff, Text und Signaturzeilen (z. B. Telefon, Mobil, Adresse).\n- Lass Felder bei null, wenn sie nicht erwaehnt werden.',
      'Hinweise:\n- customer.name = Unternehmen oder Privatperson.\n- contact.* = Ansprechpartner der Nachricht.\n- Wenn nur eine Person genannt wird, setze customer.name und contact.name identisch.\n- Nutze die Absender-E-Mail als contact.email. customer.email nur, wenn sie klar dem Kunden/Unternehmen zugeordnet ist; ansonsten ebenfalls die Absender-E-Mail.',
      'Gib exakt folgendes JSON zurueck (keine zusaetzlichen Texte, keine Kommentare):\n{\n  "customer": {"name": null, "type": "PRIVATE", "email": null, "phone": null, "mobile": null, "street": null, "postalCode": null, "city": null, "preferredChannel": null, "marketingOptIn": false, "notes": null, "tags": [], "lastContactAt": null},\n  "contact": {"name": null, "role": null, "email": null, "phone": null, "channel": null},\n  "vehicle": {"manufacturer": null, "model": null, "trim": null, "licensePlate": null, "vin": null, "year": null, "mileageKm": null, "fuelType": null, "transmission": null, "color": null, "notes": null}\n}',
      `Nachricht:\nBetreff: ${subject}\nVon: ${fromEmail}\nAn: ${toEmail}\nEmpfangen am: ${receivedAt}\nVorhandener Kontakt im CRM: ${contactName} (${contactEmail})`,
      `Inhalt (gekürzt auf 6000 Zeichen):\n${body || '(kein Text vorhanden)'}`,
    ].join('\n\n');
  }

  private async requestCustomerExtraction(prompt: string, apiKey: string) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'Du bist ein gewissenhafter Assistent, der E-Mails fuer ein Autohaus analysiert und nur Fakten in strukturierter Form zurueckgibt.',
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
      const parsed: unknown = JSON.parse(normalized);
      return parsed;
    } catch {
      throw new Error(
        'Die OpenAI-Antwort konnte nicht als JSON interpretiert werden.',
      );
    }
  }

  private sanitizeExtractionPayload(
    payload: unknown,
  ): CustomerExtractionSuggestion {
    const suggestion: CustomerExtractionSuggestion = { customer: {} };
    if (!payload || typeof payload !== 'object') {
      return suggestion;
    }

    const record = payload as Record<string, unknown>;
    const customerPayload = record.customer;
    if (customerPayload && typeof customerPayload === 'object') {
      const customer = customerPayload as Record<string, unknown>;
      const name = this.sanitizeString(customer.name, 191);
      if (name) {
        suggestion.customer.name = name;
      }
      const type = this.sanitizeEnum(customer.type, [
        CustomerType.PRIVATE,
        CustomerType.BUSINESS,
        CustomerType.FLEET,
      ]);
      if (type) {
        suggestion.customer.type = type;
      }
      const email = this.sanitizeString(customer.email, 191);
      if (email) {
        suggestion.customer.email = email;
      }
      const phone = this.sanitizeString(customer.phone, 64);
      if (phone) {
        suggestion.customer.phone = phone;
      }
      const mobile = this.sanitizeString(customer.mobile, 64);
      if (mobile) {
        suggestion.customer.mobile = mobile;
      }
      const street = this.sanitizeString(customer.street, 191);
      if (street) {
        suggestion.customer.street = street;
      }
      const postalCode = this.sanitizeString(customer.postalCode, 32);
      if (postalCode) {
        suggestion.customer.postalCode = postalCode;
      }
      const city = this.sanitizeString(customer.city, 120);
      if (city) {
        suggestion.customer.city = city;
      }
      const preferredChannel = this.sanitizeString(
        customer.preferredChannel,
        64,
      );
      if (preferredChannel) {
        suggestion.customer.preferredChannel = preferredChannel;
      }
      const marketingOptIn = this.sanitizeBoolean(customer.marketingOptIn);
      if (typeof marketingOptIn === 'boolean') {
        suggestion.customer.marketingOptIn = marketingOptIn;
      }
      const notes = this.sanitizeString(customer.notes, 2000);
      if (notes) {
        suggestion.customer.notes = notes;
      }
      const tags = this.sanitizeTags(customer.tags);
      if (tags) {
        suggestion.customer.tags = tags;
      }
      const lastContactAt = this.sanitizeDate(customer.lastContactAt);
      if (lastContactAt) {
        suggestion.customer.lastContactAt = lastContactAt;
      }
    }

    const contactPayload = record.contact;
    if (contactPayload && typeof contactPayload === 'object') {
      const contact = contactPayload as Record<string, unknown>;
      const contactSuggestion: NonNullable<
        CustomerExtractionSuggestion['contact']
      > = {};
      const name = this.sanitizeString(contact.name, 191);
      if (name) {
        contactSuggestion.name = name;
      }
      const role = this.sanitizeString(contact.role, 120);
      if (role) {
        contactSuggestion.role = role;
      }
      const email = this.sanitizeString(contact.email, 191);
      if (email) {
        contactSuggestion.email = email;
      }
      const phone = this.sanitizeString(contact.phone, 64);
      if (phone) {
        contactSuggestion.phone = phone;
      }
      const channel = this.sanitizeString(contact.channel, 64);
      if (channel) {
        contactSuggestion.channel = channel;
      }
      if (Object.keys(contactSuggestion).length) {
        suggestion.contact = contactSuggestion;
      }
    }

    const vehiclePayload = record.vehicle;
    if (vehiclePayload && typeof vehiclePayload === 'object') {
      const vehicle = vehiclePayload as Record<string, unknown>;
      const vehicleSuggestion: NonNullable<
        CustomerExtractionSuggestion['vehicle']
      > = {};
      const manufacturer = this.sanitizeString(vehicle.manufacturer, 120);
      if (manufacturer) {
        vehicleSuggestion.manufacturer = manufacturer;
      }
      const model = this.sanitizeString(vehicle.model, 120);
      if (model) {
        vehicleSuggestion.model = model;
      }
      const trim = this.sanitizeString(vehicle.trim, 120);
      if (trim) {
        vehicleSuggestion.trim = trim;
      }
      const licensePlate = this.sanitizeString(vehicle.licensePlate, 64);
      if (licensePlate) {
        vehicleSuggestion.licensePlate = licensePlate;
      }
      const vin = this.sanitizeString(vehicle.vin, 191);
      if (vin) {
        vehicleSuggestion.vin = vin;
      }
      const year = this.sanitizeInt(vehicle.year, { min: 1950, max: 2100 });
      if (typeof year === 'number') {
        vehicleSuggestion.year = year;
      }
      const mileageKm = this.sanitizeInt(vehicle.mileageKm, {
        min: 0,
        max: 2_000_000,
      });
      if (typeof mileageKm === 'number') {
        vehicleSuggestion.mileageKm = mileageKm;
      }
      const fuelType = this.sanitizeEnum(vehicle.fuelType, [
        VehicleFuelType.DIESEL,
        VehicleFuelType.GASOLINE,
        VehicleFuelType.ELECTRIC,
        VehicleFuelType.HYBRID,
        VehicleFuelType.LPG,
        VehicleFuelType.OTHER,
      ]);
      if (fuelType) {
        vehicleSuggestion.fuelType = fuelType;
      }
      const transmission = this.sanitizeEnum(vehicle.transmission, [
        VehicleTransmission.AUTOMATIC,
        VehicleTransmission.MANUAL,
      ]);
      if (transmission) {
        vehicleSuggestion.transmission = transmission;
      }
      const color = this.sanitizeString(vehicle.color, 64);
      if (color) {
        vehicleSuggestion.color = color;
      }
      const notes = this.sanitizeString(vehicle.notes, 500);
      if (notes) {
        vehicleSuggestion.notes = notes;
      }
      if (Object.keys(vehicleSuggestion).length) {
        suggestion.vehicle = vehicleSuggestion;
      }
    }

    return suggestion;
  }

  private buildBodySnippet(message: CustomerMessageEntity) {
    const parts = [] as string[];
    if (message.body?.trim()) {
      parts.push(message.body.trim());
    }
    if (message.summary?.trim()) {
      parts.push(`Zusammenfassung: ${message.summary.trim()}`);
    }
    if (message.preview?.trim()) {
      parts.push(`Auszug: ${message.preview.trim()}`);
    }
    const combined = parts.join('\n\n');
    return combined.slice(0, 6000);
  }

  private sanitizeString(value: unknown, maxLength = 191) {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.slice(0, maxLength);
  }

  private sanitizeBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private sanitizeTags(value: unknown) {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const tags = value
      .map((entry) => this.sanitizeString(entry, 32))
      .filter((entry): entry is string => Boolean(entry));
    if (!tags.length) {
      return undefined;
    }
    const unique = Array.from(new Set(tags));
    return unique.slice(0, 5);
  }

  private sanitizeDate(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  }

  private sanitizeInt(
    value: unknown,
    options?: { min?: number; max?: number },
  ) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    const normalized = Math.trunc(value);
    if (options?.min !== undefined && normalized < options.min) {
      return undefined;
    }
    if (options?.max !== undefined && normalized > options.max) {
      return undefined;
    }
    return normalized;
  }

  private sanitizeEnum<T extends string>(value: unknown, allowed: T[]) {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim().toUpperCase();
    const match = allowed.find((item) => item === normalized);
    return match;
  }
}
