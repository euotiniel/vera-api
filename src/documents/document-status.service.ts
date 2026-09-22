import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import {
  type DocumentStatusValue,
  type LifecycleEventInput,
  LifecycleService,
} from '../trust/lifecycle.service.js';

interface TransitionDocumentStatusInput {
  publicId: string;

  toStatus:
    DocumentStatusValue;

  reason: string;
}

@Injectable()
export class DocumentStatusService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly lifecycleService:
      LifecycleService,
  ) {}

  private readonly allowedTransitions:
    Record<
      DocumentStatusValue,
      readonly DocumentStatusValue[]
    > = {
      PENDING: [
        'VALID',
        'REVOKED',
      ],

      VALID: [
        'REVOKED',
        'EXPIRED',
      ],

      REVOKED: [],

      REPLACED: [],

      EXPIRED: [],
    };

  async transition(
    input:
      TransitionDocumentStatusInput,
  ) {
    const publicId =
      input.publicId
        .trim()
        .toUpperCase();

    const toStatus =
      input.toStatus;

    const reason =
      input.reason.trim();

    if (!reason) {
      throw new BadRequestException(
        'O motivo da alteração de estado é obrigatório.',
      );
    }

    if (
      toStatus ===
      'REPLACED'
    ) {
      throw new BadRequestException(
        'REPLACED só poderá ser utilizado quando existir um documento substituto explicitamente associado.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const document =
          await tx.document
            .findUnique({
              where: {
                publicId,
              },

              include: {
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

        const lifecycle =
          this.lifecycleService
            .evaluateChain(
              document.publicId,

              document.status as
                DocumentStatusValue,

              document.lifecycleEvents as
                LifecycleEventInput[],
            );

        if (!lifecycle.valid) {
          throw new ConflictException(
            'A cadeia de lifecycle existente é inválida. A alteração de estado foi recusada.',
          );
        }

        if (
          !lifecycle
            .databaseStatusMatches
        ) {
          throw new ConflictException(
            'O estado materializado do documento não corresponde ao lifecycle assinado.',
          );
        }

        const currentStatus =
          lifecycle.derivedStatus;

        if (!currentStatus) {
          throw new ConflictException(
            'Não foi possível determinar o estado atual do documento.',
          );
        }

        if (
          currentStatus ===
          toStatus
        ) {
          throw new BadRequestException(
            `O documento já se encontra no estado ${toStatus}.`,
          );
        }

        const allowed =
          this.allowedTransitions[
            currentStatus
          ];

        if (
          !allowed.includes(
            toStatus,
          )
        ) {
          throw new BadRequestException(
            `Transição inválida: ${currentStatus} → ${toStatus}.`,
          );
        }

        const lastEvent =
          document.lifecycleEvents[
            document.lifecycleEvents
              .length - 1
          ];

        if (!lastEvent) {
          throw new ConflictException(
            'O documento não possui evento inicial de lifecycle.',
          );
        }

        const occurredAt =
          new Date();

        const signedEvent =
          this.lifecycleService
            .createStatusChangedEvent({
              documentPublicId:
                document.publicId,

              sequence:
                lastEvent.sequence +
                1,

              fromStatus:
                currentStatus,

              toStatus,

              reason,

              previousEventHash:
                lastEvent.eventHash,

              occurredAt:
                occurredAt
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
                  signedEvent.sequence,

                type:
                  signedEvent.type,

                fromStatus:
                  signedEvent.fromStatus,

                toStatus:
                  signedEvent.toStatus,

                reason:
                  signedEvent.reason,

                previousEventHash:
                  signedEvent
                    .previousEventHash,

                payload:
                  signedEvent.payload,

                signature:
                  signedEvent.signature,

                algorithm:
                  signedEvent.algorithm,

                keyId:
                  signedEvent.keyId,

                eventHash:
                  signedEvent.eventHash,

                createdAt:
                  occurredAt,
              },
            });

        const updatedDocument =
          await tx.document.update({
            where: {
              id:
                document.id,
            },

            data: {
              status:
                toStatus,
            },
          });

        return {
          publicId:
            updatedDocument
              .publicId,

          previousStatus:
            currentStatus,

          status:
            updatedDocument.status,

          reason,

          lifecycle: {
            sequence:
              lifecycleEvent
                .sequence,

            type:
              lifecycleEvent.type,

            fromStatus:
              lifecycleEvent
                .fromStatus,

            toStatus:
              lifecycleEvent
                .toStatus,

            reason:
              lifecycleEvent.reason,

            previousEventHash:
              lifecycleEvent
                .previousEventHash,

            eventHash:
              lifecycleEvent
                .eventHash,

            algorithm:
              lifecycleEvent
                .algorithm,

            keyId:
              lifecycleEvent.keyId,

            createdAt:
              lifecycleEvent
                .createdAt,
          },
        };
      },
    );
  }
}