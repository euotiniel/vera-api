import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    example:
      'João Manuel',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example:
      'joao@organizacao.ao',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example:
      'Password-Segura-2026',

    minLength:
      12,

    writeOnly:
      true,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}