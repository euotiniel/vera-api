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
  MembershipsModule,
} from '../memberships/memberships.module.js';

import {
  StorageModule,
} from '../storage/storage.module.js';

import {
  TrustModule,
} from '../trust/trust.module.js';

import {
  DocumentIssuanceService,
} from './document-issuance.service.js';

import {
  DocumentManagementController,
} from './document-management.controller.js';

import {
  DocumentQrService,
} from './document-qr.service.js';

import {
  DocumentStatusService,
} from './document-status.service.js';

import {
  DocumentsController,
} from './documents.controller.js';

import {
  DocumentsService,
} from './documents.service.js';

import {
  PdfValidationService,
} from './pdf-validation.service.js';

@Module({
  imports: [
    JwtModule.register({}),

    AuthModule,

    MembershipsModule,

    TrustModule,

    StorageModule,
  ],

  controllers: [
    DocumentsController,

    DocumentManagementController,
  ],

  providers: [
    DocumentsService,

    DocumentIssuanceService,

    DocumentStatusService,

    DocumentQrService,

    PdfValidationService,
  ],

  exports: [
    DocumentsService,

    DocumentIssuanceService,

    DocumentStatusService,

    DocumentQrService,

    PdfValidationService,
  ],
})
export class DocumentsModule {}