import { Module } from '@nestjs/common';

import { SigningService } from './signing.service.js';
import { AttestationService } from './attestation.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { QrProofService } from './qr-proof.service.js';

@Module({
  providers: [
    SigningService,
    AttestationService,
    LifecycleService,
    QrProofService,
  ],

  exports: [
    SigningService,
    AttestationService,
    LifecycleService,
    QrProofService,
  ],
})
export class TrustModule {}