import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { StaffRole } from '@pingloyal/types';

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  fullName: string;

  @IsEnum(StaffRole)
  role: StaffRole;
}
