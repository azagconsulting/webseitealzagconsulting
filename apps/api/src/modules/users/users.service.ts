import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';

import { EmailService } from '../../infra/mailer/email.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { SanitizedUser } from '../auth/auth.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SettingsService } from '../settings/settings.service';
import { SmtpCredentials } from '../../common/interfaces/smtp-settings.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

interface CreateUserInput {
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly context: RequestContextService,
    private readonly settingsService: SettingsService,
  ) {}

  private readonly logger = new Logger(UsersService.name);

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role ?? UserRole.COORDINATOR,
      },
    });
  }

  count() {
    return this.prisma.user.count({
      where: { tenantId: this.context.getTenantId() },
    });
  }

  async touchLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async listAssignableUsers() {
    return this.prisma.user.findMany({
      where: { tenantId: this.context.getTenantId() },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }

  async listEmployees(): Promise<SanitizedUser[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId: this.context.getTenantId() },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toSanitizedUser(user));
  }

  async createEmployee(dto: CreateEmployeeDto) {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        'Ein Mitarbeiter mit dieser E-Mail existiert bereits.',
      );
    }

    const password =
      dto.password ??
      randomBytes(6)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 10);

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: this.requireTenantId(),
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? UserRole.COORDINATOR,
      },
    });

    const tempPassword = dto.password ? undefined : password;
    let inviteEmailSent = false;
    let inviteEmailError: string | undefined;
    try {
      await this.sendInviteEmail({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: tempPassword ?? dto.password ?? password,
      });
      inviteEmailSent = true;
    } catch (err) {
      inviteEmailError =
        err instanceof Error
          ? err.message
          : 'Einladung konnte nicht gesendet werden.';
      this.logger.warn(
        `Einladung konnte nicht per E-Mail gesendet werden: ${inviteEmailError}`,
      );
    }

    return {
      user: this.toSanitizedUser(user),
      temporaryPassword: tempPassword,
      inviteEmailSent,
      inviteEmailError,
    };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const clean = (value?: string | null) => {
      if (!value) {
        return value ?? null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const data: Prisma.UserUpdateInput = {
      firstName: clean(dto.firstName),
      lastName: clean(dto.lastName),
      jobTitle: clean(dto.jobTitle),
      headline: clean(dto.headline),
      phone: clean(dto.phone),
      location: clean(dto.location),
      pronouns: clean(dto.pronouns),
      bio: clean(dto.bio),
      avatarUrl: clean(dto.avatarUrl),
      linkedinUrl: clean(dto.linkedinUrl),
      twitterUrl: clean(dto.twitterUrl),
      calendlyUrl: clean(dto.calendlyUrl),
    };

    if (dto.email) {
      data.email = dto.email.toLowerCase();
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        jobTitle: true,
        headline: true,
        phone: true,
        location: true,
        pronouns: true,
        bio: true,
        linkedinUrl: true,
        twitterUrl: true,
        calendlyUrl: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Mitarbeiter nicht gefunden.');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.role) data.role = dto.role;

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    return this.toSanitizedUser(user);
  }

  async deleteEmployee(id: string) {
    const tenantId = this.requireTenantId();
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) {
      throw new NotFoundException('Mitarbeiter nicht gefunden.');
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Mitarbeiter gelöscht.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Benutzer wurde nicht gefunden.');
    }

    const isValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw new BadRequestException('Aktuelles Passwort ist nicht korrekt.');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'Neues Passwort und Bestätigung stimmen nicht überein.',
      );
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Das neue Passwort muss sich vom bisherigen unterscheiden.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.sendPasswordChangedEmail(user);
    return { message: 'Passwort aktualisiert.' };
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Benutzer wurde nicht gefunden.');
    }

    const isValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw new BadRequestException('Passwort ist nicht korrekt.');
    }

    const nextEmail = dto.newEmail.trim().toLowerCase();
    const confirmEmail = dto.confirmEmail.trim().toLowerCase();

    if (nextEmail !== confirmEmail) {
      throw new BadRequestException(
        'Neue E-Mail und Bestätigung stimmen nicht überein.',
      );
    }

    if (nextEmail === user.email) {
      throw new BadRequestException(
        'Die neue E-Mail-Adresse entspricht der aktuellen.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: nextEmail },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      throw new BadRequestException(
        'Diese E-Mail-Adresse wird bereits verwendet.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: nextEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        tenantId: true,
      },
    });

    await this.sendEmailChangedNotifications({
      oldEmail: user.email,
      newEmail: updated.email,
      user: updated,
    });

    return { message: 'E-Mail aktualisiert.', email: updated.email };
  }

  async requestPasswordReset(email: string): Promise<Date | null> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const user = await this.findByEmail(normalized);
    if (!user) {
      return null;
    }

    const code = this.generateResetCode();
    const codeHash = this.hashResetCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
      },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        codeHash,
        expiresAt,
      },
    });

    await this.sendPasswordResetEmail(user, code, expiresAt);
    return expiresAt;
  }

  async verifyPasswordReset(email: string, code: string) {
    const { token } = await this.validateResetCode(email, code);
    return { expiresAt: token.expiresAt };
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string) {
    const { user, token } = await this.validateResetCode(email, code);

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          tenantId: true,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.sendPasswordChangedEmail(updatedUser);
  }

  private async validateResetCode(email: string, code: string) {
    const normalized = email?.trim().toLowerCase();
    const cleanCode = code?.trim();
    if (!normalized || !cleanCode) {
      throw new BadRequestException('Reset-Code ist ungültig oder abgelaufen.');
    }

    const user = await this.findByEmail(normalized);
    if (!user) {
      throw new BadRequestException('Reset-Code ist ungültig oder abgelaufen.');
    }

    const now = new Date();
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException('Reset-Code ist ungültig oder abgelaufen.');
    }

    const codeHash = this.hashResetCode(cleanCode);
    if (token.codeHash !== codeHash) {
      throw new BadRequestException('Reset-Code ist ungültig oder abgelaufen.');
    }

    return { user, token };
  }

  private toSanitizedUser(user: User): SanitizedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitle: user.jobTitle,
      headline: user.headline,
      phone: user.phone,
      location: user.location,
      pronouns: user.pronouns,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      linkedinUrl: user.linkedinUrl,
      twitterUrl: user.twitterUrl,
      calendlyUrl: user.calendlyUrl,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  private requireTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }
    return tenantId;
  }

  private formatUserName(user: Pick<User, 'firstName' | 'lastName' | 'email'>) {
    const parts = [user.firstName, user.lastName]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value && value.length));
    const name = parts.join(' ').trim();
    return name || user.email;
  }

  private buildGreeting(user: Pick<User, 'firstName' | 'lastName' | 'email'>) {
    const name = this.formatUserName(user);
    return name ? `Hallo ${name},` : 'Hallo,';
  }

  private getAppUrl() {
    return process.env.APP_URL ?? 'http://localhost:3000';
  }

  private async resolveSecuritySmtp(
    tenantId?: string,
  ): Promise<SmtpCredentials | null> {
    return this.settingsService.getContactFormSmtpCredentials(tenantId);
  }

  private buildSecurityHtml(options: {
    greeting: string;
    body: string;
    footer: string;
    appUrl: string;
  }) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sicherheitsbenachrichtigung</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #0b1220; padding: 24px; color: #e2e8f0;">
  <div style="max-width: 640px; margin: auto; background: linear-gradient(135deg, #111827 0%, #0b1220 100%); border-radius: 16px; padding: 32px; border: 1px solid #1f2937;">
    <p style="letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; color: #94a3b8; margin: 0 0 16px 0;">Sicherheit</p>
    <p style="margin: 0 0 12px 0; font-size: 15px; color: #e2e8f0;">${options.greeting}</p>
    <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">${options.body}</p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">${options.footer}</p>
    <a href="${options.appUrl}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: #0b1220; padding: 12px 20px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Zum Arcto CRM</a>
  </div>
