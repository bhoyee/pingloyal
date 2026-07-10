import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
import type { RequestStaff } from '@pingloyal/types';
import { StaffRole } from '@pingloyal/types';

export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestStaff => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const staffId = request.user?.staffId;
    const fullName = request.user?.fullName;
    const staffRole = request.user?.staffRole as StaffRole | undefined;
    if (!staffId || !fullName || !staffRole) {
      throw new InternalServerErrorException(
        'Staff context not found on request — StaffAuthGuard may not have run',
      );
    }
    return { staffId, fullName, staffRole };
  },
);
