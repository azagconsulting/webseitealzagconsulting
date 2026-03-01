import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    type RequestWithUser = { user?: { role?: UserRole } };
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const role = request.user?.role;
    return role === UserRole.ADMIN;
  }
}
