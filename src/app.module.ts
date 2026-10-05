import {
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
} from '@nestjs/config';

import {
  AdminUsersModule,
} from './admin/admin-users.module.js';

import {
  AppController,
} from './app.controller.js';

import {
  AuthModule,
} from './auth/auth.module.js';

import {
  DocumentsModule,
} from './documents/documents.module.js';

import {
  PrismaModule,
} from './prisma/prisma.module.js';

import {
  StorageModule,
} from './storage/storage.module.js';

import {
  SubmissionsModule,
} from './submissions/submissions.module.js';

import {
  VerificationsModule,
} from './verifications/verifications.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:
        true,
    }),

    PrismaModule,

    StorageModule,

    AuthModule,

    AdminUsersModule,

    DocumentsModule,

    SubmissionsModule,

    VerificationsModule,
  ],

  controllers: [
    AppController,
  ],
})
export class AppModule {}