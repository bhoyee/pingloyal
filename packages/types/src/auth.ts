import { PlanTier, UserRole } from './enums';

export interface JwtPayload {
  sub: string;      // userId
  tenantId: string; // CRITICAL — used for tenant isolation everywhere
  role: UserRole;
  planTier: PlanTier;
  iat: number;
  exp: number;
}

export interface RequestUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  planTier: PlanTier;
}
