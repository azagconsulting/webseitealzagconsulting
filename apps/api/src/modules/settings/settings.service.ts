import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, TenantSetting, UserRole } from '@prisma/client';
import nodemailer from 'nodemailer';

import {
  ContactFormSmtpSettings,
  SmtpCredentials,
  SmtpEncryption,
  SmtpSettingsResponse,
} from '../../common/interfaces/smtp-settings.interface';
import { UpdateContactSmtpSettingsDto } from './dto/update-contact-smtp-settings.dto';
import {
  ImapCredentials,
  ImapSettingsResponse,
  ImapEncryption,
} from '../../common/interfaces/imap-settings.interface';
import { MessageAnalysisSettings } from '../../common/interfaces/message-analysis.interface';
import { WorkspaceSettings } from '../../common/interfaces/workspace-settings.interface';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateImapSettingsDto } from './dto/update-imap-settings.dto';
import { UpdateWorkspaceSettingsDto } from './dto/update-workspace-settings.dto';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';
import { UpdateAnalysisSettingsDto } from './dto/update-analysis-settings.dto';
import { UpdateOpenAiSettingsDto } from './dto/update-openai-settings.dto';
import { UpdateChatbotOpenAiSettingsDto } from './dto/update-chatbot-openai-settings.dto';
import { UpdateChatbotKnowledgeDto } from './dto/update-chatbot-knowledge.dto';
import { UpdateChatbotLauncherDto } from './dto/update-chatbot-launcher.dto';
import { OpenAiSettings } from '../../common/interfaces/openai-settings.interface';

type WorkspaceProfileWithLogo = Prisma.WorkspaceProfileGetPayload<{
  include: { logoFile: true };
}>;

