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
  AdminUsersController,
} from './admin-users.controller.js';

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
  ],
})
export class AdminUsersModule {}