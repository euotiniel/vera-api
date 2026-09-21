import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AttestationService } from '../trust/attestation.service.js';
import { generatePublicId } from '../trust/public-id.js';

interface CreateDocumentInput {
  file: Express.Multer.File;
  organizationSlug: string;
  title: string;
  type?: string;
  reference?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attestationService: AttestationService,
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

    const sha256 = createHash('sha256')
      .update(file.buffer)
      .digest('hex');

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
    const registeredAt = new Date();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const document = await tx.document.create({
          data: {
            publicId,
            title: title.trim(),
            type: type?.trim() || null,
            reference: reference?.trim() || null,
            issuedAt: registeredAt,

            organization: {
              connect: {
                id: organization.id,
              },
            },
          },
        });

        const version =
          await tx.documentVersion.create({
            data: {
              version: 1,
              filename: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              sha256,
              createdAt: registeredAt,

              document: {
                connect: {
                  id: document.id,
                },
              },
            },
          });

        const signedAttestation =
          this.attestationService.create({
            documentPublicId: document.publicId,
            organization: organization.slug,
            version: version.version,
            sha256: version.sha256,
            registeredAt:
              version.createdAt.toISOString(),
          });

        const attestation =
          await tx.attestation.create({
            data: {
              documentVersionId: version.id,
              payload: signedAttestation.payload,
              signature:
                signedAttestation.signature,
              algorithm:
                signedAttestation.algorithm,
              keyId: signedAttestation.keyId,
            },
          });

        return {
          document,
          version,
          attestation,
        };
      },
    );

    return {
      id: result.document.id,
      publicId: result.document.publicId,
      title: result.document.title,
      type: result.document.type,
      reference: result.document.reference,
      status: result.document.status,
      issuedAt: result.document.issuedAt,

      organization: {
        name: organization.name,
        slug: organization.slug,
        verified: organization.verified,
      },

      version: {
        version: result.version.version,
        filename: result.version.filename,
        mimeType: result.version.mimeType,
        size: result.version.size,
        sha256: result.version.sha256,
        registeredAt: result.version.createdAt,
      },

      attestation: {
        algorithm: result.attestation.algorithm,
        keyId: result.attestation.keyId,
        signature: result.attestation.signature,
        createdAt: result.attestation.createdAt,
      },
    };
  }

  async findByPublicId(publicId: string) {
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
        },
      });

    if (!document) {
      throw new NotFoundException(
        'Documento não encontrado.',
      );
    }

    return {
      publicId: document.publicId,
      title: document.title,
      type: document.type,
      reference: document.reference,
      status: document.status,
      issuedAt: document.issuedAt,
      registeredAt: document.createdAt,

      organization: {
        name: document.organization.name,
        slug: document.organization.slug,
        verified: document.organization.verified,
      },

      versions: document.versions.map((version) => ({
        version: version.version,
        filename: version.filename,
        mimeType: version.mimeType,
        size: version.size,
        registeredAt: version.createdAt,

        attestation: version.attestation
          ? {
              algorithm:
                version.attestation.algorithm,
              keyId: version.attestation.keyId,
              signature:
                version.attestation.signature,
              createdAt:
                version.attestation.createdAt,
            }
          : null,
      })),
    };
  }
}