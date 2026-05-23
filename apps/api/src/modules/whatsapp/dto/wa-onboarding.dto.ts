import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WaBusinessCategory } from '@pingloyal/types';

export class WaOnboardingDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  displayName: string;

  @IsEnum(WaBusinessCategory)
  category: WaBusinessCategory;

  @IsString()
  @MinLength(10)
  @MaxLength(256)
  description: string;

  @IsOptional()
  @IsUrl()
  website?: string;
}
