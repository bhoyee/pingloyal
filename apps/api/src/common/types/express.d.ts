// Augments Express.User to match whichever guard ran: the tenant
// JwtStrategy.validate() (userId/tenantId/role/planTier) or the separate
// StaffJwtStrategy.validate() (staffId/fullName) — only one set is ever
// populated per request depending on which strategy authenticated it.
declare namespace Express {
  interface User {
    userId?: string; // was 'id' in bootstrap stub — updated for full auth
    tenantId?: string;
    role?: string;
    planTier?: string;
    staffId?: string;
    fullName?: string;
    staffRole?: string;
  }

  interface Request {
    id: string;
    tenantId?: string;
    rawBody?: Buffer;
  }
}
