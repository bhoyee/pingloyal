import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'adebayo@freshmart.ng' })
  @IsEmail()
  email: string;
}
