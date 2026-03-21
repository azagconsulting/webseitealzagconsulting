import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

import type { AppConfig } from '../../config/app.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type {
  AuthResponse,
  AuthUser,
  JwtPayload,
  LoginResponse,
  SanitizedUser,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { VerifyPasswordResetDto } from './dto/verify-password-reset.dto';
import { VerifyLoginDto } from './dto/verify-login.dto';

@Injectable()
export class AuthService {
  private readonly adminFirstLoginBypassKey = 'auth.adminFirstLoginBypassDone';
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;
  private readonly deviceTrustMs = 90 * 24 * 60 * 60 * 1000;
  private readonly loginCodeMs = 10 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    const auth = this.configService.getOrThrow('auth', { infer: true });
    this.jwtSecret = auth.jwt.secret;
    this.jwtExpiresIn = auth.jwt.expiresIn;
    this.refreshSecret = auth.refresh.secret;
    this.refreshExpiresIn = auth.refresh.expiresIn;
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Ungueltige Zugangsdaten.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Ungueltige Zugangsdaten.');
    }

    const deviceId = this.resolveDeviceId(dto.deviceId);
    const deviceHash = this.hashDeviceId(deviceId);
    const now = new Date();

    await this.prisma.trustedDevice.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: now },
      },
    });
    await this.prisma.deviceVerificationToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
      },
    });

    let shouldSkipTwoFactor =
      user.role === UserRole.ADMIN && user.lastLoginAt === null;

    if (!shouldSkipTwoFactor && user.role === UserRole.ADMIN) {
      const adminBypassDone = await this.prisma.tenantSetting.findUnique({
        where: {
          tenantId_key: {
            tenantId: user.tenantId,
            key: this.adminFirstLoginBypassKey,
          },
        },
        select: { id: true },
      });

      shouldSkipTwoFactor = !adminBypassDone;
    }

    if (shouldSkipTwoFactor) {
      const deviceExpiry = new Date(Date.now() + this.deviceTrustMs);
      const bypassPayload = {
        enabledAt: now.toISOString(),
        userId: user.id,
      };

      await this.prisma.$transaction([
        this.prisma.deviceVerificationToken.deleteMany({
          where: {
            userId: user.id,
            deviceHash,
          },
        }),
        this.prisma.trustedDevice.upsert({
          where: {
            userId_deviceHash: {
              userId: user.id,
              deviceHash,
            },
          },
          update: {
            lastSeenAt: now,
            expiresAt: deviceExpiry,
            revokedAt: null,
          },
          create: {
            tenantId: user.tenantId,
            userId: user.id,
            deviceHash,
            lastSeenAt: now,
            expiresAt: deviceExpiry,
          },
        }),
        this.prisma.tenantSetting.upsert({
          where: {
            tenantId_key: {
              tenantId: user.tenantId,
              key: this.adminFirstLoginBypassKey,
            },
          },
          update: {
            value: bypassPayload,
          },
          create: {
            tenantId: user.tenantId,
            key: this.adminFirstLoginBypassKey,
            value: bypassPayload,
          },
        }),
      ]);

      const updatedUser = await this.usersService.touchLogin(user.id);
      return this.buildAuthResponse(updatedUser);
    }

    const trustedDevice = await this.prisma.trustedDevice.findFirst({
      where: {
        userId: user.id,
        deviceHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!trustedDevice) {
      const code = this.generateLoginCode();
      const codeHash = this.hashLoginCode(code);
      const expiresAt = new Date(Date.now() + this.loginCodeMs);

      await this.prisma.deviceVerificationToken.deleteMany({
        where: {
          userId: user.id,
          deviceHash,
        },
      });

      await this.prisma.deviceVerificationToken.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          deviceHash,
          codeHash,
          expiresAt,
        },
      });

      await this.usersService.sendLoginVerificationEmail(
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
        },
        code,
        expiresAt,
      );

      return {
        requiresTwoFactor: true,
        deviceId,
        expiresAt: expiresAt.toISOString(),
      };
    }

    const deviceExpiry = new Date(Date.now() + this.deviceTrustMs);
    await this.prisma.trustedDevice.update({
      where: { id: trustedDevice.id },
      data: {
        lastSeenAt: now,
        expiresAt: deviceExpiry,
      },
    });

    const updatedUser = await this.usersService.touchLogin(user.id);
    return this.buildAuthResponse(updatedUser);
  }

  async verifyLogin(dto: VerifyLoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException(
        'Login-Code ist ungültig oder abgelaufen.',
      );
    }

    const deviceHash = this.hashDeviceId(dto.deviceId.trim());
    const now = new Date();
    const token = await this.prisma.deviceVerificationToken.findFirst({
      where: {
        userId: user.id,
        deviceHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new UnauthorizedException(
        'Login-Code ist ungültig oder abgelaufen.',
      );
    }

    const codeHash = this.hashLoginCode(dto.code.trim());
    if (!this.safeEqualHashes(token.codeHash, codeHash)) {
      throw new UnauthorizedException(
        'Login-Code ist ungültig oder abgelaufen.',
      );
    }

    const deviceExpiry = new Date(Date.now() + this.deviceTrustMs);
    await this.prisma.$transaction([
      this.prisma.deviceVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      }),
      this.prisma.trustedDevice.upsert({
        where: {
          userId_deviceHash: {
            userId: user.id,
            deviceHash,
          },
        },
        update: {
          lastSeenAt: now,
          expiresAt: deviceExpiry,
          revokedAt: null,
        },
        create: {
          tenantId: user.tenantId,
          userId: user.id,
          deviceHash,
          lastSeenAt: now,
          expiresAt: deviceExpiry,
        },
      }),
    ]);

    const updatedUser = await this.usersService.touchLogin(user.id);
    return this.buildAuthResponse(updatedUser);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    try {
      const payload = (await this.jwtService.verifyAsync<AuthUser>(
        dto.refreshToken,
        {
          secret: this.refreshSecret,
        },
      )) as JwtPayload;

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User nicht gefunden');
      }

      return this.buildAuthResponse(user);
    } catch {
      throw new UnauthorizedException(
        'Refresh Token ungueltig oder abgelaufen',
      );
    }
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const expiresAt = await this.usersService.requestPasswordReset(dto.email);
    return {
      message: 'Wenn ein Konto existiert, haben wir einen Reset-Code gesendet.',
      expiresAt: expiresAt?.toISOString() ?? null,
    };
  }

  async verifyPasswordReset(dto: VerifyPasswordResetDto) {
    const result = await this.usersService.verifyPasswordReset(
      dto.email,
      dto.code,
    );
    return {
      message: 'Reset-Code bestätigt. Bitte neues Passwort setzen.',
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    await this.usersService.confirmPasswordReset(
      dto.email,
      dto.code,
      dto.newPassword,
    );
    return { message: 'Passwort zurückgesetzt.' };
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      customerId: user.customerId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn,
      }),
    ]);

    return {
      user: this.mapUser(user),
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.parseExpiry(this.jwtExpiresIn),
      },
    };
  }

  private mapUser(user: User): SanitizedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      customerId: user.customerId,
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

  private parseExpiry(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const numeric = parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      return 0;
    }

    if (value.endsWith('m')) {
      return numeric * 60;
    }
    if (value.endsWith('h')) {
      return numeric * 60 * 60;
    }
    if (value.endsWith('d')) {
      return numeric * 60 * 60 * 24;
    }
    return numeric;
  }

  private resolveDeviceId(value?: string | null): string {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length >= 12) {
      return trimmed;
    }
    return randomBytes(16).toString('hex');
  }

  private hashDeviceId(value: string) {
    return createHmac('sha256', this.jwtSecret).update(value).digest('hex');
  }

  private generateLoginCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashLoginCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private safeEqualHashes(left: string, right: string) {
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    if (leftBuf.length !== rightBuf.length) {
      return false;
    }
    return timingSafeEqual(leftBuf, rightBuf);
  }

  toSafeUser(user: User): SanitizedUser {
    return this.mapUser(user);
  }
}
