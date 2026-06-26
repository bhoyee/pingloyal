import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole } from '@pingloyal/types';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed-pw') }));

import { StaffManagementService } from '../../src/modules/staff-auth/staff-management.service';
import { Staff } from '../../src/modules/staff-auth/entities/staff.entity';

const STAFF_ID = 'staff-1';

function makeStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: STAFF_ID,
    email: 'ada@pingloyal.com',
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
  find: jest.fn(),
  create: jest.fn((data: Partial<Staff>) => data as Staff),
  save: jest.fn((data: Staff) => Promise.resolve(data)),
};

async function buildService() {
  const mod = await Test.createTestingModule({
    providers: [
      StaffManagementService,
      { provide: getRepositoryToken(Staff), useValue: mockStaffRepo },
    ],
  }).compile();
  return mod.get(StaffManagementService);
}

beforeEach(() => jest.clearAllMocks());

describe('StaffManagementService', () => {
  describe('findAll', () => {
    it('returns all staff accounts without exposing hashedPassword', async () => {
      mockStaffRepo.find.mockResolvedValue([makeStaff()]);
      const svc = await buildService();
      const result = await svc.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: STAFF_ID,
        email: 'ada@pingloyal.com',
        fullName: 'Ada PingLoyal',
        role: StaffRole.SUPER_ADMIN,
        isActive: true,
      });
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0]).not.toHaveProperty('hashedPassword');
    });
  });

  describe('create', () => {
    it('creates a staff account with a bcrypt-hashed password', async () => {
      mockStaffRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();

      const result = await svc.create({
        email: 'New@PingLoyal.com',
        password: 'supersecret1',
        fullName: 'New Hire',
        role: StaffRole.SUPPORT_AGENT,
      });

      expect(mockStaffRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@pingloyal.com',
          hashedPassword: 'hashed-pw',
          fullName: 'New Hire',
          role: StaffRole.SUPPORT_AGENT,
        }),
      );
      expect(result.email).toBe('new@pingloyal.com');
    });

    it('rejects a duplicate email with ConflictException', async () => {
      mockStaffRepo.findOne.mockResolvedValue(makeStaff());
      const svc = await buildService();

      await expect(
        svc.create({
          email: 'ada@pingloyal.com',
          password: 'supersecret1',
          fullName: 'Duplicate',
          role: StaffRole.SUPPORT_AGENT,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates fullName/role/isActive', async () => {
      mockStaffRepo.findOne.mockResolvedValue(makeStaff());
      const svc = await buildService();

      const result = await svc.update(
        STAFF_ID,
        {
          fullName: 'Updated Name',
          role: StaffRole.SUPPORT_AGENT,
          isActive: false,
        },
        'some-other-staff-id',
      );

      expect(result.fullName).toBe('Updated Name');
      expect(result.role).toBe(StaffRole.SUPPORT_AGENT);
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException when the staff account does not exist', async () => {
      mockStaffRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();

      await expect(
        svc.update(STAFF_ID, { fullName: 'X' }, 'some-other-staff-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks a staff member from deactivating their own account', async () => {
      mockStaffRepo.findOne.mockResolvedValue(makeStaff());
      const svc = await buildService();

      await expect(
        svc.update(STAFF_ID, { isActive: false }, STAFF_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
