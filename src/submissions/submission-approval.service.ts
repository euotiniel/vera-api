import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  createHash,
} from 'node:crypto';

import {
  PdfValidationService,
} from '../documents/pdf-validation.service.js';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  StorageService,
} from '../storage/storage.service.js';

import {
  AttestationService,
} from '../trust/attestation.service.js';

import {
  LifecycleService,
} from '../trust/lifecycle.service.js';

import {
  QrProofService,
} from '../trust/qr-proof.service.js';

import {
  generatePublicId,
} from '../trust/public-id.js';

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
  private readonly logger =
    new Logger(
      SubmissionApprovalService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly storageService:
      StorageService,

    private readonly pdfValidationService:
      PdfValidationService,

    private readonly attestationService:
      AttestationService,

    private readonly lifecycleService:
      LifecycleService,

    private readonly qrProofService:
      QrProofService,
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

    const sourceFile =
      await this.storageService
        .getFile(
          submission.storageKey,
        );

    const sourceSha256 =
      createHash(
        'sha256',
      )
        .update(
          sourceFile.body,
        )
        .digest(
          'hex',
        );

    if (
      sourceSha256 !==
        submission.sha256 ||
      sourceFile.body.length !==
        submission.size
    ) {
      throw new InternalServerErrorException(
        'O ficheiro armazenado da submissão não corresponde ao original admitido.',
      );
    }

    /*
     * Defesa adicional antes da emissão.
     *
     * Mesmo tendo sido validado no upload,
     * o PDF é novamente interpretado antes
     * de se tornar um documento oficial.
     */
    const validatedPdf =
      await this.pdfValidationService
        .validate(
          sourceFile.body,
        );

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

            documentId:
              true,
          },
        });

    if (existingVersion) {
      throw new ConflictException(
        'Estes bytes já estão registados como documento oficial na Vera.',
      );
    }

    const publicId =
      generatePublicId();

    const versionNumber =
      1;

    const registeredAt =
      new Date();

    const officialStorageKey =
      this.storageService
        .buildDocumentKey(
          publicId,
          versionNumber,
        );

    /*
     * O ficheiro submetido permanece
     * preservado no espaço de submissions.
     *
     * Criamos uma cópia separada no
     * namespace oficial de documents.
     */
    await this.storageService
      .putFile({
        key:
          officialStorageKey,

        body:
          sourceFile.body,

        contentType:
          validatedPdf.mimeType,
      });

    try {
      const officialStoredFile =
        await this.storageService
          .getFile(
            officialStorageKey,
          );

      const officialSha256 =
        createHash(
          'sha256',
        )
          .update(
            officialStoredFile.body,
          )
          .digest(
            'hex',
          );

      if (
        officialSha256 !==
          submission.sha256 ||
        officialStoredFile
          .body.length !==
          submission.size
      ) {
        throw new InternalServerErrorException(
          'A integridade da cópia oficial do documento não pôde ser confirmada.',
        );
      }

      const result =
        await this.prisma
          .$transaction(
            async (
              tx,
            ) => {
              /*
               * Esta atualização funciona
               * também como proteção contra
               * duas aprovações concorrentes.
               *
               * Se outra operação já tiver
               * mudado o estado, count = 0.
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

              const issuedAt =
                submission.issuedAt ??
                registeredAt;

              const document =
                await tx.document
                  .create({
                    data: {
                      publicId,

                      title:
                        submission.title,

                      type:
                        submission.type,

                      reference:
                        submission.reference,

                      status:
                        'VALID',

                      issuedAt,

                      originalFileAccess:
                        submission
                          .originalFileAccess,

                      organization: {
                        connect: {
                          id:
                            submission
                              .organizationId,
                        },
                      },

                      createdAt:
                        registeredAt,
                    },
                  });

              const version =
                await tx
                  .documentVersion
                  .create({
                    data: {
                      version:
                        versionNumber,

                      filename:
                        submission
                          .filename,

                      mimeType:
                        validatedPdf
                          .mimeType,

                      size:
                        validatedPdf
                          .size,

                      sha256:
                        submission.sha256,

                      storageKey:
                        officialStorageKey,

                      qrProof:
                        null,

                      createdAt:
                        registeredAt,

                      document: {
                        connect: {
                          id:
                            document.id,
                        },
                      },
                    },
                  });

              const signedAttestation =
                this.attestationService
                  .create({
                    documentPublicId:
                      document.publicId,

                    organizationId:
                      submission
                        .organization.id,

                    organizationSlug:
                      submission
                        .organization.slug,

                    organizationName:
                      submission
                        .organization.name,

                    title:
                      document.title,

                    type:
                      document.type,

                    reference:
                      document.reference,

                    issuedAt:
                      document.issuedAt
                        ?.toISOString() ??
                      null,

                    version:
                      version.version,

                    filename:
                      version.filename,

                    mimeType:
                      version.mimeType,

                    size:
                      version.size,

                    sha256:
                      version.sha256,

                    registeredAt:
                      version.createdAt
                        .toISOString(),
                  });

              const attestation =
                await tx.attestation
                  .create({
                    data: {
                      documentVersionId:
                        version.id,

                      payload:
                        signedAttestation
                          .payload,

                      signature:
                        signedAttestation
                          .signature,

                      algorithm:
                        signedAttestation
                          .algorithm,

                      keyId:
                        signedAttestation
                          .keyId,

                      createdAt:
                        registeredAt,
                    },
                  });

              const signedQrProof =
                this.qrProofService
                  .create({
                    publicId:
                      document.publicId,

                    version:
                      version.version,

                    sha256:
                      version.sha256,

                    registeredAt:
                      version.createdAt
                        .toISOString(),

                    attestation: {
                      payload:
                        attestation
                          .payload,

                      signature:
                        attestation
                          .signature,

                      algorithm:
                        attestation
                          .algorithm,

                      keyId:
                        attestation
                          .keyId,
                    },
                  });

              const versionWithQr =
                await tx
                  .documentVersion
                  .update({
                    where: {
                      id:
                        version.id,
                    },

                    data: {
                      qrProof:
                        signedQrProof
                          .token,
                    },
                  });

              const signedLifecycle =
                this.lifecycleService
                  .createRegisteredEvent({
                    documentPublicId:
                      document.publicId,

                    toStatus:
                      document.status,

                    occurredAt:
                      registeredAt
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
                        signedLifecycle
                          .sequence,

                      type:
                        signedLifecycle
                          .type,

                      fromStatus:
                        signedLifecycle
                          .fromStatus,

                      toStatus:
                        signedLifecycle
                          .toStatus,

                      reason:
                        signedLifecycle
                          .reason,

                      previousEventHash:
                        signedLifecycle
                          .previousEventHash,

                      payload:
                        signedLifecycle
                          .payload,

                      signature:
                        signedLifecycle
                          .signature,

                      algorithm:
                        signedLifecycle
                          .algorithm,

                      keyId:
                        signedLifecycle
                          .keyId,

                      eventHash:
                        signedLifecycle
                          .eventHash,

                      createdAt:
                        registeredAt,
                    },
                  });

              const approvalDecision =
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
                      document.id,
                  },
                });

              return {
                document,

                version:
                  versionWithQr,

                attestation,

                lifecycleEvent,

                qrProof:
                  signedQrProof,

                approvalDecision,
              };
            },
          );

      const updatedSubmission =
        await this.getDetailedSubmission(
          submission.id,
        );

      return {
        submission:
          updatedSubmission,

        document: {
          id:
            result.document.id,

          publicId:
            result.document.publicId,

          title:
            result.document.title,

          type:
            result.document.type,

          reference:
            result.document.reference,

          status:
            result.document.status,

          issuedAt:
            result.document.issuedAt,

          registeredAt,

          originalFileAccess:
            result.document
              .originalFileAccess,

          version: {
            version:
              result.version
                .version,

            filename:
              result.version
                .filename,

            mimeType:
              result.version
                .mimeType,

            size:
              result.version
                .size,

            sha256:
              result.version
                .sha256,

            registeredAt:
              result.version
                .createdAt,
          },

          qr: {
            available:
              Boolean(
                result.version
                  .qrProof,
              ),

            schema:
              'vera.qr.v2',

            algorithm:
              result.qrProof
                .algorithm,

            keyId:
              result.qrProof
                .keyId,
          },

          attestation: {
            schema:
              'vera.attestation.v2',

            algorithm:
              result.attestation
                .algorithm,

            keyId:
              result.attestation
                .keyId,

            createdAt:
              result.attestation
                .createdAt,
          },

          lifecycle: {
            sequence:
              result.lifecycleEvent
                .sequence,

            type:
              result.lifecycleEvent
                .type,

            fromStatus:
              result.lifecycleEvent
                .fromStatus,

            toStatus:
              result.lifecycleEvent
                .toStatus,

            eventHash:
              result.lifecycleEvent
                .eventHash,

            algorithm:
              result.lifecycleEvent
                .algorithm,

            keyId:
              result.lifecycleEvent
                .keyId,

            createdAt:
              result.lifecycleEvent
                .createdAt,
          },
        },
      };
    } catch (
      error:
        unknown
    ) {
      /*
       * O storage não participa da
       * transaction PostgreSQL.
       *
       * Se a emissão falhar depois da
       * cópia oficial, removemos a cópia.
       */
      try {
        await this.storageService
          .deleteFile(
            officialStorageKey,
          );
      } catch (
        cleanupError:
          unknown
      ) {
        this.logger.error(
          `Falha ao remover cópia oficial órfã: ${officialStorageKey}`,
          cleanupError,
        );
      }

      throw error;
    }
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