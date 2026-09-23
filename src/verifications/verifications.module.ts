import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { TrustModule } from '../trust/trust.module.js';

import { VerificationsController } from './verifications.controller.js';

import { VerificationsService } from './verifications.service.js';

import { VerificationPolicyService } from './verification-policy.service.js';

import { QrVerificationService } from './qr-verification.service.js';

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
    QrVerificationService,
  ],

  exports: [
    VerificationsService,
    VerificationPolicyService,
    QrVerificationService,
  ],
})
export class VerificationsModule {}