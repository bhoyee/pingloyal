import { IsString, MinLength } from 'class-validator';

export class ResetCashierPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}
