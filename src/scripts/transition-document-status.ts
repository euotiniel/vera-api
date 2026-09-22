import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service.js';

import { SigningService } from '../trust/signing.service.js';

import {
  type DocumentStatusValue,
  LifecycleService,
} from '../trust/lifecycle.service.js';

import { DocumentStatusService } from '../documents/document-status.service.js';

const VALID_STATUSES:
  DocumentStatusValue[] = [
    'PENDING',
    'VALID',
    'REVOKED',
    'REPLACED',
    'EXPIRED',
  ];

async function main() {
  const [
    publicId,
    rawStatus,
    ...reasonParts
  ] =
    process.argv.slice(2);

  if (
    !publicId ||
    !rawStatus
  ) {
    throw new Error(
      [
        'Uso:',
        'pnpm exec tsx',
        'src/scripts/transition-document-status.ts',
        '<PUBLIC_ID>',
        '<STATUS>',
        '"<MOTIVO>"',
      ].join(' '),
    );
  }

  const toStatus =
    rawStatus
      .trim()
      .toUpperCase() as
      DocumentStatusValue;

  if (
    !VALID_STATUSES.includes(
      toStatus,
    )
  ) {
    throw new Error(
      `Estado inválido: ${rawStatus}`,
    );
  }

  const reason =
    reasonParts
      .join(' ')
      .trim();

  if (!reason) {
    throw new Error(
      'O motivo é obrigatório.',
    );
  }

  const configService =
    new ConfigService();

  const prismaService =
    new PrismaService(
      configService,
    );

  const signingService =
    new SigningService(
      configService,
    );

  const lifecycleService =
    new LifecycleService(
      signingService,
    );

  const documentStatusService =
    new DocumentStatusService(
      prismaService,
      lifecycleService,
    );

  try {
    const result =
      await documentStatusService
        .transition({
          publicId,

          toStatus,

          reason,
        });

    console.log(
      JSON.stringify(
        result,
        null,
        2,
      ),
    );
  } finally {
    await prismaService
      .$disconnect();
  }
}

main()
  .catch(
    (error: unknown) => {
      if (
        error instanceof Error
      ) {
        console.error(
          error.message,
        );
      } else {
        console.error(
          error,
        );
      }

      process.exitCode = 1;
    },
  );