</body>
</html>`;
  }

  private async sendPasswordChangedEmail(
    user: Pick<User, 'email' | 'firstName' | 'lastName' | 'tenantId'>,
  ) {
    const smtp = await this.resolveSecuritySmtp(user.tenantId);
    const timestamp = new Date().toLocaleString('de-DE', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const loginUrl = this.getAppUrl();
    const greeting = this.buildGreeting(user);
    const body = `Ihr Passwort wurde am ${timestamp} geändert.`;
    const footer = `Falls Sie diese Änderung nicht veranlasst haben, setzen Sie Ihr Passwort unter ${loginUrl} zurück oder informieren Sie sofort Ihr Admin-Team.`;
    const text = `${greeting}\n\n${body}\n${footer}\n\n${loginUrl}`;
    const html = this.buildSecurityHtml({
      greeting,
      body,
      footer,
      appUrl: loginUrl,
    });

    try {
      await this.emailService.sendEmail(
        {
          to: user.email,
          subject: 'Ihr Passwort wurde geändert',
          text,
          html,
        },
        smtp ?? undefined,
      );
    } catch (error) {
      this.logger.warn(
        `Passwort-Benachrichtigung konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  private generateResetCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashResetCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private async sendPasswordResetEmail(
    user: Pick<User, 'email' | 'firstName' | 'lastName' | 'tenantId'>,
    code: string,
    expiresAt: Date,
  ) {
    const smtp = await this.resolveSecuritySmtp(user.tenantId);
    if (!smtp) {
      this.logger.warn(
        'Kontaktformular-SMTP fehlt – nutze Standardversand für Reset-Codes.',
      );
    }

    const loginUrl = this.getAppUrl();
    const greeting = this.buildGreeting(user);
    const formattedExpiry = expiresAt.toLocaleString('de-DE', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const subject = 'Dein Arcto Reset-Code';
    const body = `Wir haben einen Reset-Code für dein Konto erzeugt. Code: ${code}. Gültig bis ${formattedExpiry}.`;
    const footer = `Wenn du keinen Reset angefordert hast, ignoriere diese Mail oder ändere dein Passwort unter ${loginUrl}.`;
    const text = `${greeting}\n\n${body}\n${footer}`;
    const html = this.buildSecurityHtml({
      greeting,
      body: `Wir haben einen Reset-Code für dein Konto erzeugt.<br/><strong>Code: ${code}</strong><br/>Gültig bis ${formattedExpiry}.`,
      footer,
      appUrl: loginUrl,
    });

    try {
      await this.emailService.sendEmail(
        {
          to: user.email,
          subject,
          text,
          html,
        },
        smtp ?? undefined,
      );
    } catch (error) {
      this.logger.warn(
        `Passwort-Reset-Mail konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  async sendLoginVerificationEmail(
    user: Pick<User, 'email' | 'firstName' | 'lastName' | 'tenantId'>,
    code: string,
    expiresAt: Date,
  ) {
    const smtp = await this.resolveSecuritySmtp(user.tenantId);
    if (!smtp) {
      this.logger.warn(
        'Kontaktformular-SMTP fehlt – nutze Standardversand für Login-Codes.',
      );
    }

    const loginUrl = this.getAppUrl();
    const greeting = this.buildGreeting(user);
    const formattedExpiry = expiresAt.toLocaleString('de-DE', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const subject = 'Ihr Login-Code';
    const body = `Wir haben einen Sicherheitscode für die Anmeldung an Ihrem Konto erzeugt. Code: ${code}. Gültig bis ${formattedExpiry}.`;
    const footer = `Wenn Sie diese Anmeldung nicht ausgelöst haben, setzen Sie Ihr Passwort unter ${loginUrl} zurück oder informieren Sie Ihr Admin-Team.`;
    const text = `${greeting}\n\n${body}\n${footer}`;
    const html = this.buildSecurityHtml({
      greeting,
      body: `Wir haben einen Sicherheitscode für die Anmeldung an Ihrem Konto erzeugt.<br/><strong>Code: ${code}</strong><br/>Gültig bis ${formattedExpiry}.`,
      footer,
      appUrl: loginUrl,
    });

    try {
      await this.emailService.sendEmail(
        {
          to: user.email,
          subject,
          text,
          html,
        },
        smtp ?? undefined,
      );
    } catch (error) {
      this.logger.warn(
        `Login-Code konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  async sendMagicLoginEmail(
    user: Pick<User, 'email' | 'firstName' | 'lastName' | 'tenantId'>,
    magicUrl: string,
    expiresAt: Date,
  ) {
    const smtp = await this.resolveSecuritySmtp(user.tenantId);
    if (!smtp) {
      this.logger.warn(
        'Kontaktformular-SMTP fehlt – nutze Standardversand für Magic-Links.',
      );
    }

    const loginUrl = this.getAppUrl();
    const greeting = this.buildGreeting(user);
    const formattedExpiry = expiresAt.toLocaleString('de-DE', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const subject = 'Ihr Magic-Login-Link';
    const body = `Wir haben einen einmaligen Login-Link erzeugt. Er ist bis ${formattedExpiry} gültig und kann genau einmal genutzt werden.`;
    const footer = `Wenn Sie diese Anmeldung nicht ausgelöst haben, ignorieren Sie diese E-Mail oder setzen Sie Ihr Passwort unter ${loginUrl} zurück.`;
    const text = `${greeting}\n\n${body}\n\nLogin-Link: ${magicUrl}\n\n${footer}`;
    const html = this.buildSecurityHtml({
      greeting,
      body: `Wir haben einen einmaligen Login-Link erzeugt.<br/>Er ist bis ${formattedExpiry} gültig und kann genau einmal genutzt werden.<br/><br/><a href="${magicUrl}" style="display:inline-block; margin-top:8px; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: #0b1220; padding: 12px 20px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Jetzt einloggen</a>`,
      footer,
      appUrl: loginUrl,
    });

    try {
      await this.emailService.sendEmail(
        {
          to: user.email,
          subject,
          text,
          html,
        },
        smtp ?? undefined,
      );
    } catch (error) {
      this.logger.warn(
        `Magic-Link konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  private async sendEmailChangedNotifications(params: {
    oldEmail: string;
    newEmail: string;
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'tenantId'>;
  }) {
    const smtp = await this.resolveSecuritySmtp(params.user.tenantId);
    const loginUrl = this.getAppUrl();
    const timestamp = new Date().toLocaleString('de-DE', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const greeting = this.buildGreeting(params.user);
    const subject = 'Ihre Login-E-Mail wurde geändert';

    const notifications = [
      {
        to: params.oldEmail,
        text: `${greeting}\n\nIhre Login-E-Mail wurde am ${timestamp} auf ${params.newEmail} geändert. Falls Sie das nicht waren, melden Sie sich bitte im Portal (${loginUrl}) und setzen Sie Ihr Passwort zurück.`,
        html: this.buildSecurityHtml({
          greeting,
          body: `Ihre Login-E-Mail wurde am ${timestamp} auf <strong>${params.newEmail}</strong> geändert.`,
          footer: `Falls Sie das nicht waren, setzen Sie Ihr Passwort unter ${loginUrl} zurück oder kontaktieren Sie das Admin-Team.`,
          appUrl: loginUrl,
        }),
      },
      {
        to: params.newEmail,
        text: `${greeting}\n\nDiese Adresse (${params.newEmail}) ist nun als Login im Arcto CRM hinterlegt. Zuvor genutzt: ${params.oldEmail}. Bewahre diese Nachricht als Bestätigung auf.`,
        html: this.buildSecurityHtml({
          greeting,
          body: `Diese Adresse ist ab sofort dein Login im Arcto CRM. Zuvor genutzt: ${params.oldEmail}.`,
          footer: `Wenn du diese Änderung nicht selbst ausgelöst hast, ändere bitte umgehend dein Passwort unter ${loginUrl}.`,
          appUrl: loginUrl,
        }),
      },
    ];

    if (!smtp) {
      this.logger.warn(
        'Kontaktformular-SMTP fehlt – E-Mail-Änderungs-Benachrichtigungen werden übersprungen.',
      );
      return;
    }

    await Promise.all(
      notifications.map(async (notification) => {
        try {
          await this.emailService.sendEmail(
            {
              to: notification.to,
              subject,
              text: notification.text,
              html: notification.html,
            },
            smtp,
          );
        } catch (error) {
          this.logger.warn(
            `E-Mail-Änderungs-Benachrichtigung an ${notification.to} konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
          );
        }
      }),
    );
  }

  private async sendInviteEmail(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    password: string;
  }) {
    // Prefer primäres SMTP, falle auf Kontaktformular-SMTP zurück, bevor wir abbrechen.
    const tenantSmtp =
      (await this.settingsService.getSmtpCredentials()) ??
      (await this.settingsService.getContactFormSmtpCredentials());

    if (!tenantSmtp && !this.emailService.hasSmtpTransport()) {
      throw new Error(
        'SMTP ist nicht konfiguriert. Bitte unter Einstellungen (E-Mail oder Kontaktformular) einen SMTP-Zugang hinterlegen.',
      );
    }

    const name = [input.firstName, input.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const loginUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const subject = 'Willkommen im Arcto CRM – dein Zugang';
    const greeting = name ? `Hi ${name},` : 'Hi,';

    const text = [
      greeting,
      '',
      'du wurdest ins Arcto CRM eingeladen. Hier sind deine Zugangsdaten:',
      `E-Mail: ${input.email}`,
      `Passwort: ${input.password}`,
      '',
      `Login: ${loginUrl}`,
      '',
      'Bitte melde dich an und ändere dein Passwort nach dem ersten Login in deinem Profil.',
      '',
      'Wenn du Fragen hast, melde dich gerne beim Team.',
      '',
      'Viele Grüße',
      'Dein Arcto Team',
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #0b1220; padding: 24px; color: #e2e8f0;">
    <div style="max-width: 640px; margin: auto; background: linear-gradient(135deg, #111827 0%, #0b1220 100%); border-radius: 16px; padding: 32px; border: 1px solid #1f2937;">
        <p style="letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; color: #94a3b8; margin: 0 0 12px 0;">Team</p>
        <h1 style="margin: 0 0 12px 0; font-size: 24px; color: #e5e7eb;">Willkommen im Arcto CRM</h1>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">${greeting}</p>
        <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6;">
            du wurdest eingeladen, unser CRM zu nutzen. Hier sind deine Zugangsdaten:
        </p>
        <div style="background: #0f172a; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #cbd5e1;"><strong>E-Mail:</strong> ${input.email}</p>
            <p style="margin: 0; font-size: 14px; color: #cbd5e1;"><strong>Passwort:</strong> ${input.password}</p>
        </div>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
            Bitte ändere dein Passwort nach dem ersten Login in deinem Profil.
        </p>
        <a href="${loginUrl}" style="display: inline-block; margin-top: 8px; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: #0b1220; padding: 12px 20px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Jetzt anmelden
        </a>
        <p style="margin: 20px 0 0 0; font-size: 13px; color: #94a3b8;">
            Bei Fragen melde dich gerne beim Team.
        </p>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #94a3b8;">Viele Grüße<br>Dein Arcto Team</p>
    </div>
</body>
</html>`;

    await this.emailService.sendEmail(
      {
        to: input.email,
        subject,
        text,
        html,
        from:
          tenantSmtp?.fromEmail && tenantSmtp.fromName
            ? `${tenantSmtp.fromName} <${tenantSmtp.fromEmail}>`
            : (tenantSmtp?.fromEmail ??
              (this.emailService.getDefaultSender()
                ? `Arcto Team <${this.emailService.getDefaultSender()}>`
                : undefined)),
      },
      tenantSmtp ?? undefined,
    );
  }
}
