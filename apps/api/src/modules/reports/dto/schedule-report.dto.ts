import { IsEmail, IsIn } from 'class-validator';

export class ScheduleReportDto {
  @IsEmail()
  email: string;

  @IsIn(['monthly'])
  frequency: 'monthly';
}
