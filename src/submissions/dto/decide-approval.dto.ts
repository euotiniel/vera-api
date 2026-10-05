import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class DecideApprovalDto {
  @ApiProperty({
    enum: [
      'APPROVED',
      'REJECTED',
    ],

    example:
      'APPROVED',
  })
  @IsIn([
    'APPROVED',
    'REJECTED',
  ])
  decision!:
    | 'APPROVED'
    | 'REJECTED';

  @ApiPropertyOptional({
    example:
      'O documento precisa ser corrigido antes da emissão.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}