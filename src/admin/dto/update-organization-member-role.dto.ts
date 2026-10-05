import {
  IsIn,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

export class UpdateOrganizationMemberRoleDto {
  @ApiProperty({
    enum: [
      'CREATOR',
      'REVIEWER',
      'APPROVER',
    ],

    example:
      'REVIEWER',
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