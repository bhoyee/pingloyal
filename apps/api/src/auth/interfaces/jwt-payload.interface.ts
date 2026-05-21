export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface RequestUser {
  id: string;
  tenantId: string;
  role: string;
}
