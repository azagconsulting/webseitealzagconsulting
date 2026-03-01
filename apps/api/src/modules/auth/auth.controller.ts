import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { UsersService } from '../users/users.service';
import type {
  AuthResponse,
  AuthUser,
  LoginResponse,
  SanitizedUser,
} from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { VerifyPasswordResetDto } from './dto/verify-password-reset.dto';
import { VerifyLoginDto } from './dto/verify-login.dto';
import { RequestMagicLoginDto } from './dto/request-magic-login.dto';
import { ConsumeMagicLoginDto } from './dto/consume-magic-login.dto';

@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login/verify')
  verifyLogin(@Body() dto: VerifyLoginDto): Promise<AuthResponse> {
    return this.authService.verifyLogin(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponse> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/request')
  requestReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('magic-link/request')
  requestMagicLink(@Body() dto: RequestMagicLoginDto, @Req() req: Request) {
    return this.authService.requestMagicLogin(dto, this.getRequestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('magic-link/consume')
  consumeMagicLink(@Body() dto: ConsumeMagicLoginDto, @Req() req: Request) {
    return this.authService.consumeMagicLogin(dto, this.getRequestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('password-reset/verify')
  verifyReset(@Body() dto: VerifyPasswordResetDto) {
    return this.authService.verifyPasswordReset(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/confirm')
  confirmReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Get('me')
  async me(@CurrentUser() user?: AuthUser): Promise<SanitizedUser | null> {
    if (!user) {
      return null;
    }

    const entity = await this.usersService.findById(user.sub);
    if (!entity) {
      return null;
    }

    return this.authService.toSafeUser(entity);
  }

  private getRequestMeta(req: Request) {
    return {
      ip:
        req.ip ||
        (typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
          : undefined) ||
        null,
      userAgent:
        (typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : undefined) || null,
    };
  }
}
