import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '@pingloyal/types';

export const STAFF_ROLES_KEY = 'staffRoles';
export const StaffRoles = (...roles: StaffRole[]) =>
  SetMetadata(STAFF_ROLES_KEY, roles);
