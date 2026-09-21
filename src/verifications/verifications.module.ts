import { Module } from '@nestjs/common';
import { TrustModule } from '../trust/trust.module.js';
import { VerificationsController } from './verifications.controller.js';
import { VerificationsService } from './verifications.service.js';

@Module({
  imports: [TrustModule],
  controllers: [VerificationsController],
  providers: [VerificationsService],
})
export class VerificationsModule {}