import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({ example: 'newaddress@freshmart.ng' })
  @IsEmail()
  newEmail: string;

  @ApiProperty({ example: 'CurrentPass123!' })
  @IsString()
  password: string;
}
