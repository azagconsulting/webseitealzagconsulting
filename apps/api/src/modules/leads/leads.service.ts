import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeadPriority, LeadStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmailService } from '../../infra/mailer/email.service';
import type { SmtpCredentials } from '../../common/interfaces/smtp-settings.interface';
import type { WorkspaceSettings } from '../../common/interfaces/workspace-settings.interface';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ContactRequestDto } from './dto/contact-request.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadSettingsDto } from './dto/update-lead-settings.dto';

type LeadEntity = Prisma.LeadGetPayload<{ include: { assignedTo: true } }>;

type LeadWorkflowSettingsEntity = Prisma.LeadWorkflowSettingGetPayload<{
  include: { autoAssignUser: true };
}>;

type LeadPayload = {
  fullName?: string | null;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  priority?: LeadPriority | null;
  message?: string | null;
};

export interface ContactRequestExtractionSuggestion {
  name?: string;
  email?: string;
  phone?: string;
  concern?: string;
}

export interface ContactRequestExtractionResult {
  leadId: string;
  suggestion: ContactRequestExtractionSuggestion;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    private readonly context: RequestContextService,
  ) {}

  async createFromLanding(dto: CreateLeadDto) {
    const tenantId = this.getTenantId() ?? (await this.getDefaultTenantId());
    if (!tenantId) {
      throw new BadRequestException('Tenant für Lead-Erstellung fehlt.');
    }

    const payload: LeadPayload = {
      fullName: dto.fullName,
      email: dto.email,
      company: dto.company ?? null,
      phone: dto.phone ?? null,
      message: dto.message ?? null,
      priority: dto.priority ?? LeadPriority.MEDIUM,
    };

    return this.context.run({ tenantId }, async () => {
      const settings = await this.ensureWorkflowSettings({ tenantId });
      const workspaceSettings =
        (await this.settingsService.getWorkspaceSettings()) ?? null;
      const contactSmtp =
        (await this.settingsService.getContactFormSmtpCredentials()) ?? null;

      if (!contactSmtp) {
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte Kontaktformular-SMTP hinterlegen.',
        );
      }

      const targetAddress =
        contactSmtp.fromEmail?.trim() || contactSmtp.username?.trim() || null;

      if (!targetAddress) {
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden: SMTP-Absender/User nicht konfiguriert.',
        );
      }

      const subject = `Website Kontakt: ${
        payload.fullName || payload.email || 'Kontaktformular'
      }`;
      const companyName = this.getCompanyName(workspaceSettings);
      const text = this.buildContactEmailText(payload, companyName);
      const html = this.buildContactEmailHtml(payload, companyName);
      const replyTo = payload.email?.trim() || undefined;
      const from =
        contactSmtp.fromEmail?.trim() ||
        contactSmtp.username?.trim() ||
        undefined;

      try {
        await this.emailService.sendEmail(
          {
            to: targetAddress,
            subject,
            text,
            html,
            from,
            replyTo,
            headers: { 'X-Arcto-Source': 'contact-form' },
          },
          contactSmtp,
        );
      } catch (error) {
        this.logger.error(
          `Kontaktformular konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
        );
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte SMTP-Einstellungen prüfen.',
        );
      }

      await this.sendAutoResponder(payload, settings, contactSmtp);

      return { success: true };
    });
  }

  async sendContactRequest(dto: ContactRequestDto) {
    const tenantId = this.getTenantId() ?? (await this.getDefaultTenantId());
    if (!tenantId) {
      throw new BadRequestException(
        'Kein Tenant für Kontaktformular gefunden.',
      );
    }

    const payload: LeadPayload = {
      fullName: dto.fullName,
      email: dto.email,
      company: dto.company ?? null,
      phone: dto.phone ?? null,
      message: dto.message ?? null,
      priority: LeadPriority.MEDIUM,
    };

    return this.context.run({ tenantId }, async () => {
      const contactSmtp =
        (await this.settingsService.getContactFormSmtpCredentials()) ?? null;
      const workspaceSettings =
        (await this.settingsService.getWorkspaceSettings()) ?? null;
      const companyName = this.getCompanyName(workspaceSettings);
      const fullName = payload.fullName?.trim();

      if (!fullName) {
        throw new BadRequestException('Name ist erforderlich.');
      }

      await this.prisma.lead.create({
        data: {
          tenantId,
          fullName,
          email: payload.email?.trim() || '',
          company: payload.company?.trim() || null,
          phone: payload.phone?.trim() || null,
          message: payload.message?.trim() || null,
          priority: payload.priority ?? LeadPriority.MEDIUM,
          source: 'contact-form',
        },
      });

      const smtpCredentials = contactSmtp;
      const fromAddress =
        smtpCredentials?.fromEmail?.trim() ||
        smtpCredentials?.username?.trim() ||
        null;

      if (!smtpCredentials || !fromAddress) {
        const contactMeta =
          (await this.settingsService.getContactFormSmtpSettings()) ?? null;
        this.logger.warn(
          `Kontaktformular Bestätigung übersprungen: Kein Absender (meta=${JSON.stringify(
            contactMeta,
          )})`,
        );
        return { success: true };
      }

      if (payload.email?.trim()) {
        const company = companyName ?? 'unser Team';
        const ackSubject = `Vielen Dank für Ihre Kontaktanfrage bei ${company}`;
        const ackText = this.buildContactAcknowledgementText(
          payload,
          companyName,
        );
        const ackHtml = this.buildContactAcknowledgementHtml(
          payload,
          companyName,
        );
        try {
          await this.emailService.sendEmail(
            {
              to: payload.email.trim(),
              subject: ackSubject,
              text: ackText,
              html: ackHtml,
              from: fromAddress,
              replyTo: fromAddress,
            },
            smtpCredentials ?? undefined,
          );
        } catch (error) {
          this.logger.warn(
            `Bestätigungs-Mail konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
          );
        }
      }

      return { success: true };
    });
  }

  async listLeads(limit = 25) {
    const tenantId = this.requireTenantId();
    return this.prisma.lead.findMany({
      where: { tenantId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { assignedTo: true },
    });
  }

  async extractContactRequest(
    leadId: string,
  ): Promise<ContactRequestExtractionResult> {
    const tenantId = this.requireTenantId();
    const userId = this.context.getUserId();
    if (!userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId, tenantId },
    });

    if (!lead) {
      throw new NotFoundException('Kontaktanfrage nicht gefunden');
    }

    const openAiSettings = await this.settingsService.getOpenAiSettings({
      includeSecret: true,
    });
    const apiKey = openAiSettings?.apiKey?.trim();
    if (!apiKey) {
      throw new BadRequestException(
        'Fuer diese Funktion muss in den Einstellungen ein OpenAI-API-Schluessel hinterlegt werden.',
      );
    }

    const prompt = this.buildContactRequestExtractionPrompt(lead);

    let payload: unknown;
    try {
      payload = await this.requestContactRequestExtraction(prompt, apiKey);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unbekannter Fehler';
      throw new BadRequestException(
        `Kontaktanfrage-Analyse fehlgeschlagen: ${detail}`,
      );
    }

    const suggestion = this.sanitizeContactRequestExtraction(payload);

    return {
      leadId: lead.id,
      suggestion,
    };
  }

  // Entfernt Kontaktanfragen nach 30 Tagen.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeOldCallbackLeads() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stale = await this.prisma.lead.findMany({
      where: {
        source: { in: ['chatbot-callback', 'contact-form'] },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });
    if (!stale.length) return;
    const ids = stale.map((lead) => lead.id);
    await this.prisma.leadUpdate.deleteMany({
      where: { leadId: { in: ids } },
    });
    const result = await this.prisma.lead.deleteMany({
      where: { id: { in: ids } },
    });
    if (result.count) {
      this.logger.log(
        `Kontaktanfragen bereinigt: ${result.count} Einträge gelöscht.`,
      );
    }
  }

  async updateLead(id: string, dto: UpdateLeadDto, actor?: AuthUser) {
    const existing = await this.ensureLeadExists(id);

    const data: Prisma.LeadUpdateInput = {};

    if (dto.status) {
      data.status = dto.status;
      data.processedAt =
        dto.status === LeadStatus.NEW
          ? null
          : (existing.processedAt ?? new Date());

      data.archivedAt = dto.status === LeadStatus.ARCHIVED ? new Date() : null;
    }

    if (dto.priority) {
      data.priority = dto.priority;
    }

    if (dto.routingLabel) {
      data.routingLabel = dto.routingLabel;
    }

    if (dto.assignedToId) {
      await this.ensureUser(dto.assignedToId);
    }

    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: { assignedTo: true },
    });

    if (dto.status || dto.note) {
      await this.prisma.leadUpdate.create({
        data: {
          tenantId: existing.tenantId,
          leadId: updated.id,
          userId: actor?.sub ?? null,
          status: dto.status ?? updated.status,
          note: dto.note,
        },
      });
    }

    return updated;
  }

  async deleteLead(id: string) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Lead nicht gefunden');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.leadUpdate.deleteMany({ where: { leadId: id, tenantId } });
      await tx.lead.delete({ where: { id } });
    });
  }

  async markLeadRead(id: string) {
    const existing = await this.ensureLeadExists(id);

    const processedAt = existing.processedAt ?? new Date();

    return this.prisma.lead.update({
      where: { id },
      data: { processedAt },
    });
  }

  async getTimeline(leadId: string) {
    const tenantId = this.requireTenantId();
    await this.ensureLeadExists(leadId);

    return this.prisma.leadUpdate.findMany({
      where: { leadId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async ensureWorkflowSettings(defaults?: {
    notifyEmail?: string;
    autoAssignUserId?: string;
    tenantId?: string;
  }) {
    const tenantId = defaults?.tenantId ?? this.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }

    let settings = await this.prisma.leadWorkflowSetting.findFirst({
      include: { autoAssignUser: true },
      where: { tenantId },
    });

    if (!settings) {
      settings = await this.prisma.leadWorkflowSetting.create({
        data: {
          tenantId,
          notifyEmail: defaults?.notifyEmail,
          routingHeadline: 'Kontaktaufnahme',
          routingDescription: 'Neue Leads landen direkt im Dashboard.',
          autoAssignUserId: defaults?.autoAssignUserId,
        },
        include: { autoAssignUser: true },
      });
    }

    return settings;
  }

  async getWorkflowSettings() {
    return this.ensureWorkflowSettings();
  }

  async updateWorkflowSettings(dto: UpdateLeadSettingsDto) {
    if (dto.autoAssignUserId) {
      await this.ensureUser(dto.autoAssignUserId);
    }

    const existing = await this.prisma.leadWorkflowSetting.findFirst({
      where: { tenantId: this.getTenantId() },
    });
    if (!existing) {
      return this.ensureWorkflowSettings({
        notifyEmail: dto.notifyEmail,
        autoAssignUserId: dto.autoAssignUserId ?? undefined,
        tenantId: this.getTenantId(),
      });
    }

    const data: Prisma.LeadWorkflowSettingUpdateInput = {
      notifyEmail: dto.notifyEmail ?? existing.notifyEmail,
      routingHeadline: dto.routingHeadline ?? existing.routingHeadline,
      routingDescription: dto.routingDescription ?? existing.routingDescription,
      autoResponderEnabled:
        dto.autoResponderEnabled ?? existing.autoResponderEnabled,
      autoResponderMessage:
        dto.autoResponderMessage ?? existing.autoResponderMessage,
    };

    if (dto.autoAssignUserId !== undefined) {
      data.autoAssignUser = dto.autoAssignUserId
        ? { connect: { id: dto.autoAssignUserId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.leadWorkflowSetting.update({
      where: { id: existing.id },
      data,
      include: { autoAssignUser: true },
    });

    return updated;
  }

  private async notifyTeamOfLead(
    lead: LeadEntity,
    settings: LeadWorkflowSettingsEntity | null,
    smtpCredentials: SmtpCredentials | null,
  ) {
    const recipients = await this.collectNotificationRecipients(settings, lead);
    if (!recipients.length) {
      this.logger.warn(
        'Neue Anfrage ohne Benachrichtigung, da kein Empfänger ermittelt werden konnte.',
      );
      return;
    }

    const subject = `Neue Anfrage: ${
      lead.fullName || lead.email || 'Kontaktformular'
    }`;
    const text = this.buildLeadSummaryText(lead);
    const html = this.buildLeadSummaryHtml(lead);

    await Promise.all(
      recipients.map(async (to) => {
        try {
          await this.emailService.sendEmail(
            { to, subject, text, html },
            smtpCredentials ?? undefined,
          );
        } catch (error) {
          this.logger.error(
            `Benachrichtigung an ${to} konnte nicht gesendet werden: ${
              (error as Error)?.message ?? error
            }`,
          );
        }
      }),
    );
  }

  private async sendAutoResponder(
    lead: LeadPayload,
    settings: LeadWorkflowSettingsEntity | null,
    smtpCredentials: SmtpCredentials | null,
  ) {
    if (
      !settings?.autoResponderEnabled ||
      !settings.autoResponderMessage?.trim()
    ) {
      return;
    }

    const toEmail = lead.email?.trim();
    if (!toEmail) {
      return;
    }

    const subject = settings.routingHeadline
      ? `${settings.routingHeadline} – wir melden uns`
      : 'Danke für deine Nachricht';

    const text = this.renderTemplate(
      settings.autoResponderMessage.trim(),
      lead,
    ).trim();

    if (!text) {
      return;
    }

    const html = this.formatHtml(text);

    try {
      await this.emailService.sendEmail(
        {
          to: toEmail,
          subject,
          text,
          html,
        },
        smtpCredentials ?? undefined,
      );
    } catch (error) {
      this.logger.error(
        `Auto-Responder konnte nicht gesendet werden: ${
          (error as Error)?.message ?? error
        }`,
      );
    }
  }

  private async forwardLeadToInbox(
    lead: LeadPayload,
    smtpCredentials: SmtpCredentials | null,
  ) {
    if (!smtpCredentials) {
      this.logger.warn(
        'Kontaktformular konnte nicht weitergeleitet werden – kein Kontakt-SMTP hinterlegt.',
      );
      return;
    }

    const imapSettings = await this.settingsService.getImapCredentials();
    const targetAddress =
      imapSettings?.username?.trim() ||
      smtpCredentials?.fromEmail?.trim() ||
      smtpCredentials?.username?.trim() ||
      null;

    if (!targetAddress) {
      this.logger.warn(
        'Kontaktformular konnte nicht weitergeleitet werden – keine Zieladresse gefunden.',
      );
      return;
    }

    const subject = `Website Kontakt: ${
      lead.fullName || lead.email || 'Kontaktformular'
    }`;
    const workspaceSettings =
      (await this.settingsService.getWorkspaceSettings()) ?? null;
    const companyName = this.getCompanyName(workspaceSettings);
    const text = this.buildContactEmailText(lead, companyName);
    const html = this.buildContactEmailHtml(lead, companyName);

    const replyTo = lead.email?.trim() || undefined;
    const from =
      lead.fullName && lead.email
        ? `${lead.fullName} <${lead.email}>`
        : lead.email?.trim() || undefined;

    try {
      await this.emailService.sendEmail(
        {
          to: targetAddress,
          subject,
          text,
          html,
          from,
          replyTo,
        },
        smtpCredentials,
      );
    } catch (error) {
      this.logger.error(
        `Kontaktformular konnte nicht weitergeleitet werden: ${
          (error as Error)?.message ?? error
        }`,
      );
    }
  }

  private async collectNotificationRecipients(
    settings: LeadWorkflowSettingsEntity | null,
    lead: LeadEntity,
  ) {
    const recipients = new Set<string>();
    const normalized = (value?: string | null) =>
      value?.trim().toLowerCase() ?? null;

    const notifyEmail = normalized(settings?.notifyEmail);
    if (notifyEmail) {
      recipients.add(notifyEmail);
    }

    const autoAssignEmail = normalized(settings?.autoAssignUser?.email);
    if (autoAssignEmail) {
      recipients.add(autoAssignEmail);
    }

    const assignedEmail = normalized(lead.assignedTo?.email);
    if (assignedEmail) {
      recipients.add(assignedEmail);
    }

    if (!recipients.size) {
      const fallbackUsers = await this.usersService.listAssignableUsers();
      fallbackUsers
        .map((user) => normalized(user.email))
        .filter((email): email is string => Boolean(email))
        .slice(0, 5)
        .forEach((email) => recipients.add(email));
    }

    return Array.from(recipients);
  }

  private buildLeadSummaryText(lead: LeadPayload) {
    const lines = [
      `Name: ${lead.fullName || 'Unbekannt'}`,
      `E-Mail: ${lead.email ?? '–'}`,
      `Firma: ${lead.company ?? '–'}`,
      `Telefon: ${lead.phone ?? '–'}`,
      `Priorität: ${lead.priority}`,
    ];

    const message = lead.message
      ? `\nNachricht:\n${lead.message}`
      : '\nNachricht:\n–';

    return `Neue Anfrage über das Kontaktformular\n\n${lines.join(
      '\n',
    )}${message}`;
  }

  private buildLeadSummaryHtml(lead: LeadPayload) {
    const fields = [
      { label: 'Name', value: lead.fullName || 'Unbekannt' },
      { label: 'E-Mail', value: lead.email ?? '–' },
      { label: 'Firma', value: lead.company ?? '–' },
      { label: 'Telefon', value: lead.phone ?? '–' },
      { label: 'Priorität', value: lead.priority },
    ];

    const fieldHtml = fields
      .map(
        (field) =>
          `<p><strong>${field.label}:</strong> ${this.escapeHtml(
            String(field.value ?? '–'),
          )}</p>`,
      )
      .join('');

    const messageHtml = lead.message
      ? `<p><strong>Nachricht:</strong><br />${this.formatHtml(lead.message)}</p>`
      : '<p><strong>Nachricht:</strong> –</p>';

    return `<div>${fieldHtml}${messageHtml}</div>`;
  }

  private buildContactEmailText(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const intro = [
      'Hallo Team,',
      'es ist eine neue Anfrage über das Kontaktformular eingegangen:',
      '',
    ];

    const details = [
      `Name: ${lead.fullName || 'Unbekannt'}`,
      `E-Mail: ${lead.email ?? '–'}`,
      `Firma: ${lead.company ?? '–'}`,
      `Telefon: ${lead.phone ?? '–'}`,
      `Priorität: ${lead.priority}`,
      '',
      'Nachricht:',
      lead.message?.trim() || '–',
    ];

    const signature = companyName?.trim()
      ? ['', 'Mit freundlichen Grüßen', companyName.trim()]
      : [];

    return [...intro, ...details, ...signature].join('\n');
  }

  private buildContactEmailHtml(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const company = companyName?.trim() || 'Team';
    const fields = [
      { label: 'Name', value: lead.fullName || 'Unbekannt' },
      { label: 'E-Mail', value: lead.email ?? '–' },
      { label: 'Firma', value: lead.company ?? '–' },
      { label: 'Telefon', value: lead.phone ?? '–' },
      { label: 'Priorität', value: lead.priority },
    ];

    const fieldHtml = fields
      .map(
        (field) =>
          `<div style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #1f2937;">
            <span style="color:#9ca3af; font-size:13px;">${this.escapeHtml(field.label)}</span>
            <span style="color:#e5e7eb; font-size:14px;">${this.escapeHtml(
              String(field.value ?? '–'),
            )}</span>
          </div>`,
      )
      .join('');

    const messageHtml = lead.message
      ? `<div style="padding:12px; border-radius:12px; background:#0f172a; border:1px solid #1f2937; color:#e5e7eb; font-size:14px; line-height:1.6;">
            <div style="color:#9ca3af; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">Nachricht</div>
            ${this.formatHtml(lead.message)}
         </div>`
      : '<div style="padding:12px; border-radius:12px; background:#0f172a; border:1px solid #1f2937; color:#9ca3af; font-size:14px;">Nachricht: –</div>';

    const signature = companyName?.trim()
      ? `<p style="margin:16px 0 0 0; color:#e5e7eb; font-size:14px;">Mit freundlichen Grüßen<br /><strong>${this.escapeHtml(
          companyName.trim(),
        )}</strong></p>`
      : '';

    return `<div style="background:#0b1220; padding:20px;">
      <div style="max-width:640px; margin:0 auto; background:#111827; border:1px solid #1f2937; border-radius:16px; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <p style="margin:0 0 12px 0; color:#9ca3af; font-size:13px;">Hallo Team,</p>
        <p style="margin:0 0 18px 0; color:#e5e7eb; font-size:15px;">es ist eine neue Anfrage über das Kontaktformular eingegangen:</p>
        <div style="border:1px solid #1f2937; border-radius:12px; overflow:hidden; background:#0f172a;">
          ${fieldHtml}
        </div>
        <div style="margin-top:16px;">${messageHtml}</div>
        ${signature}
        <p style="margin:12px 0 0 0; color:#64748b; font-size:12px;">Empfangen von ${this.escapeHtml(
          company,
        )}</p>
      </div>
    </div>`;
  }

  private buildContactAcknowledgementText(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const company = companyName?.trim() || 'unser Team';
    const greeting = lead.fullName?.trim()
      ? `Hallo ${lead.fullName.trim()},`
      : 'Hallo,';

    const lines = [
      greeting,
      '',
      `vielen Dank für deine Nachricht an ${company}. Wir melden uns so schnell wie möglich.`,
      '',
      'Kurzfassung deiner Angaben:',
      `Name: ${lead.fullName || '–'}`,
      `E-Mail: ${lead.email ?? '–'}`,
      `Firma: ${lead.company ?? '–'}`,
      `Telefon: ${lead.phone ?? '–'}`,
      '',
      'Nachricht:',
      lead.message?.trim() || '–',
      '',
      'Mit freundlichen Grüßen',
      company,
    ];

    return lines.join('\n');
  }

  private buildContactAcknowledgementHtml(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const company = companyName?.trim() || 'unser Team';
    const greeting = lead.fullName?.trim()
      ? `Hallo ${this.escapeHtml(lead.fullName.trim())},`
      : 'Hallo,';

    const fields = [
      { label: 'Name', value: lead.fullName || '–' },
      { label: 'E-Mail', value: lead.email ?? '–' },
      { label: 'Firma', value: lead.company ?? '–' },
      { label: 'Telefon', value: lead.phone ?? '–' },
    ];

    const fieldHtml = fields
      .map(
        (field) =>
          `<div style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #1f2937;">
            <span style="color:#9ca3af; font-size:13px;">${this.escapeHtml(field.label)}</span>
            <span style="color:#e5e7eb; font-size:14px;">${this.escapeHtml(
              String(field.value ?? '–'),
            )}</span>
          </div>`,
      )
      .join('');

    const messageHtml = lead.message
      ? `<div style="padding:12px; border-radius:12px; background:#0f172a; border:1px solid #1f2937; color:#e5e7eb; font-size:14px; line-height:1.6;">
            <div style="color:#9ca3af; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">Nachricht</div>
            ${this.formatHtml(lead.message)}
         </div>`
      : '<div style="padding:12px; border-radius:12px; background:#0f172a; border:1f2937; color:#9ca3af; font-size:14px;">Nachricht: –</div>';

    return `<div style="background:#0b1220; padding:20px;">
      <div style="max-width:640px; margin:0 auto; background:#111827; border:1px solid #1f2937; border-radius:16px; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <p style="margin:0 0 12px 0; color:#e5e7eb; font-size:15px;">${greeting}</p>
        <p style="margin:0 0 16px 0; color:#cbd5e1; font-size:14px; line-height:1.6;">
          vielen Dank für deine Nachricht an ${this.escapeHtml(
            company,
          )}. Wir melden uns so schnell wie möglich.
        </p>
        <p style="margin:0 0 8px 0; color:#9ca3af; font-size:12px; letter-spacing:0.08em; text-transform:uppercase;">Kurzfassung</p>
        <div style="border:1px solid #1f2937; border-radius:12px; overflow:hidden; background:#0f172a;">
          ${fieldHtml}
        </div>
        <div style="margin-top:16px;">${messageHtml}</div>
        <p style="margin:16px 0 0 0; color:#e5e7eb; font-size:14px;">Mit freundlichen Grüßen<br /><strong>${this.escapeHtml(
          company,
        )}</strong></p>
      </div>
    </div>`;
  }

  private getCompanyName(settings?: WorkspaceSettings | null) {
    return settings?.companyName?.trim() ?? settings?.legalName?.trim() ?? null;
  }

  private formatHtml(content: string) {
    return this.escapeHtml(content).replace(/\n/g, '<br />');
  }

  private buildContactRequestExtractionPrompt(lead: {
    fullName: string;
    email: string | null;
    phone: string | null;
    message: string | null;
  }) {
    const name = lead.fullName?.trim() || '(unbekannt)';
    const email = lead.email?.trim() || '(unbekannt)';
    const phone = lead.phone?.trim() || '(unbekannt)';
    const message = lead.message?.trim() || '';
    const snippet = message ? message.slice(0, 3000) : '(keine Nachricht)';

    return [
      'Du extrahierst nur die folgenden Felder aus Kontaktanfragen: name, email, phone, concern.',
      'Nutze ausschliesslich Informationen, die explizit im Text oder in den Feldern stehen. Wenn etwas fehlt, gib null zurueck.',
      'concern fasst das Anliegen der Anfrage in einem kurzen Satz auf Deutsch zusammen.',
      'Gib exakt folgendes JSON zurueck (keine zusaetzlichen Texte, keine Kommentare):\n{\n  "name": null,\n  "email": null,\n  "phone": null,\n  "concern": null\n}',
      `Kontaktanfrage:\nName: ${name}\nE-Mail: ${email}\nTelefon: ${phone}\nNachricht:\n${snippet}`,
    ].join('\n\n');
  }

  private async requestContactRequestExtraction(prompt: string, apiKey: string) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'Du gibst nur minimale, belegbare Daten aus Kontaktanfragen zurueck. Keine Vermutungen.',
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
      return JSON.parse(normalized);
    } catch (error) {
      throw new Error(
        'Die OpenAI-Antwort konnte nicht als JSON interpretiert werden.',
      );
    }
  }

  private sanitizeContactRequestExtraction(
    payload: unknown,
  ): ContactRequestExtractionSuggestion {
    if (!payload || typeof payload !== 'object') {
      return {};
    }
    const record = payload as Record<string, unknown>;
    const name = this.sanitizeExtractionString(record.name, 191);
    const email = this.sanitizeExtractionEmail(record.email);
    const phone = this.sanitizeExtractionString(record.phone, 64);
    const concern = this.sanitizeExtractionString(record.concern, 800);

    return {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(concern ? { concern } : {}),
    };
  }

  private sanitizeExtractionString(value: unknown, maxLength = 191) {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.slice(0, maxLength);
  }

  private sanitizeExtractionEmail(value: unknown) {
    const email = this.sanitizeExtractionString(value, 191);
    if (!email) {
      return undefined;
    }
    const normalized = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return undefined;
    }
    return normalized.toLowerCase();
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  private renderTemplate(template: string, lead: LeadPayload) {
    const replacements: Record<string, string> = {
      name: lead.fullName ?? '',
      firstName: lead.fullName?.split(' ')[0] ?? lead.fullName ?? '',
      email: lead.email ?? '',
      company: lead.company ?? '',
      phone: lead.phone ?? '',
    };

    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token: string) => {
      const key = token;
      return replacements[key] ?? '';
    });
  }

  private async ensureLeadExists(id: string) {
    const tenantId = this.requireTenantId();
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead nicht gefunden');
    }
    return lead;
  }

  private async ensureUser(userId: string) {
    const tenantId = this.requireTenantId();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new NotFoundException('User für Assignment nicht gefunden');
    }
    return user;
  }

  private getTenantId(): string | undefined {
    return this.context.getTenantId();
  }

  private requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private async getDefaultTenantId(): Promise<string | undefined> {
    const tenant = await this.prisma.tenant.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return tenant?.id;
  }
}
