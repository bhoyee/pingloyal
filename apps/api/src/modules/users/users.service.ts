import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '@pingloyal/types';
import { User } from '../auth/entities/user.entity';
import { CreateCashierDto } from './dto/create-cashier.dto';
import { UpdateCashierDto } from './dto/update-cashier.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async listCashiers(tenantId: string) {
    const users = await this.userRepo.find({
      where: { tenantId, role: UserRole.CASHIER },
      order: { createdAt: 'ASC' },
    });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  async createCashier(tenantId: string, dto: CreateCashierDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('A user with that email already exists');
    }
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      tenantId,
      email: dto.email.toLowerCase(),
      fullName: dto.fullName,
      hashedPassword,
      role: UserRole.CASHIER,
      isActive: true,
    });
    const saved = await this.userRepo.save(user);
    return {
      id: saved.id,
      fullName: saved.fullName,
      email: saved.email,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      lastLoginAt: saved.lastLoginAt,
    };
  }

  async updateCashier(tenantId: string, userId: string, dto: UpdateCashierDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId, role: UserRole.CASHIER },
    });
    if (!user) throw new NotFoundException('Cashier not found');

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.email !== undefined) {
      const conflict = await this.userRepo.findOne({
        where: { email: dto.email.toLowerCase() },
      });
      if (conflict && conflict.id !== userId) {
        throw new BadRequestException('That email is already in use');
      }
      user.email = dto.email.toLowerCase();
    }
    const saved = await this.userRepo.save(user);
    return {
      id: saved.id,
      fullName: saved.fullName,
      email: saved.email,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      lastLoginAt: saved.lastLoginAt,
    };
  }

  async deleteCashier(tenantId: string, userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId, role: UserRole.CASHIER },
    });
    if (!user) throw new NotFoundException('Cashier not found');
    await this.userRepo.remove(user);
  }
}
