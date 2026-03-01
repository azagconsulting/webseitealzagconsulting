import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import type { AuthUser } from '@/modules/auth/auth.types';

import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly context: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    const authUser = request?.user;
    const payload = authUser
      ? {
          tenantId: authUser.tenantId,
          userId: authUser.sub,
          role: authUser.role,
        }
      : {};

    return this.context.run(payload, () => next.handle());
  }
}
