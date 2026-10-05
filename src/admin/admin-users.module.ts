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
  PrismaModule,
} from '../prisma/prisma.module.js';

import {
  UsersModule,
} from '../users/users.module.js';

import {
  AdminUsersController,
} from './admin-users.controller.js';

@Module({
  imports: [
    JwtModule.register({}),

    PrismaModule,

    AuthModule,

    UsersModule,
  ],

  controllers: [
    AdminUsersController,
  ],
})
export class AdminUsersModule {}