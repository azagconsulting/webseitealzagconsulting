import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';

import { ALLOW_CUSTOMER_KEY } from '../decorators/allow-customer.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = { role?: UserRole }>(
    err: unknown,
    user: TUser | undefined,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException('Nicht authentifiziert.');
    }

    if (!user) {
      throw new UnauthorizedException('Nicht authentifiziert.');
    }

    const allowCustomer = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CUSTOMER_KEY,
      [context.getHandler(), context.getClass()],
    );

    const userRole = (user as { role?: UserRole }).role;
    if (userRole === UserRole.CUSTOMER && !allowCustomer) {
      throw new ForbiddenException(
        'Kein Zugriff auf den internen Arcto-Bereich.',
      );
    }

    return user;
  }
}
