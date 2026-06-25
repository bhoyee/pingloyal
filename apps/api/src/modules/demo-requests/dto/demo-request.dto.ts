import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DemoRequestDto {
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(200, { message: 'Full name must be 200 characters or fewer' })
  fullName: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(200, { message: 'Company name must be 200 characters or fewer' })
  companyName: string;

  // Honeypot — see ContactDto for the full explanation. Invisible to real
  // visitors; a filled-in value means a bot submitted the form.
  @IsOptional()
  @IsString()
  website?: string;
}
