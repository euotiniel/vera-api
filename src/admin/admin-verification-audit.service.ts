import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

@Injectable()
export class AdminVerificationAuditService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async exportCsv() {
    const events =
      await this.prisma
        .verificationAuditEvent
        .findMany({
          orderBy: {
            createdAt:
              'asc',
          },

          select: {
            id:
              true,

            createdAt:
              true,

            method:
              true,

            policy:
              true,

            verdictCode:
              true,

            verified:
              true,

            publicId:
              true,

            documentId:
              true,

            hash:
              true,

            matched:
              true,
          },
        });

    const header = [
      'id',
      'createdAt',
      'method',
      'policy',
      'verdictCode',
      'verified',
      'publicId',
      'documentId',
      'hash',
      'matched',
    ];

    const rows =
      events.map(
        (
          event,
        ) => [
          event.id,

          event.createdAt
            .toISOString(),

          event.method,

          event.policy,

          event.verdictCode,

          event.verified,

          event.publicId,

          event.documentId,

          event.hash,

          event.matched,
        ],
      );

    const csv =
      [
        header,
        ...rows,
      ]
        .map(
          (
            row,
          ) =>
            row
              .map(
                (
                  value,
                ) =>
                  this.escapeCsvValue(
                    value,
                  ),
              )
              .join(','),
        )
        .join('\r\n');

    /*
     * BOM UTF-8 para facilitar a abertura
     * direta no Excel sem problemas com
     * caracteres portugueses.
     */
    const body =
      `\uFEFF${csv}\r\n`;

    return {
      filename:
        'vera-verification-audit.csv',

      contentType:
        'text/csv; charset=utf-8',

      body,

      count:
        events.length,
    };
  }

  private escapeCsvValue(
    value:
      | string
      | number
      | boolean
      | null
      | undefined,
  ): string {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return '""';
    }

    const normalized =
      String(
        value,
      )
        .replaceAll(
          '"',
          '""',
        );

    return `"${normalized}"`;
  }
}