import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StaffAuthService } from '../../src/modules/staff-auth/staff-auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
import * as bcrypt from 'bcrypt';
import { Staff } from '../../src/modules/staff-auth/entities/staff.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { StaffRole } from '@pingloyal/types';

const STAFF_ID = 'staff-1';

function makeStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: STAFF_ID,
    email: 'support@pingloyal.com',
    hashedPassword: 'hashed-pw',
    fullName: 'Ada PingLoyal',
    role: StaffRole.SUPER_ADMIN,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

const mockStaffRepo = {
  findOne: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, fallback?: string) => {
    if (key === 'JWT_EXPIRES_IN') return '15m';
    if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
    return fallback;
  }),
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    if (key === 'JWT_PRIVATE_KEY')
      return Buffer.from('priv').toString('base64');
    if (key === 'JWT_PUBLIC_KEY') return Buffer.from('pub').toString('base64');
    return 'test-value';
  }),
};

async function buildService() {
  const mod = await Test.createTestingModule({
    providers: [
      StaffAuthService,
      { provide: getRepositoryToken(Staff), useValue: mockStaffRepo },
      { provide: REDIS_CLIENT, useValue: mockRedis },
      { provide: JwtService, useValue: mockJwtService },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  return mod.get(StaffAuthService);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJwtService.sign.mockReturnValue('signed-token');
});

describe('StaffAuthService', () => {
  describe('login', () => {
    it('returns tokens + staff profile on valid credentials', async () => {
      const staff = makeStaff();
      mockStaffRepo.findOne.mockResolvedValue(staff);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const svc = await buildService();
      const result = await svc.login({
        email: 'support@pingloyal.com',
        password: 'correct-password',
      });

      expect(result.staff).toEqual({
        id: staff.id,
        email: staff.email,
        fullName: staff.fullName,
        role: staff.role,
      });
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:staff:${staff.id}`,
        expect.any(Number),
        expect.any(String),
      );
    });

    it('rejects when no staff matches the email', async () => {
      mockStaffRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(
        svc.login({ email: 'nobody@pingloyal.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects on wrong password', async () => {
      mockStaffRepo.findOne.mockResolvedValue(makeStaff());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const svc = await buildService();
      await expect(
        svc.login({ email: 'support@pingloyal.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lowercases and trims the email before lookup', async () => {
      mockStaffRepo.findOne.mockResolvedValue(makeStaff());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const svc = await buildService();
      await svc.login({ email: '  Support@PingLoyal.com  ', password: 'x' });
      expect(mockStaffRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'support@pingloyal.com' },
      });
    });
  });

  describe('refresh', () => {
    it('issues new tokens when the stored hash matches', async () => {
      mockJwtService.verify.mockReturnValue({ sub: STAFF_ID, type: 'staff' });
      const incomingHash = crypto
        .createHash('sha256')
        .update('old-refresh-token')
        .digest('hex');
      mockRedis.get.mockResolvedValue(incomingHash);
      mockStaffRepo.findOne.mockResolvedValue(makeStaff());

      const svc = await buildService();
      const result = await svc.refresh({ refreshToken: 'old-refresh-token' });

      expect(result.accessToken).toBe('signed-token');
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:staff:${STAFF_ID}`);
    });

    it('rejects an unparseable/expired token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const svc = await buildService();
      await expect(svc.refresh({ refreshToken: 'garbage' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when no session is stored in redis', async () => {
      mockJwtService.verify.mockReturnValue({ sub: STAFF_ID, type: 'staff' });
      mockRedis.get.mockResolvedValue(null);
      const svc = await buildService();
      await expect(svc.refresh({ refreshToken: 'some-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects and clears the session when the stored hash does not match (reuse)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: STAFF_ID, type: 'staff' });
      mockRedis.get.mockResolvedValue('a-different-hash');
      const svc = await buildService();
      await expect(svc.refresh({ refreshToken: 'some-token' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:staff:${STAFF_ID}`);
    });

    it('rejects when the staff account no longer exists', async () => {
      mockJwtService.verify.mockReturnValue({ sub: STAFF_ID, type: 'staff' });
      const incomingHash = crypto
        .createHash('sha256')
        .update('old-refresh-token')
        .digest('hex');
      mockRedis.get.mockResolvedValue(incomingHash);
      mockStaffRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(
        svc.refresh({ refreshToken: 'old-refresh-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears the redis session and returns a confirmation message', async () => {
      const svc = await buildService();
      const result = await svc.logout(STAFF_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:staff:${STAFF_ID}`);
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
