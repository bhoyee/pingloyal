import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@pingloyal/types';
import type { RequestStaff } from '@pingloyal/types';
import { STAFF_ROLES_KEY } from '../decorators/staff-roles.decorator';

// Deliberately separate from the tenant-side RolesGuard (common/guards/roles.guard.ts):
// that guard is wired as a global APP_GUARD reading request.user.role, which staff
// requests never populate (they carry staffId/fullName/staffRole instead). Applying
// @Roles() to a staff route would silently no-op rather than enforce anything, so
// this guard is local-only, opted into per-controller via @UseGuards(StaffAuthGuard,
// StaffRolesGuard) — same pattern staff routes already use for StaffAuthGuard.
@Injectable()
export class StaffRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(
      STAFF_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: RequestStaff }>();
    const staff = request.user;

    if (!staff || !requiredRoles.includes(staff.staffRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
