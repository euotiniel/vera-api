import {
  ApiProperty,
} from '@nestjs/swagger';

import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReplaceDocumentDto {
  @ApiProperty({
    description:
      'Public ID Vera do documento sucessor.',

    example:
      'VRA-GHFA-D1CA-HNCA-3Z6V-11',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  replacementPublicId!:
    string;

  @ApiProperty({
    description:
      'Motivo institucional da substituição.',

    example:
      'Documento substituído por uma nova emissão oficial corrigida.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!:
    string;
}