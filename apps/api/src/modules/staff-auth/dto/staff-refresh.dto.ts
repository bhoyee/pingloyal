import { IsString } from 'class-validator';

export class StaffRefreshDto {
  @IsString()
  refreshToken: string;
}
