import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example:
      'Otoniel Emanuel',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example:
      'otoniel@example.com',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example:
      'uma-palavra-passe-segura',

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