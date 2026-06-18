import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../../src/modules/users/users.service';
import { User } from '../../src/modules/auth/entities/user.entity';
import { UserRole } from '@pingloyal/types';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    tenantId: TENANT_ID,
    email: 'cashier@store.com',
    fullName: 'Test Cashier',
    hashedPassword: 'hashed',
    role: UserRole.CASHIER,
    isActive: true,
    emailVerifiedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    lastLoginAt: null,
    ...overrides,
  } as User;
}

const mockUserRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};

async function buildService() {
  const mod = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: getRepositoryToken(User), useValue: mockUserRepo },
    ],
  }).compile();
  return mod.get(UsersService);
}

beforeEach(() => jest.clearAllMocks());

describe('UsersService', () => {
  describe('listCashiers', () => {
    it('returns mapped cashier objects', async () => {
      const user = makeUser();
      mockUserRepo.find.mockResolvedValue([user]);
      const svc = await buildService();
      const result = await svc.listCashiers(TENANT_ID);
      expect(result).toEqual([
        {
          id: USER_ID,
          fullName: 'Test Cashier',
          email: 'cashier@store.com',
          isActive: true,
          createdAt: user.createdAt,
          lastLoginAt: null,
        },
      ]);
      expect(mockUserRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, role: UserRole.CASHIER },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('createCashier', () => {
    it('creates and returns a new cashier', async () => {
      const user = makeUser();
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.create.mockReturnValue(user);
      mockUserRepo.save.mockResolvedValue(user);
      const svc = await buildService();
      const dto = { email: 'cashier@store.com', fullName: 'Test Cashier', password: 'pass123' };
      const result = await svc.createCashier(TENANT_ID, dto);
      expect(result.email).toBe('cashier@store.com');
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('throws BadRequestException if email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const svc = await buildService();
      await expect(
        svc.createCashier(TENANT_ID, { email: 'cashier@store.com', fullName: 'X', password: 'p' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCashier', () => {
    it('updates and returns the cashier', async () => {
      const user = makeUser();
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockResolvedValue({ ...user, fullName: 'Updated Name' });
      const svc = await buildService();
      const result = await svc.updateCashier(TENANT_ID, USER_ID, { fullName: 'Updated Name' });
      expect(result.fullName).toBe('Updated Name');
    });

    it('throws NotFoundException if cashier not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(
        svc.updateCashier(TENANT_ID, USER_ID, { fullName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when email conflicts with another user', async () => {
      const user = makeUser();
      const conflicting = makeUser({ id: 'other-user', email: 'taken@store.com' });
      mockUserRepo.findOne
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(conflicting);
      const svc = await buildService();
      await expect(
        svc.updateCashier(TENANT_ID, USER_ID, { email: 'taken@store.com' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates isActive field', async () => {
      const user = makeUser({ isActive: true });
      const updated = makeUser({ isActive: false });
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.save.mockResolvedValue(updated);
      const svc = await buildService();
      const result = await svc.updateCashier(TENANT_ID, USER_ID, { isActive: false });
      expect(result.isActive).toBe(false);
    });
  });

  describe('deleteCashier', () => {
    it('removes the cashier', async () => {
      const user = makeUser();
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.remove.mockResolvedValue(undefined);
      const svc = await buildService();
      await expect(svc.deleteCashier(TENANT_ID, USER_ID)).resolves.toBeUndefined();
      expect(mockUserRepo.remove).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException if cashier not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(svc.deleteCashier(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
