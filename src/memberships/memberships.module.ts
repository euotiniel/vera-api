import {
  Module,
} from '@nestjs/common';

import {
  PrismaModule,
} from '../prisma/prisma.module.js';

import {
  MembershipsService,
} from './memberships.service.js';

@Module({
  imports: [
    PrismaModule,
  ],

  providers: [
    MembershipsService,
  ],

  exports: [
    MembershipsService,
  ],
})
export class MembershipsModule {}