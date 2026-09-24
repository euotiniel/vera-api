import {
  Module,
} from '@nestjs/common';

import {
  JwtModule,
} from '@nestjs/jwt';

import {
  PrismaModule,
} from '../prisma/prisma.module.js';

import {
  UsersModule,
} from '../users/users.module.js';

import {
  AccessTokenGuard,
} from './access-token.guard.js';

import {
  AuthController,
} from './auth.controller.js';

import {
  AuthService,
} from './auth.service.js';

import {
  SystemRoleGuard,
} from './system-role.guard.js';

@Module({
  imports: [
    PrismaModule,

    UsersModule,

    JwtModule.register({}),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,

    AccessTokenGuard,

    SystemRoleGuard,
  ],

  exports: [
    AuthService,

    AccessTokenGuard,

    SystemRoleGuard,
  ],
})
export class AuthModule {}