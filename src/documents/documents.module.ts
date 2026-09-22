import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { TrustModule } from '../trust/trust.module.js';

import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocumentStatusService } from './document-status.service.js';

@Module({
  imports: [
    TrustModule,
    StorageModule,
  ],

  controllers: [
    DocumentsController,
  ],

  providers: [
    DocumentsService,
    DocumentStatusService,
  ],

  exports: [
    DocumentsService,
    DocumentStatusService,
  ],
})
export class DocumentsModule {}