import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateWaTemplateDto {
  @IsString()
  @MinLength(10, { message: 'Message body must be at least 10 characters' })
  @MaxLength(1024, { message: 'Message body must be 1024 characters or fewer' })
  body: string;
}
