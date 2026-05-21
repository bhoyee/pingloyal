declare namespace Express {
  interface User {
    id: string;
    tenantId: string;
    role: string;
  }

  interface Request {
    id: string;
    tenantId?: string;
  }
}
