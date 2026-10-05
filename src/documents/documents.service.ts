import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import {
  createHash,
} from 'node:crypto';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  StorageService,
} from '../storage/storage.service.js';

import {
  AttestationService,
} from '../trust/attestation.service.js';

interface AttestationV2Payload {
  schema:
    'vera.attestation.v2';

  document: {
    publicId:
      string;

    title:
      string;

    type:
      string | null;

    reference:
      string | null;

    issuedAt:
      string | null;
  };

  issuer: {
    id:
      string;

    slug:
      string;

    name:
      string;
  };

  version: {
    number:
      number;

    filename:
      string;

    mimeType:
      string;

    size:
      number;

    sha256:
      string;

    registeredAt:
      string;
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly storageService:
      StorageService,

    private readonly attestationService:
      AttestationService,
  ) {}

  async findByPublicId(
    publicId:
      string,
  ) {
    const document =
      await this.prisma
        .document
        .findUnique({
          where: {
            publicId,
          },

          include: {
            organization:
              true,

            versions: {
              orderBy: {
                version:
                  'desc',
              },

              include: {
                attestation:
                  true,
              },
            },

            lifecycleEvents: {
              orderBy: {
                sequence:
                  'asc',
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
          document.versions
            .some(
              (
                version,
              ) =>
                Boolean(
                  version.storageKey,
                ),
            ),

        access:
          document
            .originalFileAccess,
      },

      organization: {
        name:
          document.organization
            .name,

        slug:
          document.organization
            .slug,

        verified:
          document.organization
            .verified,
      },

      versions:
        document.versions
          .map(
            (
              version,
            ) => ({
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

              qrAvailable:
                Boolean(
                  version.qrProof,
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
        document.lifecycleEvents
          .map(
            (
              event,
            ) => ({
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
                event
                  .previousEventHash,

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
    publicId:
      string,
  ) {
    const document =
      await this.prisma
        .document
        .findUnique({
          where: {
            publicId,
          },

          include: {
            versions: {
              orderBy: {
                version:
                  'desc',
              },

              include: {
                attestation:
                  true,
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
      document
        .originalFileAccess !==
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

    if (!version.attestation) {
      throw new InternalServerErrorException(
        'A atestação do documento não está disponível.',
      );
    }

    const signatureValid =
      this.attestationService
        .verify(
          version.attestation
            .payload,

          version.attestation
            .signature,

          version.attestation
            .algorithm,

          version.attestation
            .keyId,
        );

    if (!signatureValid) {
      throw new InternalServerErrorException(
        'A integridade criptográfica do documento não pôde ser confirmada.',
      );
    }

    let attestedSha256:
      string;

    try {
      const payload =
        JSON.parse(
          version.attestation
            .payload,
        ) as
          AttestationV2Payload;

      const claimsMatch =
        payload.schema ===
          'vera.attestation.v2' &&

        payload.document
          .publicId ===
          document.publicId &&

        payload.version
          .number ===
          version.version &&

        payload.version
          .filename ===
          version.filename &&

        payload.version
          .mimeType ===
          version.mimeType &&

        payload.version
          .size ===
          version.size &&

        payload.version
          .sha256 ===
          version.sha256 &&

        payload.version
          .registeredAt ===
          version.createdAt
            .toISOString();

      if (!claimsMatch) {
        throw new Error(
          'Attestation claims mismatch',
        );
      }

      attestedSha256 =
        payload.version
          .sha256;
    } catch {
      throw new InternalServerErrorException(
        'Os dados assinados do documento estão inconsistentes.',
      );
    }

    const storedFile =
      await this.storageService
        .getFile(
          version.storageKey,
        );

    const storedSha256 =
      createHash(
        'sha256',
      )
        .update(
          storedFile.body,
        )
        .digest(
          'hex',
        );

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