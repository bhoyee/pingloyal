import { IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  // Rich-text HTML — real emptiness is checked server-side after stripping
  // tags (an editor can produce "<p></p>" for an empty message).
  @IsString()
  @MaxLength(8000, { message: 'Message must be 8000 characters or fewer' })
  message: string;
}
