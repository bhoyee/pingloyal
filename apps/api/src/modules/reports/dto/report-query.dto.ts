import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsIn([
    'this_month',
    'last_month',
    'last_3_months',
    'last_6_months',
    'custom',
  ])
  @IsOptional()
  period:
    | 'this_month'
    | 'last_month'
    | 'last_3_months'
    | 'last_6_months'
    | 'custom' = 'this_month';

  @IsString()
  @IsOptional()
  start?: string;

  @IsString()
  @IsOptional()
  end?: string;
}
