import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service.js';

import { SigningService } from '../trust/signing.service.js';
import { QrProofService } from '../trust/qr-proof.service.js';

async function main() {
  const publicId =
    process.argv[2]
      ?.trim()
      .toUpperCase();

  if (!publicId) {
    throw new Error(
      [
        'Uso:',
        'pnpm exec tsx',
        'src/scripts/create-mismatched-qr-proof.ts',
        '<PUBLIC_ID>',
      ].join(' '),
    );
  }

  const configService =
    new ConfigService();

  const prisma =
    new PrismaService(
      configService,
    );

  const signingService =
    new SigningService(
      configService,
    );

  const qrProofService =
    new QrProofService(
      signingService,
      configService,
    );

  try {
    const document =
      await prisma.document
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
      throw new Error(
        'Documento não encontrado.',
      );
    }

    const version =
      document.versions[0];

    if (!version) {
      throw new Error(
        'Versão não encontrada.',
      );
    }

    if (!version.attestation) {
      throw new Error(
        'Attestation não encontrada.',
      );
    }

    /*
     * Hash deliberadamente falso,
     * mas sintaticamente válido.
     *
     * A assinatura será REAL.
     */
    const fakeSha256 =
      version.sha256 ===
        '0'.repeat(64)
        ? '1'.repeat(64)
        : '0'.repeat(64);

    const proof =
      qrProofService.create({
        publicId:
          document.publicId,

        version:
          version.version,

        sha256:
          fakeSha256,

        registeredAt:
          version.createdAt
            .toISOString(),

        attestation: {
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
        },
      });

    console.log(
      JSON.stringify(
        {
          publicId:
            document.publicId,

          realSha256:
            version.sha256,

          fakeSha256,

          proof:
            proof.token,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma
      .$disconnect();
  }
}

main()
  .catch(
    (error: unknown) => {
      if (
        error instanceof
        Error
      ) {
        console.error(
          error.message,
        );
      } else {
        console.error(
          error,
        );
      }

      process.exitCode =
        1;
    },
  );