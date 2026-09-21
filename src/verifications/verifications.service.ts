import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AttestationService } from '../trust/attestation.service.js';

interface AttestationPayload {
  schema: string;
  documentPublicId: string;
  organization: string;
  version: number;
  sha256: string;
  registeredAt: string;
}

@Injectable()
export class VerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attestationService: AttestationService,
  ) {}

  async verifyFile(file: Express.Multer.File) {
    const sha256 = createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    const version =
      await this.prisma.documentVersion.findUnique({
        where: {
          sha256,
        },

        include: {
          attestation: true,

          document: {
            include: {
              organization: true,
            },
          },
        },
      });

    if (!version) {
      await this.prisma.verificationEvent.create({
        data: {
          hash: sha256,
          matched: false,
        },
      });

      return {
        match: false,
        exactMatch: false,
        sha256,

        message:
          'Não foi encontrada uma correspondência exata para este ficheiro.',
      };
    }

    const document = version.document;
    const attestation = version.attestation;

    let signatureValid = false;
    let claimsMatch = false;

    if (attestation) {
      signatureValid =
        attestation.algorithm === 'Ed25519' &&
        this.attestationService.verify(
          attestation.payload,
          attestation.signature,
        );

      try {
        const payload = JSON.parse(
          attestation.payload,
        ) as AttestationPayload;

        claimsMatch =
          payload.schema === 'vera.attestation.v1' &&
          payload.documentPublicId ===
            document.publicId &&
          payload.organization ===
            document.organization.slug &&
          payload.version === version.version &&
          payload.sha256 === version.sha256 &&
          payload.sha256 === sha256 &&
          payload.registeredAt ===
            version.createdAt.toISOString();
      } catch {
        claimsMatch = false;
      }
    }

    const attestationValid =
      signatureValid && claimsMatch;

    await this.prisma.verificationEvent.create({
      data: {
        hash: sha256,
        matched: true,
        documentId: document.id,
      },
    });

    return {
      match: true,
      exactMatch: true,

      trust: {
        attestationValid,
        signatureValid,
        claimsMatch,
      },

      sha256,

      document: {
        id: document.id,
        publicId: document.publicId,
        title: document.title,
        type: document.type,
        reference: document.reference,
        status: document.status,
        issuedAt: document.issuedAt,

        organization: {
          name: document.organization.name,
          slug: document.organization.slug,
          verified:
            document.organization.verified,
        },

        version: {
          version: version.version,
          filename: version.filename,
          mimeType: version.mimeType,
          size: version.size,
          registeredAt: version.createdAt,
        },

        attestation: attestation
          ? {
              valid: attestationValid,
              signatureValid,
              claimsMatch,
              algorithm: attestation.algorithm,
              keyId: attestation.keyId,
              createdAt: attestation.createdAt,
            }
          : null,
      },
    };
  }
}