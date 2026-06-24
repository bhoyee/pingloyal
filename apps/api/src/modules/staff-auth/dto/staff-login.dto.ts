import { IsEmail, IsString } from 'class-validator';

export class StaffLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
