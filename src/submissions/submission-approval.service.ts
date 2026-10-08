import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

type InitialIssuanceResult =
  Awaited<
    ReturnType<
      DocumentIssuanceService[
        'createInitialDocument'
      ]
    >
  >;

type NewVersionIssuanceResult =
  Awaited<
    ReturnType<
      DocumentIssuanceService[
        'createNewVersion'
      ]
    >
  >;

type IssuanceResult =
  | InitialIssuanceResult
  | NewVersionIssuanceResult;

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

          kind:
            true,

          targetDocumentId:
            true,

          baseVersion:
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

          targetDocument: {
            select: {
              id:
                true,

              publicId:
                true,

              status:
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

            targetDocument: {
              include: {
                versions: {
                  orderBy: {
                    version:
                      'desc',
                  },

                  take:
                    1,

                  select: {
                    version:
                      true,
                  },
                },
              },
            },
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
      submission.creatorId ===
      input.approverId
    ) {
      throw new ForbiddenException(
        'O criador da submissão não pode tomar a decisão final sobre a própria submissão.',
      );
    }

    if (
      approvedReview.actorId ===
      input.approverId
    ) {
      throw new ForbiddenException(
        'O revisor da submissão não pode também tomar a decisão final.',
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
      approvedReview.actorId ===
      submission.creatorId
    ) {
      throw new ConflictException(
        'A revisão aprovada viola a separação de funções e a submissão não pode ser emitida.',
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
     * ============================================================
     * NEW VERSION PREVALIDATION
     * ============================================================
     *
     * Evitamos copiar bytes para o namespace
     * oficial quando já sabemos que a
     * submissão ficou stale.
     *
     * A mesma validação será repetida dentro
     * da transaction pelo DocumentIssuanceService.
     */

    if (
      submission.kind ===
      'NEW_VERSION'
    ) {
      if (
        !submission
          .targetDocumentId ||
        submission.baseVersion ===
          null
      ) {
        throw new ConflictException(
          'A submissão de nova versão não possui documento alvo ou versão-base válidos.',
        );
      }

      const targetDocument =
        submission.targetDocument;

      if (!targetDocument) {
        throw new NotFoundException(
          'Documento alvo não encontrado.',
        );
      }

      if (
        targetDocument
          .organizationId !==
        submission.organizationId
      ) {
        throw new ConflictException(
          'O documento alvo não pertence à organização desta submissão.',
        );
      }

      if (
        targetDocument.status !==
        'VALID'
      ) {
        throw new ConflictException(
          'Apenas documentos atualmente válidos podem receber uma nova versão.',
        );
      }

      const latestVersion =
        targetDocument
          .versions[0];

      if (!latestVersion) {
        throw new ConflictException(
          'O documento alvo não possui uma versão oficial válida.',
        );
      }

      if (
        latestVersion.version !==
        submission.baseVersion
      ) {
        throw new ConflictException(
          'O documento já recebeu uma versão posterior à utilizada por esta submissão.',
        );
      }
    }

    /*
     * ============================================================
     * PREPARE OFFICIAL FILE
     * ============================================================
     *
     * A preparação acontece antes da
     * transaction porque o object storage
     * não participa da transaction SQL.
     */

    const prepared =
      submission.kind ===
      'NEW_DOCUMENT'
        ? await this
            .documentIssuanceService
            .prepareInitialDocument({
              sourceStorageKey:
                submission.storageKey,

              expectedSha256:
                submission.sha256,

              expectedSize:
                submission.size,
            })
        : await this
            .documentIssuanceService
            .prepareNewVersion({
              sourceStorageKey:
                submission.storageKey,

              expectedSha256:
                submission.sha256,

              expectedSize:
                submission.size,

              documentPublicId:
                submission
                  .targetDocument!
                  .publicId,

              baseVersion:
                submission
                  .baseVersion!,
            });

    let issuanceResult:
      IssuanceResult;

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

              if (!organization) {
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
               * Apenas uma operação pode
               * consumir esta submissão em
               * PENDING_APPROVAL.
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

              let issuance:
                IssuanceResult;

              /*
               * ==================================================
               * NEW DOCUMENT
               * ==================================================
               */

              if (
                submission.kind ===
                'NEW_DOCUMENT'
              ) {
                issuance =
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
                          submission
                            .reference,

                        issuedAt:
                          submission
                            .issuedAt,

                        originalFileAccess:
                          submission
                            .originalFileAccess,

                        filename:
                          submission
                            .filename,
                      },
                    );
              } else {
                /*
                 * ================================================
                 * NEW VERSION
                 * ================================================
                 */

                if (
                  !submission
                    .targetDocumentId ||
                  submission
                    .baseVersion ===
                    null
                ) {
                  throw new ConflictException(
                    'A submissão de nova versão não possui documento alvo ou versão-base válidos.',
                  );
                }

                issuance =
                  await this
                    .documentIssuanceService
                    .createNewVersion(
                      tx,
                      {
                        prepared,

                        documentId:
                          submission
                            .targetDocumentId,

                        organization: {
                          id:
                            organization.id,

                          name:
                            organization.name,

                          slug:
                            organization.slug,
                        },

                        expectedBaseVersion:
                          submission
                            .baseVersion,

                        filename:
                          submission
                            .filename,
                      },
                    );
              }

              /*
               * A decisão final pertence à
               * mesma transaction da emissão.
               */
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

              /*
               * issuedVersionId identifica
               * exatamente a versão produzida
               * por qualquer submissão.
               *
               * documentId continua reservado
               * para a submissão NEW_DOCUMENT
               * que originou o Document.
               */
              if (
                submission.kind ===
                'NEW_DOCUMENT'
              ) {
                await tx
                  .documentSubmission
                  .update({
                    where: {
                      id:
                        submission.id,
                    },

                    data: {
                      documentId:
                        issuance
                          .document.id,

                      issuedVersionId:
                        issuance
                          .version.id,
                    },
                  });
              } else {
                await tx
                  .documentSubmission
                  .update({
                    where: {
                      id:
                        submission.id,
                    },

                    data: {
                      issuedVersionId:
                        issuance
                          .version.id,
                    },
                  });
              }

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
       * transaction, portanto removemos a
       * cópia oficial preparada.
       */
      await this
        .documentIssuanceService
        .cleanupPreparedDocument(
          prepared.storageKey,
        );

      /*
       * Primeiro distinguimos duplicação
       * global dos mesmos bytes.
       */
      if (
        this.isUniqueConstraintViolation(
          error,
        )
      ) {
        const existingVersion =
          await this.prisma
            .documentVersion
            .findUnique({
              where: {
                sha256:
                  submission.sha256,
              },

              select: {
                id:
                  true,
              },
            });

        if (existingVersion) {
          throw new ConflictException(
            'Este ficheiro já está registado como documento oficial na Vera.',
          );
        }

        /*
         * Para NEW_VERSION, um P2002 sem
         * colisão de SHA normalmente significa
         * que outra operação já materializou
         * (documentId, version).
         */
        if (
          submission.kind ===
          'NEW_VERSION'
        ) {
          throw new ConflictException(
            'O documento já recebeu uma versão posterior à utilizada por esta submissão.',
          );
        }
      }

      throw error;
    }

    /*
     * Esta leitura fica deliberadamente
     * FORA do catch acima.
     *
     * Se a transaction já foi commitada e
     * apenas esta leitura falhar, nunca
     * apagamos a cópia oficial.
     */
    const updatedSubmission =
      await this.getDetailedSubmission(
        submission.id,
      );

    /*
     * Uma nova versão não altera o estado
     * lifecycle do Document.
     *
     * REGISTERED existe apenas na criação
     * inicial. v2/v3 têm a sua própria
     * Attestation e QR Proof.
     */
    const lifecycle =
      'lifecycleEvent' in
      issuanceResult
        ? {
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
          }
        : null;

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

        lifecycle,
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

  private isUniqueConstraintViolation(
    error:
      unknown,
  ): boolean {
    return (
      typeof error ===
        'object' &&
      error !==
        null &&
      'code' in error &&
      (
        error as {
          code?:
            unknown;
        }
      ).code ===
        'P2002'
    );
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

            kind:
              true,

            status:
              true,

            targetDocumentId:
              true,

            baseVersion:
              true,

            issuedVersionId:
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

            targetDocument: {
              select: {
                id:
                  true,

                publicId:
                  true,

                status:
                  true,
              },
            },

            issuedVersion: {
              select: {
                id:
                  true,

                documentId:
                  true,

                version:
                  true,

                filename:
                  true,

                sha256:
                  true,

                createdAt:
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

      kind:
        submission.kind,

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

      targetDocumentId:
        submission
          .targetDocumentId,

      targetDocument:
        submission
          .targetDocument,

      baseVersion:
        submission.baseVersion,

      issuedVersionId:
        submission
          .issuedVersionId,

      issuedVersion:
        submission
          .issuedVersion,

      decisions:
        submission.decisions,

      createdAt:
        submission.createdAt,

      updatedAt:
        submission.updatedAt,
    };
  }
}