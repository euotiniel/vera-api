import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { AttestationService } from '../trust/attestation.service.js';
import { LifecycleService } from '../trust/lifecycle.service.js';
import { generatePublicId } from '../trust/public-id.js';

interface CreateDocumentInput {
  file: Express.Multer.File;
  organizationSlug: string;
  title: string;
  type?: string;
  reference?: string;
}

interface AttestationV2Payload {
  schema: 'vera.attestation.v2';

  document: {
    publicId: string;
    title: string;
    type: string | null;
    reference: string | null;
    issuedAt: string | null;
  };

  issuer: {
    id: string;
    slug: string;
    name: string;
  };

  version: {
    number: number;
    filename: string;
    mimeType: string;
    size: number;
    sha256: string;
    registeredAt: string;
  };
}

@Injectable()
export class DocumentsService {
  private readonly logger =
    new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly attestationService: AttestationService,
    private readonly lifecycleService: LifecycleService,
  ) {}

  async create(input: CreateDocumentInput) {
    const {
      file,
      organizationSlug,
      title,
      type,
      reference,
    } = input;

    const organization =
      await this.prisma.organization.findUnique({
        where: {
          slug: organizationSlug,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organização não encontrada.',
      );
    }

    if (!organization.verified) {
      throw new ConflictException(
        'Esta organização ainda não está verificada.',
      );
    }

    /*
     * Fingerprint do ficheiro recebido.
     */
    const sha256 = createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    /*
     * O mesmo conjunto exato de bytes
     * não pode ser registado duas vezes.
     */
    const existingVersion =
      await this.prisma.documentVersion.findUnique({
        where: {
          sha256,
        },
      });

    if (existingVersion) {
      throw new ConflictException(
        'Este ficheiro já está registado na Vera.',
      );
    }

    const publicId = generatePublicId();

    const versionNumber = 1;

    const registeredAt = new Date();

    /*
     * O caminho físico do objecto não é público.
     *
     * O utilizador nunca precisa conhecer
     * este storageKey.
     */
    const storageKey =
      this.storageService.buildDocumentKey(
        publicId,
        versionNumber,
      );

    /*
     * Primeiro guardamos o ficheiro.
     */
    await this.storageService.putFile({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype,
    });

    try {
      /*
       * Não confiamos cegamente nem no próprio
       * object storage.
       *
       * Lemos o objecto de volta e verificamos
       * se os bytes guardados produzem o mesmo
       * SHA-256.
       */
      const storedFile =
        await this.storageService.getFile(
          storageKey,
        );

      const storedSha256 =
        createHash('sha256')
          .update(storedFile.body)
          .digest('hex');

      if (
        storedSha256 !== sha256 ||
        storedFile.body.length !== file.size
      ) {
        throw new InternalServerErrorException(
          'A integridade do ficheiro armazenado não pôde ser confirmada.',
        );
      }

      /*
       * Só depois de comprovarmos o storage
       * criamos o registo definitivo.
       */
      const result =
        await this.prisma.$transaction(
          async (tx) => {
            const document =
              await tx.document.create({
                data: {
                  publicId,

                  title:
                    title.trim(),

                  type:
                    type?.trim() || null,

                  reference:
                    reference?.trim() || null,

                  status: 'VALID',

                  issuedAt:
                    registeredAt,

                  /*
                   * Para os nossos ofícios de
                   * laboratório o original pode
                   * ser apresentado publicamente.
                   */
                  originalFileAccess:
                    'PUBLIC',

                  organization: {
                    connect: {
                      id:
                        organization.id,
                    },
                  },

                  createdAt:
                    registeredAt,
                },
              });

            const version =
              await tx.documentVersion.create({
                data: {
                  version:
                    versionNumber,

                  filename:
                    file.originalname,

                  mimeType:
                    file.mimetype,

                  size:
                    file.size,

                  sha256,

                  storageKey,

                  createdAt:
                    registeredAt,

                  document: {
                    connect: {
                      id:
                        document.id,
                    },
                  },
                },
              });

            /*
             * Attestation v2:
             * snapshot criptograficamente assinado
             * dos dados essenciais do documento
             * e da versão.
             */
            const signedAttestation =
              this.attestationService.create({
                documentPublicId:
                  document.publicId,

                organizationId:
                  organization.id,

                organizationSlug:
                  organization.slug,

                organizationName:
                  organization.name,

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
              await tx.attestation.create({
                data: {
                  documentVersionId:
                    version.id,

                  payload:
                    signedAttestation.payload,

                  signature:
                    signedAttestation.signature,

                  algorithm:
                    signedAttestation.algorithm,

                  keyId:
                    signedAttestation.keyId,

                  createdAt:
                    registeredAt,
                },
              });

            /*
             * Primeiro evento da cadeia
             * de lifecycle.
             */
            const signedLifecycle =
              this.lifecycleService
                .createRegisteredEvent({
                  documentPublicId:
                    document.publicId,

                  toStatus:
                    document.status,

                  occurredAt:
                    registeredAt
                      .toISOString(),
                });

            const lifecycleEvent =
              await tx.documentLifecycleEvent
                .create({
                  data: {
                    documentId:
                      document.id,

                    sequence:
                      signedLifecycle.sequence,

                    type:
                      signedLifecycle.type,

                    fromStatus:
                      signedLifecycle.fromStatus,

                    toStatus:
                      signedLifecycle.toStatus,

                    reason:
                      signedLifecycle.reason,

                    previousEventHash:
                      signedLifecycle
                        .previousEventHash,

                    payload:
                      signedLifecycle.payload,

                    signature:
                      signedLifecycle.signature,

                    algorithm:
                      signedLifecycle.algorithm,

                    keyId:
                      signedLifecycle.keyId,

                    eventHash:
                      signedLifecycle.eventHash,

                    createdAt:
                      registeredAt,
                  },
                });

            return {
              document,
              version,
              attestation,
              lifecycleEvent,
            };
          },
        );

      return {
        id:
          result.document.id,

        publicId:
          result.document.publicId,

        title:
          result.document.title,

        type:
          result.document.type,

        reference:
          result.document.reference,

        status:
          result.document.status,

        issuedAt:
          result.document.issuedAt,

        organization: {
          name:
            organization.name,

          slug:
            organization.slug,

          verified:
            organization.verified,
        },

        originalFile: {
          available: true,

          access:
            result.document
              .originalFileAccess,
        },

        version: {
          version:
            result.version.version,

          filename:
            result.version.filename,

          mimeType:
            result.version.mimeType,

          size:
            result.version.size,

          sha256:
            result.version.sha256,

          registeredAt:
            result.version.createdAt,
        },

        attestation: {
          schema:
            'vera.attestation.v2',

          algorithm:
            result.attestation.algorithm,

          keyId:
            result.attestation.keyId,

          signature:
            result.attestation.signature,

          createdAt:
            result.attestation.createdAt,
        },

        lifecycle: {
          sequence:
            result.lifecycleEvent.sequence,

          type:
            result.lifecycleEvent.type,

          fromStatus:
            result.lifecycleEvent
              .fromStatus,

          toStatus:
            result.lifecycleEvent.toStatus,

          previousEventHash:
            result.lifecycleEvent
              .previousEventHash,

          eventHash:
            result.lifecycleEvent.eventHash,

          algorithm:
            result.lifecycleEvent.algorithm,

          keyId:
            result.lifecycleEvent.keyId,

          createdAt:
            result.lifecycleEvent.createdAt,
        },
      };
    } catch (error) {
      /*
       * Compensating transaction.
       *
       * Object storage e PostgreSQL não
       * participam da mesma transação ACID.
       *
       * Se qualquer etapa posterior falhar,
       * removemos o objecto que já tínhamos
       * criado.
       */
      try {
        await this.storageService.deleteFile(
          storageKey,
        );
      } catch (cleanupError) {
        this.logger.error(
          `Falha ao remover objecto órfão: ${storageKey}`,
          cleanupError,
        );
      }

      throw error;
    }
  }

  async findByPublicId(
    publicId: string,
  ) {
    const document =
      await this.prisma.document.findUnique({
        where: {
          publicId,
        },

        include: {
          organization: true,

          versions: {
            orderBy: {
              version: 'desc',
            },

            include: {
              attestation: true,
            },
          },

          lifecycleEvents: {
            orderBy: {
              sequence: 'asc',
            },
          },
        },
      });

    if (!document) {
      throw new NotFoundException(
        'Documento não encontrado.',
      );
    }

    return {
      publicId:
        document.publicId,

      title:
        document.title,

      type:
        document.type,

      reference:
        document.reference,

      status:
        document.status,

      issuedAt:
        document.issuedAt,

      registeredAt:
        document.createdAt,

      originalFile: {
        available:
          document.versions.some(
            (version) =>
              Boolean(
                version.storageKey,
              ),
          ),

        access:
          document.originalFileAccess,
      },

      organization: {
        name:
          document.organization.name,

        slug:
          document.organization.slug,

        verified:
          document.organization.verified,
      },

      versions:
        document.versions.map(
          (version) => ({
            version:
              version.version,

            filename:
              version.filename,

            mimeType:
              version.mimeType,

            size:
              version.size,

            registeredAt:
              version.createdAt,

            originalAvailable:
              Boolean(
                version.storageKey,
              ),

            attestation:
              version.attestation
                ? {
                    algorithm:
                      version
                        .attestation
                        .algorithm,

                    keyId:
                      version
                        .attestation
                        .keyId,

                    signature:
                      version
                        .attestation
                        .signature,

                    createdAt:
                      version
                        .attestation
                        .createdAt,
                  }
                : null,
          }),
        ),

      lifecycle:
        document.lifecycleEvents.map(
          (event) => ({
            sequence:
              event.sequence,

            type:
              event.type,

            fromStatus:
              event.fromStatus,

            toStatus:
              event.toStatus,

            reason:
              event.reason,

            previousEventHash:
              event.previousEventHash,

            eventHash:
              event.eventHash,

            algorithm:
              event.algorithm,

            keyId:
              event.keyId,

            createdAt:
              event.createdAt,
          }),
        ),
    };
  }

  async getOriginalFile(
    publicId: string,
  ) {
    const document =
      await this.prisma.document.findUnique({
        where: {
          publicId,
        },

        include: {
          versions: {
            orderBy: {
              version: 'desc',
            },

            include: {
              attestation: true,
            },
          },
        },
      });

    if (!document) {
      throw new NotFoundException(
        'Documento não encontrado.',
      );
    }

    if (
      document.originalFileAccess !==
      'PUBLIC'
    ) {
      throw new ForbiddenException(
        'O documento original não está disponível publicamente.',
      );
    }

    const version =
      document.versions[0];

    if (
      !version ||
      !version.storageKey
    ) {
      throw new NotFoundException(
        'O ficheiro original deste documento não está disponível.',
      );
    }

    /*
     * Antes de devolvermos qualquer byte,
     * validamos a Attestation.
     */
    if (!version.attestation) {
      throw new InternalServerErrorException(
        'A atestação do documento não está disponível.',
      );
    }

    const signatureValid =
      this.attestationService.verify(
        version.attestation.payload,
        version.attestation.signature,
        version.attestation.algorithm,
        version.attestation.keyId,
      );

    if (!signatureValid) {
      throw new InternalServerErrorException(
        'A integridade criptográfica do documento não pôde ser confirmada.',
      );
    }

    let attestedSha256: string;

    try {
      const payload =
        JSON.parse(
          version.attestation.payload,
        ) as AttestationV2Payload;

      const claimsMatch =
        payload.schema ===
          'vera.attestation.v2' &&

        payload.document.publicId ===
          document.publicId &&

        payload.version.number ===
          version.version &&

        payload.version.filename ===
          version.filename &&

        payload.version.mimeType ===
          version.mimeType &&

        payload.version.size ===
          version.size &&

        payload.version.sha256 ===
          version.sha256 &&

        payload.version.registeredAt ===
          version.createdAt
            .toISOString();

      if (!claimsMatch) {
        throw new Error(
          'Attestation claims mismatch',
        );
      }

      attestedSha256 =
        payload.version.sha256;
    } catch {
      throw new InternalServerErrorException(
        'Os dados assinados do documento estão inconsistentes.',
      );
    }

    /*
     * Recupera o original do storage.
     */
    const storedFile =
      await this.storageService.getFile(
        version.storageKey,
      );

    /*
     * E recalcula o SHA-256 no momento
     * da leitura.
     *
     * Portanto nem adulterar o objecto
     * diretamente no storage é suficiente.
     */
    const storedSha256 =
      createHash('sha256')
        .update(storedFile.body)
        .digest('hex');

    if (
      storedSha256 !==
        version.sha256 ||
      storedSha256 !==
        attestedSha256 ||
      storedFile.body.length !==
        version.size
    ) {
      throw new InternalServerErrorException(
        'O ficheiro armazenado não corresponde à versão criptograficamente atestada.',
      );
    }

    return {
      body:
        storedFile.body,

      contentType:
        version.mimeType,

      filename:
        version.filename,

      sha256:
        storedSha256,
    };
  }
}