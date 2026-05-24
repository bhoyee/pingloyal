import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterCustomerDto {
  /** Tenant slug from the QR code URL */
  @IsString()
  @IsNotEmpty()
  tenantSlug: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  /** Raw phone — will be normalised to E.164 by the service */
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  /** ISO 8601 date string (YYYY-MM-DD), optional */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string;

  /** Customer consents to receive WhatsApp messages */
  @IsBoolean()
  waOptedIn: boolean;
}
