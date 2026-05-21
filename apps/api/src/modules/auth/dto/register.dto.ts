import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum Country {
  NG = 'NG',
  UK = 'UK',
}

export class RegisterDto {
  @ApiProperty({ example: 'FreshMart Lagos' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName: string;

  @ApiProperty({ example: 'Adebayo Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: 'adebayo@freshmart.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: Country, example: 'NG' })
  @IsEnum(Country)
  country: Country;
}
