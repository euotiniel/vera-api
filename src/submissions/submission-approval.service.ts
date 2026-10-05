import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import {
  DocumentIssuanceService,
} from '../documents/document-issuance.service.js';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

interface DecideApprovalInput {
  organizationId:
    string;

  submissionId:
    string;

  approverId:
    string;

  decision:
    | 'APPROVED'
    | 'REJECTED';

  reason?:
    string;
}

@Injectable()
export class SubmissionApprovalService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly documentIssuanceService:
      DocumentIssuanceService,
  ) {}

  async listPendingApproval(
    organizationId:
      string,
  ) {
    return this.prisma
      .documentSubmission
      .findMany({
        where: {
          organizationId,

          status:
            'PENDING_APPROVAL',
        },

        select: {
          id:
            true,

          title:
            true,

          type:
            true,

          reference:
            true,

          issuedAt:
            true,

          originalFileAccess:
            true,

          filename:
            true,

          mimeType:
            true,

          size:
            true,

          sha256:
            true,

          status:
            true,

          submittedAt:
            true,

          createdAt:
            true,

          updatedAt:
            true,

          creator: {
            select: {
              id:
                true,

              name:
                true,

              email:
                true,
            },
          },

          decisions: {
            where: {
              stage:
                'REVIEW',
            },

            select: {
              id:
                true,

              stage:
                true,

              decision:
                true,

              reason:
                true,

              createdAt:
                true,

              actor: {
                select: {
                  id:
                    true,

                  name:
                    true,

                  email:
                    true,
                },
              },
            },
          },
        },

        orderBy: {
          updatedAt:
            'asc',
        },
      });
  }

  async decide(
    input:
      DecideApprovalInput,
  ) {
    const normalizedReason =
      input.reason
        ?.trim() ||
      null;

    if (
      input.decision ===
        'REJECTED' &&
      !normalizedReason
    ) {
      throw new BadRequestException(
        'O motivo é obrigatório quando uma submissão é rejeitada.',
      );
    }

    const submission =
      await this.prisma
        .documentSubmission
        .findFirst({
          where: {
            id:
              input.submissionId,

            organizationId:
              input.organizationId,
          },

          include: {
            organization:
              true,

            decisions:
              true,
          },
        });

    if (!submission) {
      throw new NotFoundException(
        'Submissão não encontrada.',
      );
    }

    if (
      submission.status !==
      'PENDING_APPROVAL'
    ) {
      throw new ConflictException(
        'Apenas submissões em PENDING_APPROVAL podem receber decisão final.',
      );
    }

    const approvedReview =
      submission.decisions
        .find(
          (
            decision,
          ) =>
            decision.stage ===
              'REVIEW' &&
            decision.decision ===
              'APPROVED',
        );

    if (!approvedReview) {
      throw new ConflictException(
        'A submissão não possui uma revisão aprovada.',
      );
    }

    if (
      input.decision ===
      'REJECTED'
    ) {
      return this.reject(
        submission.id,
        input.organizationId,
        input.approverId,
        normalizedReason!,
      );
    }

    if (
      !submission.organization
        .verified
    ) {
      throw new ConflictException(
        'A organização deixou de estar verificada e não pode emitir documentos.',
      );
    }

    /*
     * O DocumentIssuanceService:
     *
     * - relê o ficheiro submetido;
     * - confirma SHA-256 e tamanho;
     * - valida novamente o PDF;
     * - verifica duplicação oficial;
     * - cria e valida a cópia no namespace
     *   oficial do storage.
     */
    const prepared =
      await this
        .documentIssuanceService
        .prepareInitialDocument({
          sourceStorageKey:
            submission.storageKey,

          expectedSha256:
            submission.sha256,

          expectedSize:
            submission.size,
        });

    let issuanceResult:
      Awaited<
        ReturnType<
          DocumentIssuanceService[
            'createInitialDocument'
          ]
        >
      >;

    try {
      issuanceResult =
        await this.prisma
          .$transaction(
            async (
              tx,
            ) => {
              /*
               * Revalidamos o issuer dentro
               * da própria transaction.
               */
              const organization =
                await tx.organization
                  .findUnique({
                    where: {
                      id:
                        submission
                          .organizationId,
                    },

                    select: {
                      id:
                        true,

                      name:
                        true,

                      slug:
                        true,

                      verified:
                        true,
                    },
                  });

              if (
                !organization
              ) {
                throw new NotFoundException(
                  'Organização não encontrada.',
                );
              }

              if (
                !organization
                  .verified
              ) {
                throw new ConflictException(
                  'A organização deixou de estar verificada e não pode emitir documentos.',
                );
              }

              /*
               * Esta transição funciona como
               * lock lógico otimista.
               *
               * Apenas uma operação pode
               * consumir PENDING_APPROVAL.
               */
              const transition =
                await tx
                  .documentSubmission
                  .updateMany({
                    where: {
                      id:
                        submission.id,

                      organizationId:
                        input.organizationId,

                      status:
                        'PENDING_APPROVAL',
                    },

                    data: {
                      status:
                        'APPROVED',
                    },
                  });

              if (
                transition.count !==
                1
              ) {
                throw new ConflictException(
                  'A submissão já foi alterada por outra operação.',
                );
              }

              /*
               * Document, Version,
               * Attestation, QR e Lifecycle
               * usam exatamente esta mesma
               * transaction PostgreSQL.
               */
              const issuance =
                await this
                  .documentIssuanceService
                  .createInitialDocument(
                    tx,
                    {
                      prepared,

                      organization: {
                        id:
                          organization.id,

                        name:
                          organization.name,

                        slug:
                          organization.slug,
                      },

                      title:
                        submission.title,

                      type:
                        submission.type,

                      reference:
                        submission.reference,

                      issuedAt:
                        submission.issuedAt,

                      originalFileAccess:
                        submission
                          .originalFileAccess,

                      filename:
                        submission.filename,
                    },
                  );

              await tx
                .documentSubmissionDecision
                .create({
                  data: {
                    submissionId:
                      submission.id,

                    actorId:
                      input.approverId,

                    stage:
                      'APPROVAL',

                    decision:
                      'APPROVED',

                    reason:
                      normalizedReason,
                  },
                });

              await tx
                .documentSubmission
                .update({
                  where: {
                    id:
                      submission.id,
                  },

                  data: {
                    documentId:
                      issuance.document
                        .id,
                  },
                });

              return issuance;
            },
          );
    } catch (
      error:
        unknown
    ) {
      /*
       * PostgreSQL rollbacka automaticamente.
       *
       * O object storage não participa da
       * transaction, portanto compensamos
       * removendo a cópia oficial.
       */
      await this
        .documentIssuanceService
        .cleanupPreparedInitialDocument(
          prepared.storageKey,
        );

      throw error;
    }

    /*
     * Esta leitura fica deliberadamente
     * FORA do catch acima.
     *
     * Se a transaction já foi commitada e
     * apenas esta leitura de resposta falhar,
     * nunca devemos apagar o ficheiro oficial.
     */
    const updatedSubmission =
      await this.getDetailedSubmission(
        submission.id,
      );

    return {
      submission:
        updatedSubmission,

      document: {
        id:
          issuanceResult
            .document.id,

        publicId:
          issuanceResult
            .document.publicId,

        title:
          issuanceResult
            .document.title,

        type:
          issuanceResult
            .document.type,

        reference:
          issuanceResult
            .document.reference,

        status:
          issuanceResult
            .document.status,

        issuedAt:
          issuanceResult
            .document.issuedAt,

        registeredAt:
          issuanceResult
            .registeredAt,

        originalFileAccess:
          issuanceResult
            .document
            .originalFileAccess,

        version: {
          version:
            issuanceResult
              .version.version,

          filename:
            issuanceResult
              .version.filename,

          mimeType:
            issuanceResult
              .version.mimeType,

          size:
            issuanceResult
              .version.size,

          sha256:
            issuanceResult
              .version.sha256,

          registeredAt:
            issuanceResult
              .version.createdAt,
        },

        qr: {
          available:
            Boolean(
              issuanceResult
                .version
                .qrProof,
            ),

          schema:
            'vera.qr.v2',

          algorithm:
            issuanceResult
              .qrProof
              .algorithm,

          keyId:
            issuanceResult
              .qrProof
              .keyId,
        },

        attestation: {
          schema:
            'vera.attestation.v2',

          algorithm:
            issuanceResult
              .attestation
              .algorithm,

          keyId:
            issuanceResult
              .attestation
              .keyId,

          createdAt:
            issuanceResult
              .attestation
              .createdAt,
        },

        lifecycle: {
          sequence:
            issuanceResult
              .lifecycleEvent
              .sequence,

          type:
            issuanceResult
              .lifecycleEvent
              .type,

          fromStatus:
            issuanceResult
              .lifecycleEvent
              .fromStatus,

          toStatus:
            issuanceResult
              .lifecycleEvent
              .toStatus,

          eventHash:
            issuanceResult
              .lifecycleEvent
              .eventHash,

          algorithm:
            issuanceResult
              .lifecycleEvent
              .algorithm,

          keyId:
            issuanceResult
              .lifecycleEvent
              .keyId,

          createdAt:
            issuanceResult
              .lifecycleEvent
              .createdAt,
        },
      },
    };
  }

  private async reject(
    submissionId:
      string,

    organizationId:
      string,

    approverId:
      string,

    reason:
      string,
  ) {
    await this.prisma
      .$transaction(
        async (
          tx,
        ) => {
          const transition =
            await tx
              .documentSubmission
              .updateMany({
                where: {
                  id:
                    submissionId,

                  organizationId,

                  status:
                    'PENDING_APPROVAL',
                },

                data: {
                  status:
                    'REJECTED',
                },
              });

          if (
            transition.count !==
            1
          ) {
            throw new ConflictException(
              'A submissão já foi alterada por outra operação.',
            );
          }

          await tx
            .documentSubmissionDecision
            .create({
              data: {
                submissionId,

                actorId:
                  approverId,

                stage:
                  'APPROVAL',

                decision:
                  'REJECTED',

                reason,
              },
            });
        },
      );

    return {
      submission:
        await this
          .getDetailedSubmission(
            submissionId,
          ),

      document:
        null,
    };
  }

  private async getDetailedSubmission(
    submissionId:
      string,
  ) {
    const submission =
      await this.prisma
        .documentSubmission
        .findUnique({
          where: {
            id:
              submissionId,
          },

          select: {
            id:
              true,

            status:
              true,

            title:
              true,

            type:
              true,

            reference:
              true,

            issuedAt:
              true,

            originalFileAccess:
              true,

            filename:
              true,

            mimeType:
              true,

            size:
              true,

            sha256:
              true,

            submittedAt:
              true,

            createdAt:
              true,

            updatedAt:
              true,

            documentId:
              true,

            organization: {
              select: {
                id:
                  true,

                name:
                  true,

                slug:
                  true,
              },
            },

            creator: {
              select: {
                id:
                  true,

                name:
                  true,

                email:
                  true,
              },
            },

            decisions: {
              orderBy: {
                createdAt:
                  'asc',
              },

              select: {
                id:
                  true,

                stage:
                  true,

                decision:
                  true,

                reason:
                  true,

                createdAt:
                  true,

                actor: {
                  select: {
                    id:
                      true,

                    name:
                      true,

                    email:
                      true,
                  },
                },
              },
            },

            document: {
              select: {
                id:
                  true,

                publicId:
                  true,

                status:
                  true,
              },
            },
          },
        });

    if (!submission) {
      throw new InternalServerErrorException(
        'Não foi possível carregar a submissão.',
      );
    }

    return {
      id:
        submission.id,

      status:
        submission.status,

      title:
        submission.title,

      type:
        submission.type,

      reference:
        submission.reference,

      issuedAt:
        submission.issuedAt,

      originalFileAccess:
        submission
          .originalFileAccess,

      organization:
        submission.organization,

      creator:
        submission.creator,

      file: {
        filename:
          submission.filename,

        mimeType:
          submission.mimeType,

        size:
          submission.size,

        sha256:
          submission.sha256,
      },

      submittedAt:
        submission.submittedAt,

      documentId:
        submission.documentId,

      document:
        submission.document,

      decisions:
        submission.decisions,

      createdAt:
        submission.createdAt,

      updatedAt:
        submission.updatedAt,
    };
  }
}