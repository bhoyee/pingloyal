import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { SanitiseString } from '../../../common/decorators/sanitise-string.decorator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Adebayo Okafor' })
  @SanitiseString()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;
}
