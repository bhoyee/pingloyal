import { IsIn } from 'class-validator';

export class ChangePlanDto {
  @IsIn(['starter', 'growth', 'connect'])
  planTier: string;
}
