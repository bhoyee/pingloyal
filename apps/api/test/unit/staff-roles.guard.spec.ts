import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { StaffRole } from '@pingloyal/types';
import { StaffRolesGuard } from '../../src/modules/staff-auth/guards/staff-roles.guard';

function makeContext(staffRole?: StaffRole): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: staffRole
          ? { staffId: 'staff-1', fullName: 'Ada', staffRole }
          : null,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('StaffRolesGuard', () => {
  let guard: StaffRolesGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    mockReflector = { getAllAndOverride: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffRolesGuard,
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get(StaffRolesGuard);
  });

  it('allows the request when no @StaffRoles() metadata is set', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(StaffRole.SUPPORT_AGENT))).toBe(true);
  });

  it('allows the request when the staff role matches', () => {
    mockReflector.getAllAndOverride.mockReturnValue([StaffRole.SUPER_ADMIN]);
    expect(guard.canActivate(makeContext(StaffRole.SUPER_ADMIN))).toBe(true);
  });

  it('throws ForbiddenException when the staff role does not match', () => {
    mockReflector.getAllAndOverride.mockReturnValue([StaffRole.SUPER_ADMIN]);
    expect(() =>
      guard.canActivate(makeContext(StaffRole.SUPPORT_AGENT)),
    ).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no staff on the request', () => {
    mockReflector.getAllAndOverride.mockReturnValue([StaffRole.SUPER_ADMIN]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
