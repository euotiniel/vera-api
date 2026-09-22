import { Module } from '@nestjs/common';
import { AttestationService } from './attestation.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { SigningService } from './signing.service.js';

@Module({
  providers: [
    SigningService,
    AttestationService,
    LifecycleService,
  ],
  exports: [
    SigningService,
    AttestationService,
    LifecycleService,
  ],
})
export class TrustModule {}