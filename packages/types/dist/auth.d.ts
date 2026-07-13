import { PlanTier, UserRole } from './enums';
export interface JwtPayload {
    sub: string;
    tenantId: string;
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
export interface StaffJwtPayload {
    sub: string;
    type: 'staff';
    iat: number;
    exp: number;
}
export interface RequestStaff {
    staffId: string;
    fullName: string;
}
//# sourceMappingURL=auth.d.ts.map