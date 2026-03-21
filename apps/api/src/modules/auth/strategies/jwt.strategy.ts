import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';

import type { AppConfig } from '../../../config/app.config';
import type { AuthUser, JwtPayload } from '../auth.types';

type JwtExtractor = (request: Request) => string | null;

interface JwtStrategyOptions {
  jwtFromRequest: JwtExtractor;
  ignoreExpiration: boolean;
  secretOrKey: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const authConfig = configService.getOrThrow<AppConfig['auth']>('auth');

    const { jwt } = authConfig;

    if (!jwt?.secret) {
      throw new Error('JWT Konfiguration fehlt');
    }

    const secret: string = jwt.secret;

    const jwtFromRequest: JwtExtractor = (request: Request) => {
      const header = request?.headers?.authorization;
      if (!header) {
        return null;
      }

      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return null;
      }

      return token;
    };

    const options: JwtStrategyOptions = {
      jwtFromRequest,
      ignoreExpiration: false,
      secretOrKey: secret,
    };

    super(options);
  }

  validate(payload: JwtPayload): AuthUser {
    return payload;
  }
}
