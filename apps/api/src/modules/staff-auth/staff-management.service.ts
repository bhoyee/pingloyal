import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Staff } from './entities/staff.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const BCRYPT_ROUNDS = 12;

export interface StaffAccountResponse {
  id: string;
  email: string;
  fullName: string;
  role: Staff['role'];
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class StaffManagementService {
  constructor(
    @InjectRepository(Staff) private readonly staffRepo: Repository<Staff>,
  ) {}

  async findAll(): Promise<StaffAccountResponse[]> {
    const staff = await this.staffRepo.find({ order: { createdAt: 'DESC' } });
    return staff.map((s) => this.toResponse(s));
  }

  async create(dto: CreateStaffDto): Promise<StaffAccountResponse> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.staffRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException(
        'A staff account with this email already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const staff = this.staffRepo.create({
      email,
      hashedPassword,
      fullName: dto.fullName.trim(),
      role: dto.role,
    });
    const saved = await this.staffRepo.save(staff);
    return this.toResponse(saved);
  }

  async update(
    id: string,
    dto: UpdateStaffDto,
    currentStaffId: string,
  ): Promise<StaffAccountResponse> {
    const staff = await this.staffRepo.findOne({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff account not found');
    }

    if (id === currentStaffId && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    if (dto.fullName !== undefined) staff.fullName = dto.fullName.trim();
    if (dto.role !== undefined) staff.role = dto.role;
    if (dto.isActive !== undefined) staff.isActive = dto.isActive;

    const saved = await this.staffRepo.save(staff);
    return this.toResponse(saved);
  }

  private toResponse(staff: Staff): StaffAccountResponse {
    return {
      id: staff.id,
      email: staff.email,
      fullName: staff.fullName,
      role: staff.role,
      isActive: staff.isActive,
      createdAt: staff.createdAt,
    };
  }
}