const SMTP_SETTING_KEY = 'smtp-settings';
const CONTACT_SMTP_SETTING_KEY = 'contact-smtp-settings';
const IMAP_SETTING_KEY = 'imap-settings';
const IMAP_SYNC_STATE_KEY = 'imap-sync-state';
const WORKSPACE_SETTING_KEY = 'workspace-settings';
const API_SETTING_KEY = 'api-settings';
const MESSAGE_ANALYSIS_SETTING_KEY = 'message-analysis-settings';
const OPENAI_SETTING_KEY = 'openai-settings';
const USER_KEY_SUFFIX = (baseKey: string, userId: string) =>
  `${baseKey}:user:${userId}`;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private requireTenantId() {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }
    return tenantId;
  }

  async getSmtpSettings(): Promise<SmtpSettingsResponse | null> {
    const stored = await this.getStoredSmtpSettings(true);
    if (!stored) {
      return null;
    }
    return this.mapToResponse(stored);
  }

  async getSmtpCredentials(): Promise<SmtpCredentials | null> {
    const stored = await this.getStoredSmtpSettings(true);
    return stored?.primary ?? null;
  }

  async getContactFormSmtpCredentials(
    tenantId?: string,
  ): Promise<SmtpCredentials | null> {
    const record = await this.findSettingRecord(
      CONTACT_SMTP_SETTING_KEY,
      tenantId,
    );
    if (record) {
      const creds = this.toSmtpCredentials(
        record.value as Record<string, unknown>,
      );
      if (creds) {
        return creds;
      }
    }

    const legacy = await this.getGlobalStoredSmtpSettings(tenantId);
    if (
      legacy?.contactForm?.mode === 'custom' &&
      legacy.contactForm.credentials
    ) {
      return legacy.contactForm.credentials;
    }

    return null;
  }

  private async getStoredSmtpSettings(userScoped = false): Promise<{
    primary: SmtpCredentials;
    contactForm?:
      | { mode: 'same'; credentials?: undefined }
      | { mode: 'custom'; credentials: SmtpCredentials };
    updatedAt?: Date;
    verifiedAt?: Date;
  } | null> {
    const record = userScoped
      ? await this.findUserSettingRecord(SMTP_SETTING_KEY)
      : await this.findSettingRecord(SMTP_SETTING_KEY);
    if (!record) {
      return null;
    }
    return this.parseStoredSmtpSettings(record.value, record.updatedAt);
  }

  async getImapSettings(): Promise<ImapSettingsResponse | null> {
    const record = await this.findUserSettingRecord(IMAP_SETTING_KEY);
    if (!record) {
      return null;
    }
    const credentials = this.parseImapCredentials(record.value);
    if (!credentials) {
      return null;
    }
    return this.mapImapToResponse(credentials, record.updatedAt);
  }

  async getImapCredentials(): Promise<ImapCredentials | null> {
    const record = await this.findUserSettingRecord(IMAP_SETTING_KEY);
    return record ? this.parseImapCredentials(record.value) : null;
  }

  async updateSmtpSettings(
    dto: UpdateSmtpSettingsDto,
  ): Promise<SmtpSettingsResponse> {
    const userId = this.context.getUserId();
    if (!userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }

    const existing = await this.getStoredSmtpSettings(true);

    const nextPassword = dto.password?.trim()
      ? dto.password.trim()
      : existing?.primary.password;

    if (!nextPassword) {
      throw new BadRequestException(
        'Bitte gib ein SMTP-Passwort ein oder hinterlege es erneut.',
      );
    }

    const primary: SmtpCredentials = {
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username.trim(),
      password: nextPassword,
      fromName: dto.fromName?.trim() || null,
      fromEmail: dto.fromEmail?.trim() || null,
      encryption: dto.encryption ?? existing?.primary.encryption ?? 'tls',
    };

    await this.verifySmtpCredentials(primary);
    const verificationDate = new Date();
    const saved = await this.saveUserSetting(SMTP_SETTING_KEY, {
      primary,
      contactForm: existing?.contactForm ?? { mode: 'same' },
      verifiedAt: verificationDate.toISOString(),
    });

    return this.mapToResponse({
      primary,
      contactForm: existing?.contactForm ?? { mode: 'same' },
      updatedAt: saved.updatedAt,
      verifiedAt: verificationDate,
    });
  }

  async getContactFormSmtpSettings(): Promise<ContactFormSmtpSettings | null> {
    const record = await this.findSettingRecord(CONTACT_SMTP_SETTING_KEY);
    const legacy = record ? null : await this.getGlobalStoredSmtpSettings();

    let verifiedAt: string | undefined;
    let creds: SmtpCredentials | null = null;
    if (record) {
      const payload = record.value as Record<string, unknown>;
      verifiedAt =
        typeof payload?.verifiedAt === 'string'
          ? payload.verifiedAt
          : undefined;
      creds = this.toSmtpCredentials(payload);
    } else if (legacy?.contactForm?.mode === 'custom') {
      creds = legacy.contactForm.credentials;
    }

    const updatedAt = record?.updatedAt ?? legacy?.updatedAt ?? undefined;

    if (!creds) return null;
    return {
      mode: 'custom',
      host: creds.host,
      port: creds.port,
      username: creds.username,
      fromName: creds.fromName ?? null,
      fromEmail: creds.fromEmail ?? null,
      encryption: creds.encryption,
      hasPassword: Boolean(creds.password),
      updatedAt: updatedAt ? updatedAt.toISOString() : undefined,
      verifiedAt,
    };
  }

  async updateContactFormSmtpSettings(
    dto: UpdateContactSmtpSettingsDto,
  ): Promise<ContactFormSmtpSettings> {
    const role = this.context.getRole();
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'SMTP Einstellungen können nur von Admins bearbeitet werden.',
      );
    }

    const existing = await this.getContactFormSmtpCredentials();
    const host = String(dto.host ?? '').trim();
    const username = String(dto.username ?? '').trim();
    const port = Number(dto.port);
    const contactPassword = dto.password
      ? dto.password.trim()
      : existing?.password;

    if (!contactPassword) {
      throw new BadRequestException(
        'Bitte gib ein SMTP-Passwort für das Kontaktformular ein oder hinterlege es erneut.',
      );
    }

    const contactCredentials: SmtpCredentials = {
      host,
      port,
      username,
      password: contactPassword,
      fromName: dto.fromName
        ? dto.fromName.trim()
        : (existing?.fromName ?? null),
      fromEmail: dto.fromEmail
        ? dto.fromEmail.trim()
        : (existing?.fromEmail ?? null),
      encryption: dto.encryption ?? existing?.encryption ?? 'tls',
    };

    await this.verifySmtpCredentials(contactCredentials);

    const verificationDate = new Date();
    const saved = await this.saveSetting(CONTACT_SMTP_SETTING_KEY, {
      ...contactCredentials,
      verifiedAt: verificationDate.toISOString(),
    });

    return {
      mode: 'custom',
      host: contactCredentials.host,
      port: contactCredentials.port,
      username: contactCredentials.username,
      fromName: contactCredentials.fromName ?? null,
      fromEmail: contactCredentials.fromEmail ?? null,
      encryption: contactCredentials.encryption,
      hasPassword: Boolean(contactCredentials.password),
      updatedAt: saved.updatedAt.toISOString(),
      verifiedAt: verificationDate.toISOString(),
    };
  }

  async updateImapSettings(
    dto: UpdateImapSettingsDto,
  ): Promise<ImapSettingsResponse> {
    const userId = this.context.getUserId();
    if (!userId) {
      throw new BadRequestException(
        'IMAP Einstellungen können nur im Benutzerkontext gespeichert werden.',
      );
    }
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }

    const existing = await this.getImapCredentials();
    const nextPassword = dto.password?.trim()
      ? dto.password.trim()
      : existing?.password;

    if (!nextPassword) {
      throw new BadRequestException(
        'Bitte gib ein IMAP-Passwort ein oder hinterlege es erneut.',
      );
    }

    const data: ImapCredentials = {
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username.trim(),
      password: nextPassword,
      encryption: dto.encryption ?? existing?.encryption ?? 'ssl',
      mailbox: dto.mailbox?.trim() || existing?.mailbox || 'INBOX',
      spamMailbox: dto.spamMailbox?.trim() ?? existing?.spamMailbox ?? 'Spam',
      sinceDays:
        typeof dto.sinceDays === 'number'
          ? dto.sinceDays
          : (existing?.sinceDays ?? 7),
    };

    await this.verifyImapCredentials(data);
    data.verifiedAt = new Date().toISOString();

    const saved = await this.saveUserSetting(IMAP_SETTING_KEY, data);
    return this.mapImapToResponse(data, saved.updatedAt);
  }

  async getWorkspaceSettings(): Promise<WorkspaceSettings | null> {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      return null;
    }

    const profile = await this.ensureWorkspaceProfile(tenantId);
    return this.mapWorkspaceProfile(profile);
  }

  async updateWorkspaceSettings(
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettings> {
    const tenantId = this.requireTenantId();
    const data = await this.buildWorkspaceProfileData(dto, tenantId);

    const profile = await this.prisma.workspaceProfile.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
      include: { logoFile: true },
    });

    return this.mapWorkspaceProfile(profile);
  }

  async getMessageAnalysisSettings(): Promise<
    MessageAnalysisSettings & { updatedAt?: string }
  > {
    const record = await this.findUserSettingRecord(
      MESSAGE_ANALYSIS_SETTING_KEY,
    );
    const payload =
      record?.value &&
      typeof record.value === 'object' &&
      !Array.isArray(record.value)
        ? (record.value as { enabled?: boolean })
        : null;

    return {
      enabled: Boolean(payload?.enabled),
      updatedAt: record?.updatedAt?.toISOString(),
    };
  }

  async updateMessageAnalysisSettings(
    dto: UpdateAnalysisSettingsDto,
  ): Promise<MessageAnalysisSettings & { updatedAt: string }> {
    const role = this.context.getRole();
    if (!role) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }
    const data: MessageAnalysisSettings = { enabled: dto.enabled };

    const saved = await this.saveUserSetting(
      MESSAGE_ANALYSIS_SETTING_KEY,
      data,
    );
    return { ...data, updatedAt: saved.updatedAt.toISOString() };
  }

  async getOpenAiSettings(options?: {
    includeSecret?: boolean;
  }): Promise<OpenAiSettings | null> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      return null;
    }
    const record = await this.findUserSettingRecord(OPENAI_SETTING_KEY);
    if (!record) {
      return null;
    }
    const value =
      record.value &&
      typeof record.value === 'object' &&
      !Array.isArray(record.value)
        ? (record.value as { apiKey?: string | null })
        : null;
    const apiKey =
      value && typeof value.apiKey === 'string' && value.apiKey.trim()
        ? value.apiKey.trim()
        : null;
    return {
      hasApiKey: Boolean(apiKey),
      apiKey: options?.includeSecret ? apiKey : undefined,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateOpenAiSettings(
    dto: UpdateOpenAiSettingsDto,
  ): Promise<OpenAiSettings> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }
    const trimmed =
      dto.apiKey && dto.apiKey.trim().length ? dto.apiKey.trim() : null;
    const key = USER_KEY_SUFFIX(OPENAI_SETTING_KEY, userId);
    const saved = await this.saveSetting(key, {
      apiKey: trimmed,
    });
    return {
      hasApiKey: Boolean(trimmed),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getChatbotOpenAiSettings(options?: {
    includeSecret?: boolean;
  }): Promise<OpenAiSettings | null> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      return null;
    }
    const record = await this.prisma.chatbotConfig.findUnique({
      where: { tenantId },
    });
    if (!record) {
      return null;
    }
    return {
      hasApiKey: Boolean(record.apiKey),
      apiKey: options?.includeSecret ? record.apiKey : undefined,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateChatbotOpenAiSettings(
    dto: UpdateChatbotOpenAiSettingsDto,
  ): Promise<OpenAiSettings> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }
    const trimmed =
      dto.apiKey && dto.apiKey.trim().length ? dto.apiKey.trim() : null;

    const saved = await this.prisma.chatbotConfig.upsert({
      where: { tenantId },
      update: { apiKey: trimmed },
      create: { tenantId, apiKey: trimmed },
    });

    return {
      hasApiKey: Boolean(trimmed),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getChatbotLauncher(): Promise<{
    enabled: boolean;
    updatedAt?: string;
  } | null> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      return null;
    }
    const record = await this.prisma.chatbotConfig.findUnique({
      where: { tenantId },
    });
    if (!record) {
      return { enabled: false };
    }
    return {
      enabled: Boolean(record.enabled),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateChatbotLauncher(
    dto: UpdateChatbotLauncherDto,
  ): Promise<{ enabled: boolean; updatedAt: string }> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }

    const saved = await this.prisma.chatbotConfig.upsert({
      where: { tenantId },
      update: { enabled: dto.enabled },
      create: { tenantId, enabled: dto.enabled },
    });

    return {
      enabled: saved.enabled,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getChatbotKnowledge(): Promise<{
    knowledgeBase: string | null;
    updatedAt?: string;
  } | null> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      return null;
    }
    const record = await this.prisma.chatbotConfig.findUnique({
      where: { tenantId },
    });
    if (!record) {
      return null;
    }
    return {
      knowledgeBase: record.knowledgeBase ?? null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateChatbotKnowledge(
    dto: UpdateChatbotKnowledgeDto,
  ): Promise<{ knowledgeBase: string | null; updatedAt: string }> {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }
    const trimmed =
      dto.knowledgeBase && dto.knowledgeBase.trim().length
        ? dto.knowledgeBase.trim()
        : null;

    const saved = await this.prisma.chatbotConfig.upsert({
      where: { tenantId },
      update: { knowledgeBase: trimmed },
      create: { tenantId, knowledgeBase: trimmed },
    });

    return {
      knowledgeBase: saved.knowledgeBase ?? null,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getApiSettings(): Promise<{
    embedUrl: string | null;
    apiToken: string | null;
    hasServiceAccount: boolean;
    trackingMode: 'LOCAL' | 'GA';
    updatedAt?: string;
  } | null> {
    const record = await this.findSettingRecord(API_SETTING_KEY);
    if (!record) {
      return null;
    }
    const payload = this.parseApiSettings(record.value);
    if (!payload) {
      return null;
    }
    return {
      embedUrl: payload.embedUrl,
      apiToken: payload.apiToken,
      hasServiceAccount: payload.serviceAccountJson ? true : false,
      trackingMode: payload.trackingMode,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateApiSettings(dto: UpdateApiSettingsDto): Promise<{
    embedUrl: string | null;
    apiToken: string | null;
    hasServiceAccount: boolean;
    trackingMode: 'LOCAL' | 'GA';
    updatedAt: string;
  }> {
    const existingRecord = await this.findSettingRecord(API_SETTING_KEY);
    const existingParsed = existingRecord
      ? this.parseApiSettings(existingRecord.value)
      : null;

    const nextToken = dto.apiToken?.trim() || existingParsed?.apiToken || null;

    const embedUrl = dto.embedUrl?.trim() || existingParsed?.embedUrl || null;
    const serviceAccountJson =
      dto.serviceAccountJson?.trim() ||
      existingParsed?.serviceAccountJson ||
      null;
    const trackingMode: 'LOCAL' | 'GA' =
      dto.trackingMode === 'GA' || dto.trackingMode === 'LOCAL'
        ? dto.trackingMode
        : (existingParsed?.trackingMode ?? 'LOCAL');

    const data = {
      embedUrl,
      apiToken: nextToken,
      serviceAccountJson,
      trackingMode,
    };

    const saved = await this.saveSetting(API_SETTING_KEY, data);
    return {
      embedUrl,
      apiToken: nextToken,
      hasServiceAccount: Boolean(serviceAccountJson),
      trackingMode,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getImapSyncState(): Promise<{
    lastUid?: number;
    mailboxes?: Record<string, number>;
  } | null> {
    const record = await this.findScopedSettingRecord(IMAP_SYNC_STATE_KEY);
    if (!record || !record.value || typeof record.value !== 'object') {
      return null;
    }
    const payload = record.value as Record<string, unknown>;
    const lastUid = Number(payload.lastUid);
    const perMailboxRaw =
      payload.mailboxes && typeof payload.mailboxes === 'object'
        ? (payload.mailboxes as Record<string, unknown>)
        : null;
    const mailboxes = perMailboxRaw
      ? Object.entries(perMailboxRaw).reduce<Record<string, number>>(
          (acc, [key, value]) => {
            const num = Number(value);
            if (key && Number.isFinite(num)) {
              acc[key] = num;
            }
            return acc;
          },
          {},
        )
      : undefined;
    return {
      lastUid: Number.isFinite(lastUid) ? lastUid : undefined,
      ...(mailboxes && Object.keys(mailboxes).length > 0 ? { mailboxes } : {}),
    };
  }

  async saveImapSyncState(state: {
    lastUid?: number;
    mailboxes?: Record<string, number>;
  }) {
    const userId = this.context.getUserId();
    const key =
      userId && this.context.getTenantId()
        ? USER_KEY_SUFFIX(IMAP_SYNC_STATE_KEY, userId)
        : IMAP_SYNC_STATE_KEY;
    await this.saveSetting(key, state);
  }

  private async findSettingRecord(
    key: string,
    tenantId?: string,
  ): Promise<TenantSetting | null> {
    const resolvedTenantId = tenantId ?? this.context.getTenantId();
    if (!resolvedTenantId) {
      return null;
    }
    return this.prisma.tenantSetting.findFirst({
      where: { tenantId: resolvedTenantId, key },
    });
  }

  private async findUserSettingRecord(baseKey: string) {
    const tenantId = this.context.getTenantId();
    const userId = this.context.getUserId();
    if (!tenantId || !userId) return null;
    const scopedKey = USER_KEY_SUFFIX(baseKey, userId);
    return this.findSettingRecord(scopedKey, tenantId);
  }

  private async findScopedSettingRecord(
    baseKey: string,
  ): Promise<TenantSetting | null> {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      return null;
    }
    const userId = this.context.getUserId();
    if (!userId) {
      return null;
    }
    const scopedKey = USER_KEY_SUFFIX(baseKey, userId);
    return this.findSettingRecord(scopedKey, tenantId);
  }

  private async saveSetting(
    key: string,
    value: unknown,
  ): Promise<TenantSetting> {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }

    const jsonValue = this.toJsonInput(value);
    return this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: jsonValue },
      update: { value: jsonValue },
    });
  }

  private async saveUserSetting(key: string, value: unknown) {
    const userId = this.context.getUserId();
    if (!userId) {
      throw new BadRequestException('Kein Benutzerkontext vorhanden.');
    }
    const scopedKey = USER_KEY_SUFFIX(key, userId);
    return this.saveSetting(scopedKey, value);
  }

  private async deleteSetting(key: string) {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }
    await this.prisma.tenantSetting.deleteMany({
      where: { tenantId, key },
    });
  }

  private toJsonInput(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private async findGlobalSettingRecord(
    key: string,
  ): Promise<TenantSetting | null> {
    return this.prisma.tenantSetting.findFirst({
      where: { key },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async isSingleUserTenant(tenantId: string) {
    const userCount = await this.prisma.user.count({ where: { tenantId } });
    return userCount <= 1;
  }

  private async isPrimaryUser(tenantId: string, userId: string) {
    const firstUser = await this.prisma.user.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return firstUser?.id === userId;
  }

  private parseStoredSmtpSettings(
    value: Prisma.JsonValue,
    updatedAt?: Date,
  ): {
    primary: SmtpCredentials;
    contactForm?:
      | { mode: 'same'; credentials?: undefined }
      | { mode: 'custom'; credentials: SmtpCredentials };
    updatedAt?: Date;
    verifiedAt?: Date;
  } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const payload = value as Record<string, unknown>;

    // Legacy flat storage
    if (
      typeof payload.host === 'string' &&
      typeof payload.username === 'string' &&
      typeof payload.password === 'string'
    ) {
      const primary = this.toSmtpCredentials(payload);
      return primary
        ? { primary, contactForm: { mode: 'same' }, updatedAt }
        : null;
    }

    // New structured storage
    const primaryPayload = payload.primary as Record<string, unknown>;
    const contactPayload = payload.contactForm as
      | { mode?: string; credentials?: Record<string, unknown> }
      | undefined;

    const primary = this.toSmtpCredentials(primaryPayload);
    if (!primary) {
      return null;
    }

    let contactForm:
      | { mode: 'same'; credentials?: undefined }
      | { mode: 'custom'; credentials: SmtpCredentials }
      | undefined;

    if (contactPayload?.mode === 'custom' && contactPayload.credentials) {
      const parsed = this.toSmtpCredentials(contactPayload.credentials);
      if (parsed) {
        contactForm = { mode: 'custom', credentials: parsed };
      }
    } else {
      contactForm = { mode: 'same' };
    }

    const verifiedAtRaw = payload.verifiedAt;
    let verifiedAt: Date | undefined;
    if (typeof verifiedAtRaw === 'string') {
      const parsed = new Date(verifiedAtRaw);
      if (!Number.isNaN(parsed.getTime())) {
        verifiedAt = parsed;
      }
    }

    return { primary, contactForm, updatedAt, verifiedAt };
  }

  private async getGlobalStoredSmtpSettings(tenantId?: string): Promise<{
    primary: SmtpCredentials;
    contactForm?:
      | { mode: 'same'; credentials?: undefined }
      | { mode: 'custom'; credentials: SmtpCredentials };
    updatedAt?: Date;
    verifiedAt?: Date;
  } | null> {
    const record = tenantId
      ? await this.findSettingRecord(SMTP_SETTING_KEY, tenantId)
      : await this.findGlobalSettingRecord(SMTP_SETTING_KEY);
    if (!record) {
      return null;
    }
    return this.parseStoredSmtpSettings(record.value, record.updatedAt);
  }

  private toSmtpCredentials(
    payload: Record<string, unknown>,
  ): SmtpCredentials | null {
    if (
      typeof payload.host !== 'string' ||
      typeof payload.username !== 'string' ||
      typeof payload.password !== 'string'
    ) {
      return null;
    }

    const port =
      typeof payload.port === 'number'
        ? payload.port
        : Number(payload.port ?? 587);

    const encryption = this.normalizeEncryption(
      (payload.encryption as string) ?? 'tls',
    );

    return {
      host: payload.host,
      username: payload.username,
      password: payload.password,
      port: Number.isNaN(port) ? 587 : port,
      fromName: typeof payload.fromName === 'string' ? payload.fromName : null,
      fromEmail:
        typeof payload.fromEmail === 'string' ? payload.fromEmail : null,
      encryption,
    };
  }

  private normalizeEncryption(value: string): SmtpEncryption {
    const normalized = value?.toLowerCase();
    if (normalized === 'ssl' || normalized === 'tls') {
      return normalized;
    }
    return 'tls';
  }

  private parseImapCredentials(
    value: Prisma.JsonValue,
  ): ImapCredentials | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;

    if (
      typeof payload.host !== 'string' ||
      typeof payload.username !== 'string' ||
      typeof payload.password !== 'string'
    ) {
      return null;
    }

    const port =
      typeof payload.port === 'number'
        ? payload.port
        : Number(payload.port ?? 993);

    return {
      host: payload.host,
      username: payload.username,
      password: payload.password,
      port: Number.isNaN(port) ? 993 : port,
      mailbox:
        typeof payload.mailbox === 'string' && payload.mailbox.trim()
          ? payload.mailbox
          : 'INBOX',
      spamMailbox:
        typeof payload.spamMailbox === 'string' && payload.spamMailbox.trim()
          ? payload.spamMailbox
          : 'Spam',
      encryption: this.normalizeImapEncryption(
        (payload.encryption as string) ?? 'ssl',
      ),
      sinceDays:
        typeof payload.sinceDays === 'number' &&
        Number.isFinite(payload.sinceDays)
          ? payload.sinceDays
          : undefined,
      verifiedAt:
        typeof payload.verifiedAt === 'string' ? payload.verifiedAt : undefined,
    };
  }

  private normalizeImapEncryption(value: string): ImapEncryption {
    const normalized = value?.toLowerCase();
    if (normalized === 'ssl' || normalized === 'tls') {
      return normalized;
    }
    return 'ssl';
  }

  private mapImapToResponse(
    data: ImapCredentials,
    updatedAt: Date,
  ): ImapSettingsResponse {
    return {
      host: data.host,
      port: data.port,
      username: data.username,
      mailbox: data.mailbox,
      spamMailbox: data.spamMailbox ?? null,
      encryption: data.encryption,
      hasPassword: Boolean(data.password),
      sinceDays: data.sinceDays,
      updatedAt: updatedAt.toISOString(),
      verifiedAt: data.verifiedAt ?? null,
    };
  }

  private async verifyImapCredentials(creds: ImapCredentials) {
    // quick auth check to ensure credentials are valid
    const client = new (await import('imapflow')).ImapFlow({
      host: creds.host,
      port: creds.port,
      secure: creds.encryption === 'ssl',
      tls:
        creds.encryption === 'tls' ? { rejectUnauthorized: false } : undefined,
      auth: {
        user: creds.username,
        pass: creds.password,
      },
    });
    try {
      await client.connect();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unbekannter Fehler';
      throw new BadRequestException(`IMAP Login fehlgeschlagen: ${message}`);
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore
      }
    }
  }

  private async verifySmtpCredentials(creds: SmtpCredentials) {
    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.encryption === 'ssl',
      requireTLS: creds.encryption === 'tls',
      auth: {
        user: creds.username,
        pass: creds.password,
      },
      tls:
        creds.encryption === 'tls' ? { rejectUnauthorized: false } : undefined,
    });

    try {
      await transport.verify();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unbekannter Fehler';
      throw new BadRequestException(`SMTP Login fehlgeschlagen: ${message}`);
    } finally {
      transport.close();
    }
  }

  private mapToResponse(input: {
    primary: SmtpCredentials;
    contactForm?:
      | { mode: 'same'; credentials?: undefined }
      | { mode: 'custom'; credentials: SmtpCredentials };
    updatedAt?: Date;
    verifiedAt?: Date;
  }): SmtpSettingsResponse {
    const { primary, updatedAt, verifiedAt } = input;
    const resolvedUpdatedAt = updatedAt ?? new Date();

    return {
      host: primary.host,
      port: primary.port,
      username: primary.username,
      fromName: primary.fromName ?? null,
      fromEmail: primary.fromEmail ?? null,
      encryption: primary.encryption,
      hasPassword: Boolean(primary.password),
      updatedAt: resolvedUpdatedAt.toISOString(),
      verifiedAt: verifiedAt?.toISOString() ?? null,
    };
  }

  private async ensureWorkspaceProfile(
    tenantId: string,
  ): Promise<WorkspaceProfileWithLogo> {
    let profile = await this.prisma.workspaceProfile.findUnique({
      where: { tenantId },
      include: { logoFile: true },
    });
    if (profile) {
      return profile;
    }

    const { _hadLegacySource, ...legacy } =
      await this.loadLegacyWorkspaceProfile();
    try {
      profile = await this.prisma.workspaceProfile.create({
        data: { tenantId, ...legacy },
        include: { logoFile: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        profile = await this.prisma.workspaceProfile.findUnique({
          where: { tenantId },
          include: { logoFile: true },
        });
      } else {
        throw error;
      }
    }

    if (_hadLegacySource) {
      await this.deleteSetting(WORKSPACE_SETTING_KEY);
    }

    if (!profile) {
      throw new BadRequestException(
        'Workspace-Profil konnte nicht initialisiert werden.',
      );
    }

    return profile;
  }

  private mapWorkspaceProfile(
    profile: WorkspaceProfileWithLogo,
  ): WorkspaceSettings {
    return {
      companyName: profile.companyName ?? null,
      legalName: profile.legalName ?? null,
      industry: profile.industry ?? null,
      tagline: profile.tagline ?? null,
      mission: profile.mission ?? null,
      vision: profile.vision ?? null,
      description: profile.description ?? null,
      foundedYear: profile.foundedYear ?? null,
      teamSize: profile.teamSize ?? null,
      supportEmail: profile.supportEmail ?? null,
      supportPhone: profile.supportPhone ?? null,
      timezone: profile.timezone ?? null,
      currency: profile.currency ?? null,
      vatNumber: profile.vatNumber ?? null,
      registerNumber: profile.registerNumber ?? null,
      website: profile.website ?? null,
      address: {
        street: profile.street ?? null,
        postalCode: profile.postalCode ?? null,
        city: profile.city ?? null,
        country: profile.country ?? null,
      },
      branding: {
        primaryColor: profile.primaryColor ?? null,
        secondaryColor: profile.secondaryColor ?? null,
        accentColor: profile.accentColor ?? null,
        logoFileId: profile.logoFileId ?? null,
      },
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private async buildWorkspaceProfileData(
    dto: UpdateWorkspaceSettingsDto,
    tenantId: string,
  ): Promise<Omit<Prisma.WorkspaceProfileUncheckedCreateInput, 'tenantId'>> {
    const trimmed = (value?: string | null) =>
      value && value.trim().length ? value.trim() : null;

    const numeric = (value?: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    const data: Omit<Prisma.WorkspaceProfileUncheckedCreateInput, 'tenantId'> =
      {
        companyName: trimmed(dto.companyName),
        legalName: trimmed(dto.legalName),
        industry: trimmed(dto.industry),
        tagline: trimmed(dto.tagline),
        mission: trimmed(dto.mission),
        vision: trimmed(dto.vision),
        description: trimmed(dto.description),
        foundedYear: numeric(dto.foundedYear) ?? undefined,
        teamSize: numeric(dto.teamSize) ?? undefined,
        supportEmail: trimmed(dto.supportEmail),
        supportPhone: trimmed(dto.supportPhone),
        timezone: trimmed(dto.timezone),
        currency: trimmed(dto.currency),
        vatNumber: trimmed(dto.vatNumber),
        registerNumber: trimmed(dto.registerNumber),
        street: trimmed(dto.street),
        postalCode: trimmed(dto.postalCode),
        city: trimmed(dto.city),
        country: trimmed(dto.country),
        website: trimmed(dto.website),
        primaryColor: trimmed(dto.primaryColor),
        secondaryColor: trimmed(dto.secondaryColor),
        accentColor: trimmed(dto.accentColor),
      };

    const logoValue = await this.normalizeLogoFileId(dto.logoFileId, tenantId);
    if (logoValue !== undefined) {
      data.logoFileId = logoValue;
    }

    return data;
  }

  private async normalizeLogoFileId(
    value: string | null | undefined,
    tenantId: string,
  ): Promise<string | null | undefined> {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const file = await this.prisma.driveFile.findFirst({
      where: { id: trimmed, tenantId, isDeleted: false },
      select: { id: true },
    });
    if (!file) {
      throw new BadRequestException('Logo-Datei wurde nicht gefunden.');
    }
    return file.id;
  }

  private async loadLegacyWorkspaceProfile(): Promise<
    Omit<Prisma.WorkspaceProfileUncheckedCreateInput, 'tenantId'> & {
      _hadLegacySource?: boolean;
    }
  > {
    const record = await this.findSettingRecord(WORKSPACE_SETTING_KEY);
    if (!record) {
      return {};
    }
    const parsed = this.parseWorkspaceSettings(record.value);
    if (!parsed) {
      return {};
    }
    const flattened = this.flattenWorkspaceSettings(parsed);
    return { ...flattened, _hadLegacySource: true };
  }

  private flattenWorkspaceSettings(
    input: WorkspaceSettings,
  ): Omit<Prisma.WorkspaceProfileUncheckedCreateInput, 'tenantId'> {
    return {
      companyName: input.companyName ?? null,
      legalName: input.legalName ?? null,
      industry: input.industry ?? null,
      tagline: input.tagline ?? null,
      mission: input.mission ?? null,
      vision: input.vision ?? null,
      description: input.description ?? null,
      foundedYear: input.foundedYear ?? undefined,
      teamSize: input.teamSize ?? undefined,
      supportEmail: input.supportEmail ?? null,
      supportPhone: input.supportPhone ?? null,
      timezone: input.timezone ?? null,
      currency: input.currency ?? null,
      vatNumber: input.vatNumber ?? null,
      registerNumber: input.registerNumber ?? null,
      street: input.address?.street ?? null,
      postalCode: input.address?.postalCode ?? null,
      city: input.address?.city ?? null,
      country: input.address?.country ?? null,
      website: input.website ?? null,
      primaryColor: input.branding?.primaryColor ?? null,
      secondaryColor: input.branding?.secondaryColor ?? null,
      accentColor: input.branding?.accentColor ?? null,
    };
  }

  private parseWorkspaceSettings(
    value: Prisma.JsonValue,
  ): WorkspaceSettings | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;

    const numberOrNull = (maybeNumber: unknown): number | null => {
      if (typeof maybeNumber === 'number') {
        return maybeNumber;
      }
      const parsed = Number(maybeNumber);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const str = (maybe: unknown): string | null =>
      typeof maybe === 'string' ? maybe : null;

    return {
      companyName: str(payload.companyName),
      legalName: str(payload.legalName),
      industry: str(payload.industry),
      tagline: str(payload.tagline),
      mission: str(payload.mission),
      vision: str(payload.vision),
      description: str(payload.description),
      foundedYear: numberOrNull(payload.foundedYear),
      teamSize: numberOrNull(payload.teamSize),
      supportEmail: str(payload.supportEmail),
      supportPhone: str(payload.supportPhone),
      timezone: str(payload.timezone),
      currency: str(payload.currency),
      vatNumber: str(payload.vatNumber),
      registerNumber: str(payload.registerNumber),
      address:
        typeof payload.address === 'object' && payload.address !== null
          ? {
              street: str((payload.address as Record<string, unknown>).street),
              postalCode: str(
                (payload.address as Record<string, unknown>).postalCode,
              ),
              city: str((payload.address as Record<string, unknown>).city),
              country: str(
                (payload.address as Record<string, unknown>).country,
              ),
            }
          : undefined,
      website:
        str(payload.website) ??
        (typeof payload.social === 'object' && payload.social !== null
          ? str((payload.social as Record<string, unknown>).website)
          : null),
      branding:
        typeof payload.branding === 'object' && payload.branding !== null
          ? {
              primaryColor: str(
                (payload.branding as Record<string, unknown>).primaryColor,
              ),
              secondaryColor: str(
                (payload.branding as Record<string, unknown>).secondaryColor,
              ),
              accentColor: str(
                (payload.branding as Record<string, unknown>).accentColor,
              ),
            }
          : undefined,
    };
  }

  private parseApiSettings(value: Prisma.JsonValue): {
    embedUrl: string | null;
    apiToken: string | null;
    serviceAccountJson?: string | null;
    trackingMode: 'LOCAL' | 'GA';
  } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        embedUrl: null,
        apiToken: null,
        serviceAccountJson: null,
        trackingMode: 'LOCAL',
      };
    }
    const payload = value as Record<string, unknown>;
    const trackingMode =
      payload.trackingMode === 'GA' || payload.trackingMode === 'LOCAL'
        ? payload.trackingMode
        : 'LOCAL';
    return {
      embedUrl: typeof payload.embedUrl === 'string' ? payload.embedUrl : null,
      apiToken: typeof payload.apiToken === 'string' ? payload.apiToken : null,
      serviceAccountJson:
        typeof payload.serviceAccountJson === 'string'
          ? payload.serviceAccountJson
          : null,
      trackingMode,
    };
  }
}
