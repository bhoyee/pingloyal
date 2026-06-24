import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';

export const CurrentStaff = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): { staffId: string; fullName: string } => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const staffId = request.user?.staffId;
    const fullName = request.user?.fullName;
    if (!staffId || !fullName) {
      throw new InternalServerErrorException(
        'Staff context not found on request — StaffAuthGuard may not have run',
      );
    }
    return { staffId, fullName };
  },
);
