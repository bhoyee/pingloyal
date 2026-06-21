import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PlanTier } from '@pingloyal/types';

export class SignupStartTrialDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.STARTER })
  @IsEnum(PlanTier)
  planTier: PlanTier;
}
