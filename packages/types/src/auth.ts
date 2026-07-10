import { PlanTier, StaffRole, UserRole } from './enums';

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

// PingLoyal-internal staff (support ticket panel) — deliberately separate
// shape from RequestUser/JwtPayload above: no tenantId/role/planTier, so a
// staff token can never be mistaken for a tenant token even if it somehow
// reached the wrong guard.
export interface StaffJwtPayload {
  sub: string; // staffId
  type: 'staff';
  staffRole: StaffRole;
  iat: number;
  exp: number;
}

export interface RequestStaff {
  staffId: string;
  fullName: string;
  staffRole: StaffRole;
}
