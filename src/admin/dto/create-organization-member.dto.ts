import {
  IsIn,
  IsString,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class CreateOrganizationMemberDto {
  @ApiProperty({
    description:
      'ID do utilizador já provisionado na Vera.',
  })
  @IsString()
  @MinLength(1)
  userId!: string;

  @ApiProperty({
    enum: [
      'CREATOR',
      'REVIEWER',
      'APPROVER',
    ],

    example:
      'CREATOR',
  })
  @IsIn([
    'CREATOR',
    'REVIEWER',
    'APPROVER',
  ])
  role!:
    | 'CREATOR'
    | 'REVIEWER'
    | 'APPROVER';
}