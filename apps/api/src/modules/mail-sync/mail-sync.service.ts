import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CustomerMessageDirection,
  CustomerMessageStatus,
  MessageCategory,
} from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';

import type { ImapCredentials } from '../../common/interfaces/imap-settings.interface';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger(MailSyncService.name);
  private syncing = false;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Cron(process.env.MAIL_SYNC_CRON ?? '0 */2 * * * *')
  async synchronizeMailbox() {
    if (this.syncing) {
      this.logger.debug('Mail sync skipped – another run is still active.');
      return;
    }

    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    if (!tenants.length) {
      return;
    }

    this.syncing = true;
    try {
      for (const tenant of tenants) {
        const users = await this.prisma.user.findMany({
          where: { tenantId: tenant.id },
          select: { id: true },
        });
        for (const user of users) {
          await this.requestContext.run(
            { tenantId: tenant.id, userId: user.id },
            async () => {
              await this.syncUserMailbox(tenant.id, user.id);
            },
          );
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private async syncUserMailbox(tenantId: string, userId: string) {
    const imapSettings = await this.settingsService.getImapCredentials();
    if (!imapSettings) {
      return;
    }

    const state = await this.settingsService.getImapSyncState();
    const effectiveDays =
      typeof imapSettings.sinceDays === 'number'
        ? imapSettings.sinceDays
        : null;
    const cutoff =
      typeof effectiveDays === 'number'
        ? Date.now() - effectiveDays * 24 * 60 * 60 * 1000
        : null;
    const mailboxState: Record<string, number> = {
      ...(state?.mailboxes ?? {}),
    };

    const client = new ImapFlow({
      host: imapSettings.host,
      port: imapSettings.port,
      secure: imapSettings.encryption === 'ssl',
      tls:
        imapSettings.encryption === 'tls'
          ? { rejectUnauthorized: false }
          : undefined,
      auth: {
        user: imapSettings.username,
        pass: imapSettings.password,
      },
    });

    let lastUid = state?.lastUid ?? 0;
    let processedTotal = 0;

    try {
      await client.connect();
      let availableMailboxes: Awaited<
        ReturnType<typeof this.listAvailableMailboxes>
      > = [];
      try {
        availableMailboxes = await this.listAvailableMailboxes(client);
      } catch (error) {
        this.logger.debug(
          `Mailboxes konnten nicht aufgelistet werden: ${(error as Error)?.message ?? error}`,
        );
      }
      const availableMailboxNames =
        this.buildMailboxNameSet(availableMailboxes);
      const allowUnknownMailbox = availableMailboxNames.size === 0;
      if (allowUnknownMailbox) {
        this.logger.log(
          `Mailbox-Liste leer – synchronisiere anhand der konfigurierten Namen.`,
        );
      }
      const mailboxes = this.resolveMailboxes(imapSettings, availableMailboxes);
      for (const { name, isSpam } of mailboxes) {
        if (
          !allowUnknownMailbox &&
          !this.mailboxExists(availableMailboxNames, name)
        ) {
          this.logger.debug(
            `Mailbox "${name}" wurde nicht gefunden – übersprungen.`,
          );
          continue;
        }
        const startUid =
          mailboxState[name] ?? state?.mailboxes?.[name] ?? state?.lastUid ?? 0;
        const { processed, lastSeenUid } = await this.syncMailbox(
          client,
          name,
          startUid,
          cutoff,
          async (parsed, uid) =>
            this.ingestMessage(parsed, uid, tenantId, userId, {
              mailbox: name,
              isSpam,
            }),
          100 - processedTotal,
        );
        mailboxState[name] = lastSeenUid;
        lastUid = Math.max(lastUid, lastSeenUid);
        processedTotal += processed;
        if (processedTotal >= 100) {
          break;
        }
      }
      if (processedTotal === 0) {
        this.logger.log(
          `Keine Nachrichten verarbeitet – Tenant ${tenantId}, User ${userId}, Mailboxes ${
            mailboxes.map((m) => m.name).join(', ') || 'keine'
          }`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Mail-Sync Tenant ${tenantId} User ${userId} fehlgeschlagen: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      await client.logout().catch(() => undefined);
      const stateChanged =
        processedTotal > 0 ||
        lastUid !== (state?.lastUid ?? 0) ||
        JSON.stringify(state?.mailboxes ?? {}) !== JSON.stringify(mailboxState);
      if (stateChanged) {
        await this.settingsService.saveImapSyncState({
          lastUid,
          mailboxes: mailboxState,
        });
      }
    }
  }

  private async ingestMessage(
    parsed: ParsedMail,
    uid: number,
    tenantId: string,
    userId: string,
    options?: { mailbox?: string; isSpam?: boolean },
  ) {
    const externalId =
      typeof parsed.messageId === 'string'
        ? `${userId}:${parsed.messageId}`
        : `imap:${userId}:${uid}`;
    const existing = await this.prisma.customerMessage.findFirst({
      where: { externalId, tenantId },
      select: { id: true, analyzedAt: true },
    });
    if (existing) {
      if (!existing.analyzedAt) {
        this.logger.debug(
          `Bestehende Nachricht ohne Analyse gefunden (${existing.id}) – versuche Analyse.`,
        );
        const analyzed = await this.requestContext
          .run({ tenantId, userId }, () =>
            this.analyzeInboundMessage(
              existing.id,
              typeof parsed.subject === 'string'
                ? parsed.subject
                : 'Neue Nachricht',
              typeof parsed.text === 'string'
                ? parsed.text
                : parsed.html
                  ? parsed.html.replace(/<[^>]+>/g, ' ')
                  : '',
            ),
          )
          .catch((error) => {
            this.logger.warn(
              `Analyse für bestehende Nachricht fehlgeschlagen (${existing.id}): ${
                (error as Error)?.message ?? error
              }`,
            );
            return false;
          });
        return analyzed;
      }
      this.logger.debug(
        `Nachricht übersprungen, bereits vorhanden (${existing.id})`,
      );
      return false;
    }

    const fromAddress = this.extractAddress(parsed.from);
    const toAddress = this.extractAddress(parsed.to);
    if (!fromAddress) {
      return false;
    }

    const subject =
      typeof parsed.subject === 'string' ? parsed.subject : 'Neue Nachricht';
    const text =
      typeof parsed.text === 'string'
        ? parsed.text
        : parsed.html
          ? parsed.html.replace(/<[^>]+>/g, ' ')
          : '';
    const preview = this.buildPreview(text);
    const receivedAt = parsed.date instanceof Date ? parsed.date : new Date();
    const attachments =
      parsed.attachments?.map((item) => {
        const buffer = Buffer.isBuffer(item.content)
          ? item.content
          : item.content
            ? Buffer.from(item.content as unknown as Uint8Array)
            : null;
        return {
          name: item.filename || 'Anhang',
          type: item.contentType || null,
          size:
            typeof item.size === 'number'
              ? item.size
              : (buffer?.byteLength ?? null),
          data: buffer ? buffer.toString('base64') : null,
        };
      }) ?? [];

    const contact = await this.prisma.customerContact.findFirst({
      where: {
        email: fromAddress,
      },
      include: {
        customer: true,
      },
    });

    const saved = await this.prisma.customerMessage.create({
      data: {
        tenant: { connect: { id: tenantId } },
        ownerUser: userId ? { connect: { id: userId } } : undefined,
        customer: contact?.customerId
          ? { connect: { id: contact.customerId } }
          : undefined,
        contact: contact?.id ? { connect: { id: contact.id } } : undefined,
        lead: undefined,
        direction: CustomerMessageDirection.INBOUND,
        status: CustomerMessageStatus.SENT,
        isSpam: Boolean(options?.isSpam),
        subject,
        preview,
        body: text || '(kein Inhalt)',
        fromEmail: fromAddress,
        toEmail: toAddress,
        externalId,
        receivedAt,
        sentAt: receivedAt,
        attachments,
      },
    });

    this.logger.log(
      `Neue Nachricht gespeichert (${saved.id}) – Tenant ${tenantId}, User ${userId}, Spam=${Boolean(options?.isSpam)}`,
    );

    void this.requestContext
      .run({ tenantId, userId }, () =>
        this.analyzeInboundMessage(saved.id, subject, text).then((updated) => {
          if (updated) {
            this.logger.debug(
              `Analyse abgeschlossen für Message ${saved.id} (Tenant ${tenantId}, User ${userId})`,
            );
          } else {
            this.logger.debug(
              `Analyse übersprungen für Message ${saved.id} (Tenant ${tenantId}, User ${userId})`,
            );
          }
        }),
      )
      .catch((error) =>
        this.logger.warn(
          `Analyse fehlgeschlagen für Tenant ${tenantId}: ${
            (error as Error)?.message ?? error
          }`,
        ),
      );

    return true;
  }

  private resolveMailboxes(
    credentials: ImapCredentials,
    available: ImapFlow['list'] extends () => Promise<(infer T)[]>
      ? T[]
      : never,
  ): {
    name: string;
    isSpam: boolean;
  }[] {
    const primaryCandidate = credentials?.mailbox?.trim() || 'INBOX';
    const spamCandidate =
      credentials?.spamMailbox?.trim() ||
      (primaryCandidate.toLowerCase() === 'inbox' ? 'Spam' : undefined);

    const seen = new Set<string>();
    const result: { name: string; isSpam: boolean }[] = [];

    const resolvedPrimary =
      this.findMatchingMailbox([primaryCandidate], available) ||
      primaryCandidate;
    if (resolvedPrimary) {
      seen.add(resolvedPrimary.toLowerCase());
      result.push({ name: resolvedPrimary, isSpam: false });
    }

    const specialSpam = this.findSpecialSpamMailbox(available);
    if (specialSpam && !seen.has(specialSpam.toLowerCase())) {
      seen.add(specialSpam.toLowerCase());
      result.push({ name: specialSpam, isSpam: true });
    } else {
      const spamCandidates = [
        spamCandidate,
        '[Gmail]/Spam',
        'INBOX/Spam',
        'INBOX.Spam',
        'Junk',
        'Junk E-mail',
        'Spam',
      ].filter(Boolean) as string[];

      const resolvedSpam = this.findMatchingMailbox(spamCandidates, available);
      if (resolvedSpam && !seen.has(resolvedSpam.toLowerCase())) {
        seen.add(resolvedSpam.toLowerCase());
        result.push({ name: resolvedSpam, isSpam: true });
      }
    }

    return result;
  }

  private async listAvailableMailboxes(client: ImapFlow) {
    return client.list();
  }

  private buildMailboxNameSet(
    mailboxes: ImapFlow['list'] extends () => Promise<(infer T)[]>
      ? T[]
      : never,
  ) {
    const names = new Set<string>();
    for (const mailbox of mailboxes) {
      if (!mailbox?.path) continue;
      names.add(mailbox.path);
      names.add(mailbox.path.toLowerCase());
    }
    return names;
  }

  private mailboxExists(available: Set<string>, name: string) {
    const lowerName = name.toLowerCase();
    if (available.has(name) || available.has(lowerName)) {
      return true;
    }
    for (const candidate of available) {
      const lowerCandidate = candidate.toLowerCase();
      if (
        lowerCandidate.endsWith(`/${lowerName}`) ||
        lowerCandidate.endsWith(`.${lowerName}`)
      ) {
        return true;
      }
    }
    return false;
  }

  private findMatchingMailbox(
    candidates: string[],
    available: ImapFlow['list'] extends () => Promise<(infer T)[]>
      ? T[]
      : never,
  ) {
    for (const candidate of candidates) {
      const lowerCandidate = candidate.toLowerCase();
      for (const mailbox of available) {
        const path = mailbox?.path;
        if (!path) continue;
        const lowerPath = path.toLowerCase();
        if (lowerPath === lowerCandidate) {
          return path;
        }
        if (
          lowerPath.endsWith(`/${lowerCandidate}`) ||
          lowerPath.endsWith(`.${lowerCandidate}`)
        ) {
          return path;
        }
      }
    }
    return null;
  }

  private findSpecialSpamMailbox(
    available: ImapFlow['list'] extends () => Promise<(infer T)[]>
      ? T[]
      : never,
  ) {
    for (const mailbox of available) {
      const special = mailbox?.specialUse?.toUpperCase();
      if (special === '\\JUNK') {
        return mailbox.path;
      }
      const flags = mailbox?.flags;
      if (
        flags &&
        typeof flags.has === 'function' &&
        (flags.has('\\Junk') || flags.has('\\JUNK'))
      ) {
        return mailbox.path;
      }
    }

    for (const mailbox of available) {
      const path = mailbox?.path;
      if (!path) continue;
      const lowerPath = path.toLowerCase();
      if (
        lowerPath.includes('spam') ||
        lowerPath.includes('junk') ||
        lowerPath.endsWith('/bulk') ||
        lowerPath.endsWith('.bulk')
      ) {
        return path;
      }
    }
    return null;
  }

  private async syncMailbox(
    client: ImapFlow,
    mailbox: string,
    startUid: number,
    cutoff: number | null,
    handler: (parsed: ParsedMail, uid: number) => Promise<boolean>,
    remainingBudget: number,
  ): Promise<{ processed: number; lastSeenUid: number }> {
    let processed = 0;
    let lastSeenUid = startUid;

    if (remainingBudget <= 0) {
      return { processed, lastSeenUid };
    }

    let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
    try {
      lock = await client.getMailboxLock(mailbox);
      const range = startUid ? `${startUid + 1}:*` : '1:*';
      for await (const message of client.fetch(
        { uid: range },
        { envelope: true, source: true, internalDate: true, uid: true },
      )) {
        if (processed >= remainingBudget) {
          break;
        }
        if (!message.uid || !message.source) {
          continue;
        }
        const internalDate =
          message.internalDate instanceof Date
            ? message.internalDate
            : message.internalDate
              ? new Date(message.internalDate)
              : null;
        if (cutoff && internalDate && internalDate.getTime() < cutoff) {
          lastSeenUid = Math.max(lastSeenUid, message.uid);
          continue;
        }

        const parsed = await simpleParser(message.source);
        const handled = await handler(parsed, message.uid);
        if (handled) {
          processed += 1;
          lastSeenUid = Math.max(lastSeenUid, message.uid);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Mailbox "${mailbox}" konnte nicht synchronisiert werden: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      lock?.release();
    }

    return { processed, lastSeenUid };
  }

  private normalizeAddress(value?: string | null) {
    return value?.trim().toLowerCase() || null;
  }

  private mapCategory(raw?: string | null): MessageCategory {
    const normalized = (raw ?? '')
      .toUpperCase()
      .replace(/Ä/g, 'AE')
      .replace(/Ö/g, 'OE')
      .replace(/Ü/g, 'UE')
      .replace(/[^A-Z]/g, '');
    if (normalized.includes('WERBUNG')) return MessageCategory.WERBUNG;
    if (normalized.includes('KUENDIG') || normalized.includes('KUNDIG'))
      return MessageCategory.KUENDIGUNG;
    if (normalized.includes('KRITISCH')) return MessageCategory.KRITISCH;
    if (normalized.includes('ANGEBOT')) return MessageCategory.ANGEBOT;
    if (normalized.includes('KOSTENVORANSCHLAG'))
      return 'KOSTENVORANSCHLAG' as MessageCategory;
    return MessageCategory.SONSTIGES;
  }

  private async analyzeInboundMessage(
    messageId: string,
    subject: string,
    body: string,
  ) {
    const tenantId = this.requestContext.getTenantId();
    const settings = await this.settingsService.getMessageAnalysisSettings();
    if (!settings.enabled) {
      this.logger.log(
        `Analyse deaktiviert – Tenant ${tenantId ?? 'unbekannt'}, Message ${messageId}`,
      );
      return false;
    }
    this.logger.log(
      `Analyse gestartet – Tenant ${tenantId ?? 'unbekannt'}, Message ${messageId}`,
    );
    const openAi = await this.settingsService.getOpenAiSettings({
      includeSecret: true,
    });
    const apiKey = openAi?.apiKey?.trim() || null;
    if (!apiKey) {
      this.logger.warn(
        `Kein gespeicherter OpenAI-Key für Tenant ${tenantId ?? 'unbekannt'} / User ${this.requestContext.getUserId() ?? 'unbekannt'} – Analyse übersprungen.`,
      );
      return false;
    }

    const prompt = `Analysiere die eingehende E-Mail und gib exakt dieses JSON zurück: {"category": "<Kategorie>", "summary": "<Kurzfassung>"}.
Kategorien: WERBUNG, KUENDIGUNG, KRITISCH, ANGEBOT, KOSTENVORANSCHLAG, SONSTIGES.
Wähle SONSTIGES, wenn nichts passt. Kurzfassung max. 30 Wörter, deutsch.

Betreff: ${subject || '(ohne)'}
Inhalt: ${body?.slice(0, 4000) || '(leer)'}`;

    let category: MessageCategory = MessageCategory.SONSTIGES;
    let summary: string | null = null;

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'Du bist ein deutscher E-Mail-Classifier für Kundenkommunikation.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI ${response.status} ${response.statusText}`);
      }
      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json?.choices?.[0]?.message?.content ?? '';
      const parsed: unknown = (() => {
        try {
          return JSON.parse(content) as unknown;
        } catch {
          return null;
        }
      })();
      const parsedRecord =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : null;
      const rawCategory =
        parsedRecord && typeof parsedRecord.category === 'string'
          ? parsedRecord.category
          : content;
      category = this.mapCategory(rawCategory);
      summary =
        parsedRecord && typeof parsedRecord.summary === 'string'
          ? parsedRecord.summary.slice(0, 512)
          : null;
    } catch (error) {
      this.logger.warn(
        `OpenAI Analyse fehlgeschlagen für Tenant ${tenantId ?? 'unbekannt'}: ${
          (error as Error)?.message ?? error
        }`,
      );
      return false;
    }

    await this.prisma.customerMessage.update({
      where: { id: messageId },
      data: {
        category,
        summary,
        analyzedAt: new Date(),
      },
    });
    this.logger.log(
      `Analyse gespeichert – Tenant ${tenantId ?? 'unbekannt'}, Message ${messageId}, Kategorie ${category}`,
    );
    return true;
  }

  private extractAddress(address: ParsedMail['from'] | ParsedMail['to']) {
    if (!address) {
      return null;
    }
    if (Array.isArray(address)) {
      return this.normalizeAddress(address[0]?.value?.[0]?.address || null);
    }
    return this.normalizeAddress(address.value?.[0]?.address || null);
  }

  private buildPreview(body: string) {
    if (!body) {
      return '';
    }
    return body.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
}
