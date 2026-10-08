import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  createHash,
  randomUUID,
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
  id: string;
  slug: string;
  name: string;
}

interface PrepareSourceFileInput {
  sourceStorageKey:
    string;

  expectedSha256:
    string;

  expectedSize:
    number;
}

interface ValidatedSourceFile {
  body:
    Buffer;

  mimeType:
    'application/pdf';

  size:
    number;

  sha256:
    string;
}

interface PreparedOfficialFile {
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

interface PrepareInitialDocumentInput
  extends PrepareSourceFileInput {}

interface PrepareNewVersionInput
  extends PrepareSourceFileInput {
  documentPublicId:
    string;

  baseVersion:
    number;
}

interface CreateInitialDocumentInput {
  prepared:
    PreparedOfficialFile;

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

interface CreateNewVersionInput {
  prepared:
    PreparedOfficialFile;

  documentId:
    string;

  organization:
    OrganizationSnapshot;

  expectedBaseVersion:
    number;

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

  /*
   * ============================================================
   * PREPARE INITIAL DOCUMENT
   * ============================================================
   */

  async prepareInitialDocument(
    input:
      PrepareInitialDocumentInput,
  ): Promise<PreparedOfficialFile> {
    const source =
      await this.validateSourceFile(
        input,
      );

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

    await this.persistOfficialFile({
      storageKey,

      source,
    });

    return {
      publicId,

      versionNumber,

      registeredAt,

      storageKey,

      mimeType:
        source.mimeType,

      size:
        source.size,

      sha256:
        source.sha256,
    };
  }

  /*
   * ============================================================
   * PREPARE NEW VERSION
   * ============================================================
   */

  async prepareNewVersion(
    input:
      PrepareNewVersionInput,
  ): Promise<PreparedOfficialFile> {
    if (
      !Number.isSafeInteger(
        input.baseVersion,
      ) ||
      input.baseVersion < 1
    ) {
      throw new InternalServerErrorException(
        'A versão-base da submissão é inválida.',
      );
    }

    const source =
      await this.validateSourceFile(
        input,
      );

    const versionNumber =
      input.baseVersion +
      1;

    const registeredAt =
      new Date();

    /*
     * Cada preparação recebe um objecto
     * fisicamente único.
     *
     * Se duas submissões baseadas na mesma
     * versão forem aprovadas ao mesmo tempo,
     * nunca sobrescrevem os bytes uma da outra.
     *
     * O PostgreSQL decidirá qual delas pode
     * materializar (documentId, version).
     */
    const storageKey =
      this.storageService
        .buildDocumentVersionKey(
          input.documentPublicId,
          versionNumber,
          randomUUID(),
        );

    await this.persistOfficialFile({
      storageKey,

      source,
    });

    return {
      publicId:
        input.documentPublicId,

      versionNumber,

      registeredAt,

      storageKey,

      mimeType:
        source.mimeType,

      size:
        source.size,

      sha256:
        source.sha256,
    };
  }

  /*
   * ============================================================
   * CREATE INITIAL DOCUMENT
   * ============================================================
   */

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

  /*
   * ============================================================
   * CREATE NEW VERSION
   * ============================================================
   */

  async createNewVersion(
    tx:
      Prisma.TransactionClient,

    input:
      CreateNewVersionInput,
  ) {
    if (
      !Number.isSafeInteger(
        input.expectedBaseVersion,
      ) ||
      input.expectedBaseVersion < 1
    ) {
      throw new InternalServerErrorException(
        'A versão-base da submissão é inválida.',
      );
    }

    const document =
      await tx.document
        .findFirst({
          where: {
            id:
              input.documentId,

            organizationId:
              input.organization.id,
          },

          select: {
            id:
              true,

            publicId:
              true,

            title:
              true,

            type:
              true,

            reference:
              true,

            status:
              true,

            issuedAt:
              true,

            originalFileAccess:
              true,

            organizationId:
              true,

            versions: {
              orderBy: {
                version:
                  'desc',
              },

              take:
                1,

              select: {
                version:
                  true,
              },
            },
          },
        });

    if (!document) {
      throw new NotFoundException(
        'Documento alvo não encontrado.',
      );
    }

    if (
      document.status !==
      'VALID'
    ) {
      throw new ConflictException(
        'Apenas documentos atualmente válidos podem receber uma nova versão.',
      );
    }

    const latestVersion =
      document.versions[0];

    if (!latestVersion) {
      throw new ConflictException(
        'O documento alvo não possui uma versão oficial válida.',
      );
    }

    if (
      latestVersion.version !==
      input.expectedBaseVersion
    ) {
      throw new ConflictException(
        'O documento já recebeu uma versão posterior à utilizada por esta submissão.',
      );
    }

    const expectedVersion =
      input.expectedBaseVersion +
      1;

    if (
      input.prepared.publicId !==
        document.publicId ||
      input.prepared.versionNumber !==
        expectedVersion
    ) {
      throw new InternalServerErrorException(
        'A versão preparada não corresponde ao estado atual do documento.',
      );
    }

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

    return {
      registeredAt:
        input.prepared
          .registeredAt,

      document,

      version:
        versionWithQr,

      attestation,

      qrProof:
        signedQrProof,
    };
  }

  /*
   * ============================================================
   * SOURCE VALIDATION
   * ============================================================
   */

  private async validateSourceFile(
    input:
      PrepareSourceFileInput,
  ): Promise<ValidatedSourceFile> {
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

    return {
      body:
        sourceFile.body,

      mimeType:
        validatedPdf.mimeType,

      size:
        validatedPdf.size,

      sha256:
        input.expectedSha256,
    };
  }

  /*
   * ============================================================
   * OFFICIAL STORAGE
   * ============================================================
   */

  private async persistOfficialFile(
    input: {
      storageKey:
        string;

      source:
        ValidatedSourceFile;
    },
  ): Promise<void> {
    await this.storageService
      .putFile({
        key:
          input.storageKey,

        body:
          input.source.body,

        contentType:
          input.source.mimeType,
      });

    try {
      const officialFile =
        await this.storageService
          .getFile(
            input.storageKey,
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
          input.source.sha256 ||
        officialFile.body.length !==
          input.source.size
      ) {
        throw new InternalServerErrorException(
          'A integridade da cópia oficial do documento não pôde ser confirmada.',
        );
      }
    } catch (
      error:
        unknown
    ) {
      await this.cleanupPreparedDocument(
        input.storageKey,
      );

      throw error;
    }
  }

  /*
   * ============================================================
   * CLEANUP
   * ============================================================
   */

  async cleanupPreparedDocument(
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

  /**
   * Compatibilidade com o fluxo atual.
   *
   * O SubmissionApprovalService existente
   * ainda chama este nome até ao próximo
   * bloco da implementação.
   */
  async cleanupPreparedInitialDocument(
    storageKey:
      string,
  ): Promise<void> {
    await this.cleanupPreparedDocument(
      storageKey,
    );
  }
}