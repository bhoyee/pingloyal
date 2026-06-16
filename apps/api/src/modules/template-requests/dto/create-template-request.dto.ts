import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTemplateRequestDto {
  @IsString()
  @MinLength(3, { message: 'Template name must be at least 3 characters' })
  @MaxLength(200, { message: 'Template name must be 200 characters or fewer' })
  name: string;

  @IsString()
  @MinLength(10, { message: 'Use case must be at least 10 characters' })
  @MaxLength(2000, { message: 'Use case must be 2000 characters or fewer' })
  useCase: string;
}
