import { IsBoolean } from 'class-validator';

export class UpdateTriggerConfigDto {
  @IsBoolean()
  enabled: boolean;
}
