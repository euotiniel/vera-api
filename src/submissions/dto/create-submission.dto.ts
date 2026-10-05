import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateSubmissionDto {
  @ApiProperty({
    example:
      'Pedido de parceria',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional({
    example:
      'Ofício',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;

  @ApiPropertyOptional({
    example:
      '0054/2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reference?: string;

  @ApiPropertyOptional({
    example:
      '2026-10-05T09:00:00.000Z',

    description:
      'Data de emissão indicada pelo emissor. Se omitida, permanece null nesta fase.',
  })
  @IsOptional()
  @IsISO8601()
  issuedAt?: string;

  @ApiPropertyOptional({
    enum: [
      'PUBLIC',
      'RESTRICTED',
      'PRIVATE',
    ],

    default:
      'PUBLIC',
  })
  @IsOptional()
  @IsIn([
    'PUBLIC',
    'RESTRICTED',
    'PRIVATE',
  ])
  originalFileAccess?:
    | 'PUBLIC'
    | 'RESTRICTED'
    | 'PRIVATE';
}