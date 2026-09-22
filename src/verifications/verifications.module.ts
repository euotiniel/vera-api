import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { TrustModule } from '../trust/trust.module.js';

import { VerificationsController } from './verifications.controller.js';
import { VerificationsService } from './verifications.service.js';
import { VerificationPolicyService } from './verification-policy.service.js';

@Module({
  imports: [
    TrustModule,
    StorageModule,
  ],

  controllers: [
    VerificationsController,
  ],

  providers: [
    VerificationsService,
    VerificationPolicyService,
  ],

  exports: [
    VerificationsService,
    VerificationPolicyService,
  ],
})
export class VerificationsModule {}