import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      // Should never happen after JwtAuthGuard runs — indicates a code bug
      throw new InternalServerErrorException(
        'Tenant context not found on request — JwtAuthGuard may not have run',
      );
    }
    return tenantId;
  },
);
