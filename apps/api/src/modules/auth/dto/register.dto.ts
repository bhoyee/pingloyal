import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PlanTier } from '@pingloyal/types';
import { SanitiseString } from '../../../common/decorators/sanitise-string.decorator';

export enum Country {
  NG = 'NG',
  UK = 'UK',
}

export class RegisterDto {
  @ApiProperty({ example: 'FreshMart Lagos' })
  @SanitiseString()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName: string;

  @ApiProperty({ example: 'Adebayo Okafor' })
  @SanitiseString()
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

  @ApiProperty({ enum: PlanTier, example: PlanTier.STARTER, required: false })
  @IsOptional()
  @IsEnum(PlanTier)
  planTier?: PlanTier;
}
