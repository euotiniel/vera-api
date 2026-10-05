import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import {
  createHash,
} from 'node:crypto';

import type {
  Prisma,
} from '../generated/prisma/client.js';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  StorageService,
} from '../storage/storage.service.js';

import {
  AttestationService,
} from '../trust/attestation.service.js';

import {
  LifecycleService,
} from '../trust/lifecycle.service.js';

import {
  QrProofService,
} from '../trust/qr-proof.service.js';

import {
  generatePublicId,
} from '../trust/public-id.js';

import {
  PdfValidationService,
} from './pdf-validation.service.js';

type OriginalFileAccessValue =
  | 'PUBLIC'
  | 'RESTRICTED'
  | 'PRIVATE';

interface OrganizationSnapshot {
  id:
    string;

  slug:
    string;

  name:
    string;
}

interface PrepareInitialDocumentInput {
  sourceStorageKey:
    string;

  expectedSha256:
    string;

  expectedSize:
    number;
}

interface PreparedInitialDocument {
  publicId:
    string;

  versionNumber:
    number;

  registeredAt:
    Date;

  storageKey:
    string;

  mimeType:
    'application/pdf';

  size:
    number;

  sha256:
    string;
}

interface CreateInitialDocumentInput {
  prepared:
    PreparedInitialDocument;

  organization:
    OrganizationSnapshot;

  title:
    string;

  type:
    string | null;

  reference:
    string | null;

  issuedAt:
    Date | null;

  originalFileAccess:
    OriginalFileAccessValue;

  filename:
    string;
}

@Injectable()
export class DocumentIssuanceService {
  private readonly logger =
    new Logger(
      DocumentIssuanceService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly storageService:
      StorageService,

    private readonly pdfValidationService:
      PdfValidationService,

    private readonly attestationService:
      AttestationService,

    private readonly lifecycleService:
      LifecycleService,

    private readonly qrProofService:
      QrProofService,
  ) {}

  async prepareInitialDocument(
    input:
      PrepareInitialDocumentInput,
  ): Promise<PreparedInitialDocument> {
    const sourceFile =
      await this.storageService
        .getFile(
          input.sourceStorageKey,
        );

    const sourceSha256 =
      createHash(
        'sha256',
      )
        .update(
          sourceFile.body,
        )
        .digest(
          'hex',
        );

    if (
      sourceSha256 !==
        input.expectedSha256 ||
      sourceFile.body.length !==
        input.expectedSize
    ) {
      throw new InternalServerErrorException(
        'O ficheiro armazenado da submissão não corresponde ao original admitido.',
      );
    }

    const validatedPdf =
      await this.pdfValidationService
        .validate(
          sourceFile.body,
        );

    if (
      validatedPdf.size !==
        input.expectedSize
    ) {
      throw new InternalServerErrorException(
        'O tamanho validado do documento não corresponde ao ficheiro submetido.',
      );
    }

    const existingVersion =
      await this.prisma
        .documentVersion
        .findUnique({
          where: {
            sha256:
              input.expectedSha256,
          },

          select: {
            id:
              true,
          },
        });

    if (existingVersion) {
      throw new ConflictException(
        'Estes bytes já estão registados como documento oficial na Vera.',
      );
    }

    const publicId =
      generatePublicId();

    const versionNumber =
      1;

    const registeredAt =
      new Date();

    const storageKey =
      this.storageService
        .buildDocumentKey(
          publicId,
          versionNumber,
        );

    await this.storageService
      .putFile({
        key:
          storageKey,

        body:
          sourceFile.body,

        contentType:
          validatedPdf.mimeType,
      });

    try {
      const officialFile =
        await this.storageService
          .getFile(
            storageKey,
          );

      const officialSha256 =
        createHash(
          'sha256',
        )
          .update(
            officialFile.body,
          )
          .digest(
            'hex',
          );

      if (
        officialSha256 !==
          input.expectedSha256 ||
        officialFile.body.length !==
          input.expectedSize
      ) {
        throw new InternalServerErrorException(
          'A integridade da cópia oficial do documento não pôde ser confirmada.',
        );
      }

      return {
        publicId,

        versionNumber,

        registeredAt,

        storageKey,

        mimeType:
          validatedPdf.mimeType,

        size:
          validatedPdf.size,

        sha256:
          input.expectedSha256,
      };
    } catch (
      error:
        unknown
    ) {
      await this.cleanupPreparedInitialDocument(
        storageKey,
      );

      throw error;
    }
  }

