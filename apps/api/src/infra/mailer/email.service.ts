import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, {
  type Transporter,
  type SentMessageInfo,
  type SendMailOptions,
} from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import type {
  SmtpCredentials,
  SmtpEncryption,
} from '../../common/interfaces/smtp-settings.interface';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
}

export interface EmailSendResult {
  messageId?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: Transporter<SentMessageInfo>;
  private readonly defaultSender?: string;
  private readonly defaultCredentials?: SmtpCredentials;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (host && port && user && pass) {
      const encryption = this.inferEncryption(port);
      this.defaultCredentials = {
        host,
        port,
        username: user,
        password: pass,
        fromEmail: user,
        fromName: null,
        encryption,
      };
      this.defaultSender = user;
      this.transporter = this.createTransport(this.defaultCredentials);
    } else {
      this.logger.warn(
        'SMTP-Konfiguration unvollständig – Nachrichten werden nur protokolliert.',
      );
    }
  }

  getDefaultSender() {
    return this.defaultSender;
  }

  hasSmtpTransport() {
    return Boolean(this.transporter);
  }

  async sendEmail(
    options: SendEmailOptions,
    override?: SmtpCredentials,
  ): Promise<EmailSendResult> {
    const payload: SendMailOptions = {
      from:
        options.from ??
        override?.fromEmail ??
        this.defaultSender ??
        'notifications@arcto.app',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      headers: options.headers,
      replyTo: options.replyTo,
      attachments: options.attachments?.length
        ? options.attachments
        : undefined,
    };

    if (override) {
      return this.sendWithCustomCredentials(payload, override);
    }

    const transporter = this.transporter;
    if (!transporter) {
      return this.logDryRun(payload);
    }

    // nodemailer typings return `any` here; assert expected response shape
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SentMessageInfo = await transporter.sendMail(payload);
    return { messageId: this.resolveMessageId(response) };
  }

  private async sendWithCustomCredentials(
    payload: SendMailOptions,
    credentials: SmtpCredentials,
  ) {
    const transport = this.createTransport(credentials);
    const mailOptions: SendMailOptions = {
      ...payload,
      from:
        credentials.fromEmail ||
        credentials.username ||
        payload.from ||
        this.defaultSender,
    };
    // nodemailer typings return `any` here; assert expected response shape
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SentMessageInfo = await transport.sendMail(mailOptions);
    return { messageId: this.resolveMessageId(response) };
  }

  private createTransport(
    credentials: SmtpCredentials,
  ): Transporter<SentMessageInfo> {
    const smtpOptions: SMTPTransport.Options = {
      host: credentials.host,
      port: credentials.port,
      secure: credentials.encryption === 'ssl' || credentials.port === 465,
      requireTLS: credentials.encryption === 'tls',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      tls:
        credentials.encryption === 'tls'
          ? { rejectUnauthorized: false }
          : undefined,
    };
    return nodemailer.createTransport<SentMessageInfo>(smtpOptions);
  }

  private inferEncryption(port?: number): SmtpEncryption {
    if (port === 465) {
      return 'ssl';
    }
    if (port === 25 || port === 1025) {
      return 'none';
    }
    return 'tls';
  }

  private logDryRun(payload: SendMailOptions): EmailSendResult {
    const recipient = this.formatRecipient(payload.to);
    this.logger.warn(
      `Kein SMTP-Transport verfügbar. Simuliere Versand an ${recipient} mit Betreff "${payload.subject ?? '(kein Betreff)'}".`,
    );
    return { messageId: `dry-run-${Date.now()}` };
  }

  private formatRecipient(value: SendMailOptions['to']) {
    const toString = (entry: string | { address: string; name?: string }) =>
      typeof entry === 'string'
        ? entry
        : [entry.name, entry.address].filter(Boolean).join(' ').trim();

    if (!value) {
      return 'unbekannt';
    }
    if (Array.isArray(value)) {
      return value.map(toString).join(', ');
    }
    return toString(value as string | { address: string; name?: string });
  }

  private resolveMessageId(result: unknown) {
    if (result && typeof result === 'object' && 'messageId' in result) {
      return (result as { messageId?: string }).messageId;
    }
    return undefined;
  }
}
