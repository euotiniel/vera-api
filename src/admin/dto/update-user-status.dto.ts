import {
  IsIn,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: [
      'ACTIVE',
      'SUSPENDED',
    ],

    example:
      'SUSPENDED',
  })
  @IsIn([
    'ACTIVE',
    'SUSPENDED',
  ])
  status!:
    | 'ACTIVE'
    | 'SUSPENDED';
}