// Augments Express.User to match the RequestUser returned by JwtStrategy.validate()
declare namespace Express {
  interface User {
    userId: string; // was 'id' in bootstrap stub — updated for full auth
    tenantId: string;
    role: string;
    planTier: string;
  }

  interface Request {
    id: string;
    tenantId?: string;
    rawBody?: Buffer;
  }
}
