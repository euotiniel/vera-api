import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateOrganizationVerificationStatusDto {
  @ApiProperty({
    enum: [
      'VERIFIED',
      'SUSPENDED',
      'REVOKED',
    ],

    description:
      'Novo estado de confiança do emissor.',
  })
  @IsString()
  @IsIn([
    'VERIFIED',
    'SUSPENDED',
    'REVOKED',
  ])
  status!:
    | 'VERIFIED'
    | 'SUSPENDED'
    | 'REVOKED';

  @ApiPropertyOptional({
    description:
      'Justificação administrativa da alteração.',
    maxLength:
      500,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?:
    string;
}