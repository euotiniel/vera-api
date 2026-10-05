import {
  Module,
} from '@nestjs/common';

import {
  PrismaModule,
} from '../prisma/prisma.module.js';

import {
  MembershipsService,
} from './memberships.service.js';

import {
  OrganizationRoleGuard,
} from './organization-role.guard.js';

@Module({
  imports: [
    PrismaModule,
  ],

  providers: [
    MembershipsService,

    OrganizationRoleGuard,
  ],

  exports: [
    MembershipsService,

    OrganizationRoleGuard,
  ],
})
export class MembershipsModule {}