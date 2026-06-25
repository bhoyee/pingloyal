import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ContactDto {
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(200, { message: 'Name must be 200 characters or fewer' })
  name: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(3, { message: 'Subject must be at least 3 characters' })
  @MaxLength(200, { message: 'Subject must be 200 characters or fewer' })
  subject: string;

  @IsString()
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  @MaxLength(4000, { message: 'Message must be 4000 characters or fewer' })
  message: string;

  // Honeypot — invisible to real visitors, so any value here means a bot
  // filled out every field on the form. Validated as optional so genuine
  // empty submissions still pass; the service silently no-ops on a hit
  // instead of erroring, so bots get no signal to adapt to.
  @IsOptional()
  @IsString()
  website?: string;
}