  async createInitialDocument(
    tx:
      Prisma.TransactionClient,

    input:
      CreateInitialDocumentInput,
  ) {
    const existingVersion =
      await tx.documentVersion
        .findUnique({
          where: {
            sha256:
              input.prepared
                .sha256,
          },

          select: {
            id:
              true,
          },
        });

    if (existingVersion) {
      throw new ConflictException(
        'Estes bytes já estão registados como documento oficial na Vera.',
      );
    }

    const issuedAt =
      input.issuedAt ??
      input.prepared
        .registeredAt;

    const document =
      await tx.document
        .create({
          data: {
            publicId:
              input.prepared
                .publicId,

            title:
              input.title,

            type:
              input.type,

            reference:
              input.reference,

            status:
              'VALID',

            issuedAt,

            originalFileAccess:
              input.originalFileAccess,

            organization: {
              connect: {
                id:
                  input.organization
                    .id,
              },
            },

            createdAt:
              input.prepared
                .registeredAt,
          },
        });

    const version =
      await tx.documentVersion
        .create({
          data: {
            version:
              input.prepared
                .versionNumber,

            filename:
              input.filename,

            mimeType:
              input.prepared
                .mimeType,

            size:
              input.prepared
                .size,

            sha256:
              input.prepared
                .sha256,

            storageKey:
              input.prepared
                .storageKey,

            qrProof:
              null,

            createdAt:
              input.prepared
                .registeredAt,

            document: {
              connect: {
                id:
                  document.id,
              },
            },
          },
        });

    const signedAttestation =
      this.attestationService
        .create({
          documentPublicId:
            document.publicId,

          organizationId:
            input.organization.id,

          organizationSlug:
            input.organization.slug,

          organizationName:
            input.organization.name,

          title:
            document.title,

          type:
            document.type,

          reference:
            document.reference,

          issuedAt:
            document.issuedAt
              ?.toISOString() ??
            null,

          version:
            version.version,

          filename:
            version.filename,

          mimeType:
            version.mimeType,

          size:
            version.size,

          sha256:
            version.sha256,

          registeredAt:
            version.createdAt
              .toISOString(),
        });

    const attestation =
      await tx.attestation
        .create({
          data: {
            documentVersionId:
              version.id,

            payload:
              signedAttestation
                .payload,

            signature:
              signedAttestation
                .signature,

            algorithm:
              signedAttestation
                .algorithm,

            keyId:
              signedAttestation
                .keyId,

            createdAt:
              input.prepared
                .registeredAt,
          },
        });

    const signedQrProof =
      this.qrProofService
        .create({
          publicId:
            document.publicId,

          version:
            version.version,

          sha256:
            version.sha256,

          registeredAt:
            version.createdAt
              .toISOString(),

          attestation: {
            payload:
              attestation.payload,

            signature:
              attestation.signature,

            algorithm:
              attestation.algorithm,

            keyId:
              attestation.keyId,
          },
        });

    const versionWithQr =
      await tx.documentVersion
        .update({
          where: {
            id:
              version.id,
          },

          data: {
            qrProof:
              signedQrProof
                .token,
          },
        });

    const signedLifecycle =
      this.lifecycleService
        .createRegisteredEvent({
          documentPublicId:
            document.publicId,

          toStatus:
            document.status,

          occurredAt:
            input.prepared
              .registeredAt
              .toISOString(),
        });

    const lifecycleEvent =
      await tx
        .documentLifecycleEvent
        .create({
          data: {
            documentId:
              document.id,

            sequence:
              signedLifecycle
                .sequence,

            type:
              signedLifecycle
                .type,

            fromStatus:
              signedLifecycle
                .fromStatus,

            toStatus:
              signedLifecycle
                .toStatus,

            reason:
              signedLifecycle
                .reason,

            previousEventHash:
              signedLifecycle
                .previousEventHash,

            payload:
              signedLifecycle
                .payload,

            signature:
              signedLifecycle
                .signature,

            algorithm:
              signedLifecycle
                .algorithm,

            keyId:
              signedLifecycle
                .keyId,

            eventHash:
              signedLifecycle
                .eventHash,

            createdAt:
              input.prepared
                .registeredAt,
          },
        });

    return {
      registeredAt:
        input.prepared
          .registeredAt,

      document,

      version:
        versionWithQr,

      attestation,

      lifecycleEvent,

      qrProof:
        signedQrProof,
    };
  }

  async cleanupPreparedInitialDocument(
    storageKey:
      string,
  ): Promise<void> {
    try {
      await this.storageService
        .deleteFile(
          storageKey,
        );
    } catch (
      cleanupError:
        unknown
    ) {
      this.logger.error(
        `Falha ao remover cópia oficial órfã: ${storageKey}`,
        cleanupError,
      );
    }
  }
}