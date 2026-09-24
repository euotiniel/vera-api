import {
  IsEmail,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'otoniel@example.com',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'uma-palavra-passe-segura',
    writeOnly: true,
  })
  @IsString()
  @MaxLength(128)
  password!: string;
}
