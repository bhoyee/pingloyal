import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PlanTier } from '@pingloyal/types';
import { Country } from '../../signup/dto/signup-register.dto';

export class StaffCreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName: string;

  @IsEnum(Country)
  country: Country;

  @IsEnum(PlanTier)
  planTier: PlanTier;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  ownerFullName: string;
}
