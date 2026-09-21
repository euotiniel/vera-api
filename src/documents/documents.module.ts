import { Module } from '@nestjs/common';
import { TrustModule } from '../trust/trust.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [TrustModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}