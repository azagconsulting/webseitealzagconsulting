import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export type RequestContextPayload = {
  userId?: string;
  tenantId?: string;
  role?: UserRole;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextPayload>();

  run<T>(payload: RequestContextPayload, callback: () => T): T {
    return this.storage.run(payload, callback);
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  getRole(): UserRole | undefined {
    return this.storage.getStore()?.role;
  }
}
