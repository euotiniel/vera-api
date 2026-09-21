import { Module } from '@nestjs/common';
import { AttestationService } from './attestation.service.js';

@Module({
  providers: [AttestationService],
  exports: [AttestationService],
})
export class TrustModule {}
