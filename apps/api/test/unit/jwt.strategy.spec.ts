import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtStrategy } from '../../src/modules/auth/strategies/jwt.strategy';
import { UserRole, PlanTier } from '@pingloyal/types';
import type { JwtPayload } from '@pingloyal/types';

const DUMMY_PUBLIC_KEY_B64 =
  Buffer.from('dummy-key-for-test').toString('base64');

function makeConfig() {
  return { getOrThrow: jest.fn().mockReturnValue(DUMMY_PUBLIC_KEY_B64) };
}

const PAYLOAD: JwtPayload = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  role: UserRole.OWNER,
  planTier: PlanTier.STARTER,
  iat: 0,
  exp: 0,
};

describe('JwtStrategy.validate', () => {
  let mockUserRepo: { findOne: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    mockUserRepo = { findOne: jest.fn() };
    strategy = new JwtStrategy(makeConfig() as never, mockUserRepo as never);
  });

  it('T1 — active user, tenant not pending deletion: returns RequestUser', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: UserRole.OWNER,
      isActive: true,
      tenant: { id: 'tenant-1', deletionRequestedAt: null },
    });

    const result = await strategy.validate(PAYLOAD);

    expect(result).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: UserRole.OWNER,
      planTier: PlanTier.STARTER,
    });
  });

  it('T2 — user not found: throws UnauthorizedException', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);

    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('T3 — user inactive: throws UnauthorizedException', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: UserRole.OWNER,
      isActive: false,
      tenant: { id: 'tenant-1', deletionRequestedAt: null },
    });

    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('T4 — tenant has deletionRequestedAt set: throws 410 Gone', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: UserRole.OWNER,
      isActive: true,
      tenant: { id: 'tenant-1', deletionRequestedAt: new Date() },
    });

    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(HttpException);
    try {
      await strategy.validate(PAYLOAD);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.GONE);
    }
  });

  it('T4b — tenant has deletedAt set (staff soft-delete): throws 410 Gone', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: UserRole.OWNER,
      isActive: true,
      tenant: {
        id: 'tenant-1',
        deletionRequestedAt: null,
        deletedAt: new Date(),
      },
    });

    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(HttpException);
    try {
      await strategy.validate(PAYLOAD);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.GONE);
    }
  });

  it('T5 — queries by both id and tenantId from the JWT payload', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: UserRole.OWNER,
      isActive: true,
      tenant: { id: 'tenant-1', deletionRequestedAt: null },
    });

    await strategy.validate(PAYLOAD);

    expect(mockUserRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', tenantId: 'tenant-1' },
      }),
    );
  });
});
