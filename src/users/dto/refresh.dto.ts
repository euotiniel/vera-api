import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({
    example:
      'session-id.refresh-secret',

    description:
      'Refresh token emitido pela Vera.',

    writeOnly:
      true,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken!: string;
}