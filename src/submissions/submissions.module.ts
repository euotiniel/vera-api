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
  DocumentsModule,
} from '../documents/documents.module.js';

import {
  MembershipsModule,
} from '../memberships/memberships.module.js';

import {
  PrismaModule,
} from '../prisma/prisma.module.js';

import {
  StorageModule,
} from '../storage/storage.module.js';

import {
  SubmissionsController,
} from './submissions.controller.js';

import {
  SubmissionsService,
} from './submissions.service.js';

@Module({
  imports: [
    JwtModule.register({}),

    PrismaModule,

    StorageModule,

    AuthModule,

    MembershipsModule,

    DocumentsModule,
  ],

  controllers: [
    SubmissionsController,
  ],

  providers: [
    SubmissionsService,
  ],

  exports: [
    SubmissionsService,
  ],
})
export class SubmissionsModule {}