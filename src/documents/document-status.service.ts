import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  type DocumentStatusValue,
  type LifecycleEventInput,
  LifecycleService,
} from '../trust/lifecycle.service.js';

interface TransitionDocumentStatusInput {
  publicId:
    string;

  toStatus:
    DocumentStatusValue;

  reason:
    string;
}

interface ReplaceDocumentInput {
  organizationId:
    string;

  publicId:
    string;

  replacementPublicId:
    string;

  reason:
    string;
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

      REVOKED:
        [],

      REPLACED:
        [],

      EXPIRED:
        [],
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
      input.reason
        .trim();

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
        'Use a operação de substituição documental para definir REPLACED.',
      );
    }

    return this.prisma
      .$transaction(
        async (
          tx,
        ) => {
          const document =
            await tx.document
              .findUnique({
                where: {
                  publicId,
                },

                include: {
                  replacedBy: {
                    select: {
                      publicId:
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

          const lifecycle =
            this.lifecycleService
              .evaluateChain(
                document.publicId,

                document.status as
                  DocumentStatusValue,

                document.lifecycleEvents as
                  LifecycleEventInput[],

                document.replacedBy
                  ?.publicId ??
                  null,
              );

          if (
            !lifecycle.valid
          ) {
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
            lifecycle
              .derivedStatus;

          if (
            !currentStatus
          ) {
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
            document
              .lifecycleEvents[
                document
                  .lifecycleEvents
                  .length -
                1
              ];

          if (
            !lastEvent
          ) {
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
                  lastEvent
                    .eventHash,

                occurredAt:
                  occurredAt
                    .toISOString(),
              });

          const transition =
            await tx.document
              .updateMany({
                where: {
                  id:
                    document.id,

                  status:
                    currentStatus,

                  replacedById:
                    null,
                },

                data: {
                  status:
                    toStatus,
                },
              });

          if (
            transition.count !==
            1
          ) {
            throw new ConflictException(
              'O documento já foi alterado por outra operação.',
            );
          }

          const lifecycleEvent =
            await tx
              .documentLifecycleEvent
              .create({
                data: {
                  documentId:
                    document.id,

                  sequence:
                    signedEvent
                      .sequence,

                  type:
                    signedEvent.type,

                  fromStatus:
                    signedEvent
                      .fromStatus,

                  toStatus:
                    signedEvent
                      .toStatus,

                  reason:
                    signedEvent.reason,

                  previousEventHash:
                    signedEvent
                      .previousEventHash,

                  payload:
                    signedEvent.payload,

                  signature:
                    signedEvent
                      .signature,

                  algorithm:
                    signedEvent
                      .algorithm,

                  keyId:
                    signedEvent.keyId,

                  eventHash:
                    signedEvent
                      .eventHash,

                  createdAt:
                    occurredAt,
                },
              });

          return {
            publicId:
              document.publicId,

            previousStatus:
              currentStatus,

            status:
              toStatus,

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
                lifecycleEvent
                  .reason,

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

  async replace(
    input:
      ReplaceDocumentInput,
  ) {
    const publicId =
      input.publicId
        .trim()
        .toUpperCase();

    const replacementPublicId =
      input.replacementPublicId
        .trim()
        .toUpperCase();

    const reason =
      input.reason
        .trim();

    if (!reason) {
      throw new BadRequestException(
        'O motivo da substituição é obrigatório.',
      );
    }

    if (
      publicId ===
      replacementPublicId
    ) {
      throw new BadRequestException(
        'Um documento não pode substituir a si próprio.',
      );
    }

    return this.prisma
      .$transaction(
        async (
          tx,
        ) => {
          const source =
            await tx.document
              .findFirst({
                where: {
                  publicId,

                  organizationId:
                    input.organizationId,
                },

                include: {
                  replacedBy: {
                    select: {
                      id:
                        true,

                      publicId:
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

          if (!source) {
            throw new NotFoundException(
              'Documento a substituir não encontrado nesta organização.',
            );
          }

          const replacement =
            await tx.document
              .findUnique({
                where: {
                  publicId:
                    replacementPublicId,
                },

                include: {
                  replacedBy: {
                    select: {
                      id:
                        true,

                      publicId:
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

          if (
            !replacement ||
            replacement
              .organizationId !==
              input.organizationId
          ) {
            throw new NotFoundException(
              'Documento sucessor não encontrado nesta organização.',
            );
          }

          if (
            source.id ===
            replacement.id
          ) {
            throw new BadRequestException(
              'Um documento não pode substituir a si próprio.',
            );
          }

          if (
            source.status !==
            'VALID'
          ) {
            throw new ConflictException(
              'Apenas documentos atualmente VALID podem ser substituídos.',
            );
          }

          if (
            source.replacedById
          ) {
            throw new ConflictException(
              'Este documento já possui um sucessor associado.',
            );
          }

          if (
            replacement.status !==
            'VALID'
          ) {
            throw new ConflictException(
              'O documento sucessor precisa estar atualmente VALID.',
            );
          }

          if (
            replacement.replacedById
          ) {
            throw new ConflictException(
              'Um documento que já foi substituído não pode ser utilizado como sucessor atual.',
            );
          }

          const sourceLifecycle =
            this.lifecycleService
              .evaluateChain(
                source.publicId,

                source.status as
                  DocumentStatusValue,

                source.lifecycleEvents as
                  LifecycleEventInput[],

                source.replacedBy
                  ?.publicId ??
                  null,
              );

          if (
            !sourceLifecycle.valid ||
            !sourceLifecycle
              .databaseStatusMatches ||
            sourceLifecycle
              .derivedStatus !==
              'VALID'
          ) {
            throw new ConflictException(
              'O lifecycle do documento original não permite a substituição.',
            );
          }

          const replacementLifecycle =
            this.lifecycleService
              .evaluateChain(
                replacement
                  .publicId,

                replacement.status as
                  DocumentStatusValue,

                replacement
                  .lifecycleEvents as
                  LifecycleEventInput[],

                replacement
                  .replacedBy
                  ?.publicId ??
                  null,
              );

          if (
            !replacementLifecycle
              .valid ||
            !replacementLifecycle
              .databaseStatusMatches ||
            replacementLifecycle
              .derivedStatus !==
              'VALID'
          ) {
            throw new ConflictException(
              'O lifecycle do documento sucessor não é válido.',
            );
          }

          const visited =
            new Set<string>();

          let cursorId:
            string | null =
            replacement.id;

          while (
            cursorId
          ) {
            if (
              cursorId ===
              source.id
            ) {
              throw new ConflictException(
                'A substituição criaria um ciclo entre documentos.',
              );
            }

            if (
              visited.has(
                cursorId,
              )
            ) {
              throw new ConflictException(
                'Foi detetado um ciclo existente na cadeia de substituição.',
              );
            }

            visited.add(
              cursorId,
            );

            const cursor:
              {
                replacedById:
                  string | null;
              } | null =
              await tx.document
                .findUnique({
                  where: {
                    id:
                      cursorId,
                  },

                  select: {
                    replacedById:
                      true,
                  },
                });

            cursorId =
              cursor
                ?.replacedById ??
              null;
          }

          const lastEvent =
            source
              .lifecycleEvents[
                source
                  .lifecycleEvents
                  .length -
                1
              ];

          if (
            !lastEvent
          ) {
            throw new ConflictException(
              'O documento original não possui evento inicial de lifecycle.',
            );
          }

          const occurredAt =
            new Date();

          const signedEvent =
            this.lifecycleService
              .createReplacementEvent({
                documentPublicId:
                  source.publicId,

                replacementPublicId:
                  replacement
                    .publicId,

                sequence:
                  lastEvent.sequence +
                  1,

                fromStatus:
                  'VALID',

                reason,

                previousEventHash:
                  lastEvent
                    .eventHash,

                occurredAt:
                  occurredAt
                    .toISOString(),
              });

          const transition =
            await tx.document
              .updateMany({
                where: {
                  id:
                    source.id,

                  organizationId:
                    input.organizationId,

                  status:
                    'VALID',

                  replacedById:
                    null,
                },

                data: {
                  status:
                    'REPLACED',

                  replacedById:
                    replacement.id,
                },
              });

          if (
            transition.count !==
            1
          ) {
            throw new ConflictException(
              'O documento já foi substituído ou alterado por outra operação.',
            );
          }

          const lifecycleEvent =
            await tx
              .documentLifecycleEvent
              .create({
                data: {
                  documentId:
                    source.id,

                  sequence:
                    signedEvent
                      .sequence,

                  type:
                    signedEvent.type,

                  fromStatus:
                    signedEvent
                      .fromStatus,

                  toStatus:
                    signedEvent
                      .toStatus,

                  reason:
                    signedEvent.reason,

                  previousEventHash:
                    signedEvent
                      .previousEventHash,

                  payload:
                    signedEvent.payload,

                  signature:
                    signedEvent
                      .signature,

                  algorithm:
                    signedEvent
                      .algorithm,

                  keyId:
                    signedEvent.keyId,

                  eventHash:
                    signedEvent
                      .eventHash,

                  createdAt:
                    occurredAt,
                },
              });

          return {
            document: {
              publicId:
                source.publicId,

              previousStatus:
                'VALID',

              status:
                'REPLACED',
            },

            replacement: {
              publicId:
                replacement
                  .publicId,

              title:
                replacement.title,

              status:
                replacement.status,
            },

            reason,

            lifecycle: {
              schema:
                'vera.lifecycle.v2',

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
                lifecycleEvent
                  .reason,

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
                lifecycleEvent
                  .keyId,

              createdAt:
                lifecycleEvent
                  .createdAt,
            },
          };
        },
      );
  }
}