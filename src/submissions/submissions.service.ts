import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  createHash,
  randomUUID,
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

interface CreateSubmissionInput {
  file:
    Express.Multer.File;

  organizationId:
    string;

  creatorId:
    string;

  title:
    string;

  type?:
    string;

  reference?:
    string;

  issuedAt?:
    string;

  originalFileAccess?:
    | 'PUBLIC'
    | 'RESTRICTED'
    | 'PRIVATE';
}

interface ReviewSubmissionInput {
  organizationId:
    string;

  submissionId:
    string;

  reviewerId:
    string;

  decision:
    | 'APPROVED'
    | 'REJECTED';

  reason?:
    string;
}

@Injectable()
export class SubmissionsService {
  private readonly logger =
    new Logger(
      SubmissionsService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly storageService:
      StorageService,

    private readonly pdfValidationService:
      PdfValidationService,
  ) {}

  async createDraft(
    input:
      CreateSubmissionInput,
  ) {
    const organization =
      await this.prisma
        .organization
        .findUnique({
          where: {
            id:
              input.organizationId,
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

    if (!organization.verified) {
      throw new ConflictException(
        'Esta organização ainda não está verificada.',
      );
    }

    const validatedPdf =
      await this.pdfValidationService
        .validate(
          input.file.buffer,
        );

    const sha256 =
      createHash(
        'sha256',
      )
        .update(
          input.file.buffer,
        )
        .digest(
          'hex',
        );

    const existingDocumentVersion =
      await this.prisma
        .documentVersion
        .findUnique({
          where: {
            sha256,
          },

          select: {
            id:
              true,

            documentId:
              true,
          },
        });

    if (existingDocumentVersion) {
      throw new ConflictException(
        'Este ficheiro já está registado como documento oficial na Vera.',
      );
    }

    const existingSubmission =
      await this.prisma
        .documentSubmission
        .findFirst({
          where: {
            organizationId:
              organization.id,

            sha256,

            status: {
              in: [
                'DRAFT',
                'PENDING_REVIEW',
                'PENDING_APPROVAL',
                'APPROVED',
              ],
            },
          },

          select: {
            id:
              true,

            status:
              true,
          },
        });

    if (existingSubmission) {
      throw new ConflictException(
        'Este ficheiro já possui uma submissão ativa nesta organização.',
      );
    }

    const storageKey =
      [
        'submissions',
        organization.id,
        randomUUID(),
        'original.pdf',
      ].join('/');

    await this.storageService
      .putFile({
        key:
          storageKey,

        body:
          input.file.buffer,

        contentType:
          validatedPdf.mimeType,
      });

    try {
      const storedFile =
        await this.storageService
          .getFile(
            storageKey,
          );

      const storedSha256 =
        createHash(
          'sha256',
        )
          .update(
            storedFile.body,
          )
          .digest(
            'hex',
          );

      if (
        storedSha256 !==
          sha256 ||
        storedFile.body.length !==
          validatedPdf.size
      ) {
        throw new InternalServerErrorException(
          'A integridade do ficheiro armazenado não pôde ser confirmada.',
        );
      }

      const submission =
        await this.prisma
          .documentSubmission
          .create({
            data: {
              organizationId:
                organization.id,

              creatorId:
                input.creatorId,

              title:
                input.title.trim(),

              type:
                input.type
                  ?.trim() ||
                null,

              reference:
                input.reference
                  ?.trim() ||
                null,

              issuedAt:
                input.issuedAt
                  ? new Date(
                      input.issuedAt,
                    )
                  : null,

              originalFileAccess:
                input.originalFileAccess ??
                'PUBLIC',

              filename:
                input.file
                  .originalname,

              mimeType:
                validatedPdf
                  .mimeType,

              size:
                validatedPdf.size,

              sha256,

              storageKey,

              status:
                'DRAFT',
            },

            include: {
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
            },
          });

      return this.toSubmissionResponse(
        submission,
      );
    } catch (
      error:
        unknown
    ) {
      try {
        await this.storageService
          .deleteFile(
            storageKey,
          );
      } catch (
        cleanupError:
          unknown
      ) {
        this.logger.error(
          `Falha ao remover objecto órfão da submissão: ${storageKey}`,
          cleanupError,
        );
      }

      throw error;
    }
  }

  async submitDraft(
    input: {
      organizationId:
        string;

      submissionId:
        string;

      creatorId:
        string;
    },
  ) {
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
        });

    if (!submission) {
      throw new NotFoundException(
        'Submissão não encontrada.',
      );
    }

    if (
      submission.creatorId !==
      input.creatorId
    ) {
      throw new ForbiddenException(
        'Apenas o criador desta submissão pode enviá-la para revisão.',
      );
    }

    if (
      submission.status !==
      'DRAFT'
    ) {
      throw new ConflictException(
        'Apenas submissões em DRAFT podem ser enviadas para revisão.',
      );
    }

    await this.assertStoredFileIntegrity(
      submission.storageKey,
      submission.sha256,
      submission.size,
    );

    const submittedAt =
      new Date();

    const transition =
      await this.prisma
        .documentSubmission
        .updateMany({
          where: {
            id:
              submission.id,

            organizationId:
              input.organizationId,

            creatorId:
              input.creatorId,

            status:
              'DRAFT',
          },

          data: {
            status:
              'PENDING_REVIEW',

            submittedAt,
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

    const updated =
      await this.findSubmissionForResponse(
        submission.id,
      );

    return this.toSubmissionResponse(
      updated,
    );
  }

  async listPendingReview(
    organizationId:
      string,
  ) {
    return this.prisma
      .documentSubmission
      .findMany({
        where: {
          organizationId,

          status:
            'PENDING_REVIEW',
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
        },

        orderBy: {
          submittedAt:
            'asc',
        },
      });
  }

  async getInternalFile(
    organizationId:
      string,

    submissionId:
      string,
  ) {
    const submission =
      await this.prisma
        .documentSubmission
        .findFirst({
          where: {
            id:
              submissionId,

            organizationId,
          },

          select: {
            id:
              true,

            filename:
              true,

            mimeType:
              true,

            size:
              true,

            sha256:
              true,

            storageKey:
              true,
          },
        });

    if (!submission) {
      throw new NotFoundException(
        'Submissão não encontrada.',
      );
    }

    const storedFile =
      await this.storageService
        .getFile(
          submission.storageKey,
        );

    const storedSha256 =
      createHash(
        'sha256',
      )
        .update(
          storedFile.body,
        )
        .digest(
          'hex',
        );

    if (
      storedSha256 !==
        submission.sha256 ||
      storedFile.body.length !==
        submission.size
    ) {
      throw new InternalServerErrorException(
        'O ficheiro armazenado da submissão não corresponde ao original admitido.',
      );
    }

    return {
      body:
        storedFile.body,

      contentType:
        submission.mimeType,

      filename:
        submission.filename,

      sha256:
        storedSha256,
    };
  }

  async review(
    input:
      ReviewSubmissionInput,
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

          select: {
            id:
              true,

            status:
              true,

            storageKey:
              true,

            sha256:
              true,

            size:
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
      'PENDING_REVIEW'
    ) {
      throw new ConflictException(
        'Apenas submissões em PENDING_REVIEW podem ser revistas.',
      );
    }

    await this.assertStoredFileIntegrity(
      submission.storageKey,
      submission.sha256,
      submission.size,
    );

    const nextStatus =
      input.decision ===
        'APPROVED'
        ? 'PENDING_APPROVAL'
        : 'REJECTED';

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
                    submission.id,

                  organizationId:
                    input.organizationId,

                  status:
                    'PENDING_REVIEW',
                },

                data: {
                  status:
                    nextStatus,
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
                submissionId:
                  submission.id,

                actorId:
                  input.reviewerId,

                stage:
                  'REVIEW',

                decision:
                  input.decision,

                reason:
                  normalizedReason,
              },
            });
        },
      );

