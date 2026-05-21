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
//# sourceMappingURL=auth.d.ts.map