import {
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

    /*
     * Ainda usamos verified enquanto
     * o mecanismo real de issuer trust
     * não for implementado.
     */
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

    /*
     * Um documento já oficialmente
     * registado não deve voltar a entrar
     * no pipeline como nova submissão.
     */
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

    /*
     * Evitamos duas submissões ativas
     * dos mesmos bytes dentro da mesma
     * organização.
     *
     * REJECTED e CANCELLED poderão ser
     * reenviados posteriormente.
     */
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
      /*
       * Read-after-write.
       *
       * A submissão só entra na DB
       * depois de confirmarmos que os
       * bytes persistidos são exatamente
       * os que recebemos.
       */
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
    } catch (
      error:
        unknown
    ) {
      /*
       * Se qualquer passo após o upload
       * falhar, tentamos remover o objeto
       * para evitar storage órfão.
       */
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

          select: {
            id:
              true,

            creatorId:
              true,

            status:
              true,

            title:
              true,

            organizationId:
              true,

            storageKey:
              true,

            submittedAt:
              true,
          },
        });

    if (!submission) {
      throw new NotFoundException(
        'Submissão não encontrada.',
      );
    }

    /*
     * Um CREATOR não pode enviar para
     * revisão um draft criado por outro
     * CREATOR.
     */
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

    /*
     * Confirmamos novamente que o objeto
     * ainda existe e corresponde ao hash
     * registado antes de mudar o estado.
     */
    const completeSubmission =
      await this.prisma
        .documentSubmission
        .findUnique({
          where: {
            id:
              submission.id,
          },
        });

    if (!completeSubmission) {
      throw new NotFoundException(
        'Submissão não encontrada.',
      );
    }

    const storedFile =
      await this.storageService
        .getFile(
          completeSubmission
            .storageKey,
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
        completeSubmission
          .sha256 ||
      storedFile.body.length !==
        completeSubmission
          .size
    ) {
      throw new InternalServerErrorException(
        'O ficheiro armazenado da submissão não corresponde ao original admitido.',
      );
    }

    const submittedAt =
      new Date();

    /*
     * updateMany + status DRAFT evita
     * duas submissões concorrentes do
     * mesmo draft avançarem ao mesmo
     * tempo.
     */
    const transition =
      await this.prisma
        .documentSubmission
        .updateMany({
          where: {
            id:
              completeSubmission.id,

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
      await this.prisma
        .documentSubmission
        .findUnique({
          where: {
            id:
              completeSubmission.id,
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

    if (!updated) {
      throw new InternalServerErrorException(
        'Não foi possível carregar a submissão atualizada.',
      );
    }

    return {
      id:
        updated.id,

      status:
        updated.status,

      title:
        updated.title,

      type:
        updated.type,

      reference:
        updated.reference,

      issuedAt:
        updated.issuedAt,

      originalFileAccess:
        updated
          .originalFileAccess,

      organization:
        updated.organization,

      creator:
        updated.creator,

      file: {
        filename:
          updated.filename,

        mimeType:
          updated.mimeType,

        size:
          updated.size,

        sha256:
          updated.sha256,
      },

      submittedAt:
        updated.submittedAt,

      createdAt:
        updated.createdAt,

      updatedAt:
        updated.updatedAt,
    };
  }
}