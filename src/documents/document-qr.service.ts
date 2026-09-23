import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service.js';

import { isValidPublicId } from '../trust/public-id.js';
import { QrProofService } from '../trust/qr-proof.service.js';

@Injectable()
export class DocumentQrService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly qrProofService:
      QrProofService,

    private readonly configService:
      ConfigService,
  ) {}

  async getProof(
    publicIdInput: string,
  ) {
    const publicId =
      publicIdInput
        .trim()
        .toUpperCase();

    if (
      !isValidPublicId(
        publicId,
      )
    ) {
      throw new BadRequestException(
        'O identificador Vera é inválido.',
      );
    }

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

              take:
                1,

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

    const version =
      document.versions[0];

    if (!version) {
      throw new ConflictException(
        'O documento não possui uma versão registada.',
      );
    }

    if (!version.qrProof) {
      throw new ConflictException(
        'Esta versão ainda não possui um QR Proof Vera.',
      );
    }

    if (!version.attestation) {
      throw new ConflictException(
        'A versão atual não possui uma atestação criptográfica.',
      );
    }

    /*
     * Mesmo para devolver um QR que já está
     * no banco, verificamos primeiro se ele
     * continua criptograficamente válido.
     */
    const verified =
      this.qrProofService
        .verify(
          version.qrProof,
        );

    if (
      !verified.valid ||
      !verified.payload
    ) {
      throw new ConflictException(
        'O QR Proof armazenado é inválido.',
      );
    }

    const attestationHash =
      this.qrProofService
        .calculateAttestationHash({
          payload:
            version.attestation
              .payload,

          signature:
            version.attestation
              .signature,

          algorithm:
            version.attestation
              .algorithm,

          keyId:
            version.attestation
              .keyId,
        });

    const claimsMatch =
      verified.payload
        .publicId ===
        document.publicId &&

      verified.payload
        .version ===
        version.version &&

      verified.payload
        .sha256 ===
        version.sha256 &&

      verified.payload
        .registeredAt ===
        version.createdAt
          .toISOString() &&

      verified.payload
        .attestationHash ===
        attestationHash;

    if (!claimsMatch) {
      throw new ConflictException(
        'O QR Proof armazenado não corresponde à versão atual.',
      );
    }

    const publicAppUrl =
      this.configService
        .get<string>(
          'VERA_PUBLIC_APP_URL',
        );

    if (!publicAppUrl) {
      throw new Error(
        'VERA_PUBLIC_APP_URL is not defined',
      );
    }

    const baseUrl =
      publicAppUrl.replace(
        /\/+$/,
        '',
      );

    const verificationUrl =
      `${baseUrl}/verify?proof=` +
      encodeURIComponent(
        version.qrProof,
      );

    return {
      publicId:
        document.publicId,

      version:
        version.version,

      proof:
        version.qrProof,

      verificationUrl,

      algorithm:
        'Ed25519',

      keyId:
        verified.keyId,

      schema:
        'vera.qr.v2',
    };
  }

  async getQrImage(
    publicId: string,
  ) {
    const proof =
      await this.getProof(
        publicId,
      );

    const image =
      await QRCode.toBuffer(
        proof.verificationUrl,
        {
          type:
            'png',

          width:
            512,

          margin:
            2,

          errorCorrectionLevel:
            'M',
        },
      );

    return {
      body:
        image,

      publicId:
        proof.publicId,

      verificationUrl:
        proof.verificationUrl,
    };
  }
}