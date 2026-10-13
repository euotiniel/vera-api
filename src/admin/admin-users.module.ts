import {
  Module,
} from '@nestjs/common';

import {
  JwtModule,
} from '@nestjs/jwt';

import {
  AuthModule,
} from '../auth/auth.module.js';

import {
  MembershipsModule,
} from '../memberships/memberships.module.js';

import {
  PrismaModule,
} from '../prisma/prisma.module.js';

import {
  UsersModule,
} from '../users/users.module.js';

import {
  AdminOrganizationMembersController,
} from './admin-organization-members.controller.js';

import {
  AdminOrganizationsController,
} from './admin-organizations.controller.js';

import {
  AdminOrganizationsService,
} from './admin-organizations.service.js';

import {
  AdminUsersController,
} from './admin-users.controller.js';

import {
  AdminVerificationAuditController,
} from './admin-verification-audit.controller.js';

import {
  AdminVerificationAuditService,
} from './admin-verification-audit.service.js';

@Module({
  imports: [
    JwtModule.register({}),

    PrismaModule,

    AuthModule,

    UsersModule,

    MembershipsModule,
  ],

  controllers: [
    AdminUsersController,

    AdminOrganizationMembersController,

    AdminOrganizationsController,

    AdminVerificationAuditController,
  ],

  providers: [
    AdminOrganizationsService,

    AdminVerificationAuditService,
  ],
})
export class AdminUsersModule {}