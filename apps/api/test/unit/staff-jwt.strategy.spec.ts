import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { StaffJwtStrategy } from '../../src/modules/staff-auth/strategies/staff-jwt.strategy';
import { Staff } from '../../src/modules/staff-auth/entities/staff.entity';

const mockStaffRepo = { findOne: jest.fn() };

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue(Buffer.from('pub').toString('base64')),
};

async function buildStrategy() {
  const mod = await Test.createTestingModule({
    providers: [
      StaffJwtStrategy,
      { provide: getRepositoryToken(Staff), useValue: mockStaffRepo },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  return mod.get(StaffJwtStrategy);
}

beforeEach(() => jest.clearAllMocks());

describe('StaffJwtStrategy', () => {
  it('resolves a RequestStaff for a valid staff payload', async () => {
    mockStaffRepo.findOne.mockResolvedValue({
      id: 'staff-1',
      fullName: 'Ada PingLoyal',
    });
    const strategy = await buildStrategy();
    const result = await strategy.validate({
      sub: 'staff-1',
      type: 'staff',
      iat: 0,
      exp: 0,
    });
    expect(result).toEqual({ staffId: 'staff-1', fullName: 'Ada PingLoyal' });
  });

  it('rejects a tenant-shaped payload (no type: "staff")', async () => {
    const strategy = await buildStrategy();
    await expect(
      strategy.validate({
        sub: 'user-1',
        type: 'tenant' as 'staff',
        iat: 0,
        exp: 0,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockStaffRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects when the staff account no longer exists', async () => {
    mockStaffRepo.findOne.mockResolvedValue(null);
    const strategy = await buildStrategy();
    await expect(
      strategy.validate({ sub: 'staff-1', type: 'staff', iat: 0, exp: 0 }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
