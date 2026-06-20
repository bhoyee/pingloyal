import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';

describe('JwtAuthGuard.handleRequest', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard({ getAllAndOverride: jest.fn() } as never);
  });

  it('T1 — 410 Gone error (account deleted) is rethrown as-is', () => {
    const deletedErr = new HttpException(
      'This account has been deleted',
      HttpStatus.GONE,
    );

    expect(() => guard.handleRequest(deletedErr, false)).toThrow(
      HttpException,
    );
    try {
      guard.handleRequest(deletedErr, false);
    } catch (e) {
      expect(e).toBe(deletedErr);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.GONE);
    }
  });

  it('T2 — generic error falls back to UnauthorizedException', () => {
    expect(() =>
      guard.handleRequest(new Error('invalid signature'), false),
    ).toThrow(UnauthorizedException);
  });

  it('T3 — no user, no error: throws UnauthorizedException', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(
      UnauthorizedException,
    );
  });

  it('T4 — valid user, no error: returns the user', () => {
    const user = { userId: 'u1', tenantId: 't1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('T5 — non-GONE HttpException still falls back to UnauthorizedException', () => {
    const forbidden = new HttpException('nope', HttpStatus.FORBIDDEN);
    expect(() => guard.handleRequest(forbidden, false)).toThrow(
      UnauthorizedException,
    );
  });
});