    return this.findSubmissionWithDecisions(
      submission.id,
    );
  }

  private async assertStoredFileIntegrity(
    storageKey:
      string,

    expectedSha256:
      string,

    expectedSize:
      number,
  ): Promise<void> {
    const storedFile =
      await this.storageService
        .getFile(
          storageKey,
        );

    const storedSha256 =
      createHash(
        'sha256',
      )
        .update(
          storedFile.body,
        )
        .digest(
          'hex',
        );

    if (
      storedSha256 !==
        expectedSha256 ||
      storedFile.body.length !==
        expectedSize
    ) {
      throw new InternalServerErrorException(
        'O ficheiro armazenado da submissão não corresponde ao original admitido.',
      );
    }
  }

  private async findSubmissionForResponse(
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

          include: {
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
          },
        });

    if (!submission) {
      throw new InternalServerErrorException(
        'Não foi possível carregar a submissão.',
      );
    }

    return submission;
  }

  private async findSubmissionWithDecisions(
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

          include: {
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

              include: {
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
        });

    if (!submission) {
      throw new InternalServerErrorException(
        'Não foi possível carregar a submissão.',
      );
    }

    return {
      ...this.toSubmissionResponse(
        submission,
      ),

      decisions:
        submission.decisions,
    };
  }

  private toSubmissionResponse(
    submission: {
      id:
        string;

      status:
        string;

      title:
        string;

      type:
        string | null;

      reference:
        string | null;

      issuedAt:
        Date | null;

      originalFileAccess:
        string;

      filename:
        string;

      mimeType:
        string;

      size:
        number;

      sha256:
        string;

      submittedAt:
        Date | null;

      createdAt:
        Date;

      updatedAt:
        Date;

      organization: {
        id:
          string;

        name:
          string;

        slug:
          string;
      };

      creator: {
        id:
          string;

        name:
          string;

        email:
          string;
      };
    },
  ) {
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

      createdAt:
        submission.createdAt,

      updatedAt:
        submission.updatedAt,
    };
  }
}