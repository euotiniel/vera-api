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

export class ReviewSubmissionDto {
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
      'Referência documental incorreta.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}