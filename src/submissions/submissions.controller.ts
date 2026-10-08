import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AccessTokenGuard,
} from '../auth/access-token.guard.js';

import {
  CurrentUser,
} from '../auth/current-user.decorator.js';

import type {
  AuthenticatedUser,
} from '../auth/auth.types.js';

import {
  OrganizationRoleGuard,
} from '../memberships/organization-role.guard.js';

import {
  OrganizationRoles,
} from '../memberships/organization-roles.decorator.js';

import {
  CreateSubmissionDto,
} from './dto/create-submission.dto.js';

import {
  DecideApprovalDto,
} from './dto/decide-approval.dto.js';

import {
  ReviewSubmissionDto,
} from './dto/review-submission.dto.js';

import {
  SubmissionApprovalService,
} from './submission-approval.service.js';

import {
  SubmissionsService,
} from './submissions.service.js';

@ApiTags('Submissions')
@ApiBearerAuth(
  'access-token',
)
@Controller(
  'organizations/:organizationId/submissions',
)
@UseGuards(
  AccessTokenGuard,
  OrganizationRoleGuard,
)
@UsePipes(
  new ValidationPipe({
    whitelist:
      true,

    forbidNonWhitelisted:
      true,

    transform:
      true,
  }),
)
export class SubmissionsController {
  constructor(
    private readonly submissionsService:
      SubmissionsService,

    private readonly submissionApprovalService:
      SubmissionApprovalService,
  ) {}

  /*
   * ============================================================
   * NEW DOCUMENT
   * ============================================================
   */

  @Post()
  @OrganizationRoles(
    'CREATOR',
  )
  @ApiOperation({
    summary:
      'Criar draft de novo documento',
  })
  @ApiParam({
    name:
      'organizationId',
  })
  @ApiConsumes(
    'multipart/form-data',
  )
  @ApiBody({
    schema: {
      type:
        'object',

      required: [
        'file',
        'title',
      ],

      properties: {
        file: {
          type:
            'string',

          format:
            'binary',
        },

        title: {
          type:
            'string',
        },

        type: {
          type:
            'string',

          nullable:
            true,
        },

        reference: {
          type:
            'string',

          nullable:
            true,
        },

        issuedAt: {
          type:
            'string',

          format:
            'date-time',

          nullable:
            true,
        },

        originalFileAccess: {
          type:
            'string',

          enum: [
            'PUBLIC',
            'RESTRICTED',
            'PRIVATE',
          ],

          default:
            'PUBLIC',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Draft de novo documento criado.',
  })
  @ApiBadRequestResponse({
    description:
      'Dados ou PDF inválidos.',
  })
  @ApiForbiddenResponse({
    description:
      'CREATOR necessário.',
  })
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        limits: {
          fileSize:
            10 *
            1024 *
            1024,
        },
      },
    ),
  )
  async create(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @UploadedFile()
    file:
      Express.Multer.File,

    @Body()
    input:
      CreateSubmissionDto,

    @CurrentUser()
    user:
      AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'O ficheiro PDF é obrigatório.',
      );
    }

    return this.submissionsService
      .createDraft({
        file,

        organizationId,

        creatorId:
          user.id,

        title:
          input.title,

        type:
          input.type,

        reference:
          input.reference,

        issuedAt:
          input.issuedAt,

        originalFileAccess:
          input.originalFileAccess,
      });
  }

  /*
   * ============================================================
   * NEW VERSION
   * ============================================================
   */

  @Post(
    'versions/:publicId',
  )
  @OrganizationRoles(
    'CREATOR',
  )
  @ApiOperation({
    summary:
      'Criar draft de nova versão de um documento',

    description:
      `
Cria uma submissão NEW_VERSION para um Document Vera existente.

O Public ID do documento é preservado.

A nova versão herda os metadados lógicos do documento e passa pelo mesmo fluxo:

CREATOR → REVIEWER → APPROVER.

A versão apenas é materializada depois da aprovação final.
      `,
  })
  @ApiParam({
    name:
      'organizationId',
  })
  @ApiParam({
    name:
      'publicId',

    description:
      'Public ID Vera do documento que receberá a nova versão.',
  })
  @ApiConsumes(
    'multipart/form-data',
  )
  @ApiBody({
    schema: {
      type:
        'object',

      required: [
        'file',
      ],

      properties: {
        file: {
          type:
            'string',

          format:
            'binary',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Draft de nova versão criado.',
  })
  @ApiBadRequestResponse({
    description:
      'PDF inválido.',
  })
  @ApiNotFoundResponse({
    description:
      'Documento alvo não encontrado.',
  })
  @ApiConflictResponse({
    description:
      'Documento não pode receber nova versão ou o ficheiro já está registado.',
  })
  @ApiForbiddenResponse({
    description:
      'CREATOR necessário.',
  })
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        limits: {
          fileSize:
            10 *
            1024 *
            1024,
        },
      },
    ),
  )
  async createVersion(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'publicId',
    )
    publicId:
      string,

    @UploadedFile()
    file:
      Express.Multer.File,

    @CurrentUser()
    user:
      AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'O ficheiro PDF é obrigatório.',
      );
    }

    return this.submissionsService
      .createVersionDraft({
        file,

        organizationId,

        creatorId:
          user.id,

        publicId,
      });
  }

  /*
   * ============================================================
   * SUBMIT
   * ============================================================
   */

  @Post(
    ':submissionId/submit',
  )
  @HttpCode(
    HttpStatus.OK,
  )
  @OrganizationRoles(
    'CREATOR',
  )
  @ApiOperation({
    summary:
      'Enviar draft para revisão',
  })
  @ApiOkResponse({
    description:
      'Submissão enviada para revisão.',
  })
  @ApiConflictResponse({
    description:
      'Submissão fora de DRAFT ou nova versão já ficou desatualizada.',
  })
  submit(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'submissionId',
    )
    submissionId:
      string,

    @CurrentUser()
    user:
      AuthenticatedUser,
  ) {
    return this.submissionsService
      .submitDraft({
        organizationId,

        submissionId,

        creatorId:
          user.id,
      });
  }

  /*
   * ============================================================
   * REVIEW QUEUE
   * ============================================================
   */

  @Get(
    'pending-review',
  )
  @OrganizationRoles(
    'REVIEWER',
  )
  @ApiOperation({
    summary:
      'Listar submissões aguardando revisão',
  })
  @ApiOkResponse({
    description:
      'Fila de revisão da organização.',
  })
  listPendingReview(
    @Param(
      'organizationId',
    )
    organizationId:
      string,
  ) {
    return this.submissionsService
      .listPendingReview(
        organizationId,
      );
  }

  /*
   * ============================================================
   * APPROVAL QUEUE
   * ============================================================
   */

  @Get(
    'pending-approval',
  )
  @OrganizationRoles(
    'APPROVER',
  )
  @ApiOperation({
    summary:
      'Listar submissões aguardando aprovação final',
  })
  @ApiOkResponse({
    description:
      'Fila de aprovação final da organização.',
  })
  listPendingApproval(
    @Param(
      'organizationId',
    )
    organizationId:
      string,
  ) {
    return this.submissionApprovalService
      .listPendingApproval(
        organizationId,
      );
  }

  /*
   * ============================================================
   * INTERNAL FILE
   * ============================================================
   */

  @Get(
    ':submissionId/file',
  )
  @OrganizationRoles(
    'REVIEWER',
    'APPROVER',
  )
  @ApiOperation({
    summary:
      'Consultar ficheiro interno da submissão',
  })
  @ApiProduces(
    'application/pdf',
  )
  @ApiOkResponse({
    description:
      'PDF submetido.',
  })
  @ApiNotFoundResponse({
    description:
      'Submissão não encontrada.',
  })
  async getInternalFile(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'submissionId',
    )
    submissionId:
      string,
  ) {
    const file =
      await this.submissionsService
        .getInternalFile(
          organizationId,
          submissionId,
        );

    const safeFilename =
      file.filename
        .replace(
          /["\r\n]/g,
          '_',
        );

    return new StreamableFile(
      file.body,
      {
        type:
          file.contentType,

        disposition:
          `inline; filename="${safeFilename}"`,

        length:
          file.body.length,
      },
    );
  }

  /*
   * ============================================================
   * REVIEW
   * ============================================================
   */

  @Post(
    ':submissionId/review',
  )
  @HttpCode(
    HttpStatus.OK,
  )
  @OrganizationRoles(
    'REVIEWER',
  )
  @ApiOperation({
    summary:
      'Decidir primeira revisão',
  })
  @ApiOkResponse({
    description:
      'Decisão de revisão registada.',
  })
  @ApiBadRequestResponse({
    description:
      'REJECTED sem motivo.',
  })
  @ApiConflictResponse({
    description:
      'Submissão fora de PENDING_REVIEW ou nova versão desatualizada.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'REVIEWER necessário.',
  })
  @ApiNotFoundResponse({
    description:
      'Submissão ou documento alvo não encontrado.',
  })
  review(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'submissionId',
    )
    submissionId:
      string,

    @Body()
    input:
      ReviewSubmissionDto,

    @CurrentUser()
    user:
      AuthenticatedUser,
  ) {
    return this.submissionsService
      .review({
        organizationId,

        submissionId,

        reviewerId:
          user.id,

        decision:
          input.decision,

        reason:
          input.reason,
      });
  }

  /*
   * ============================================================
   * FINAL APPROVAL
   * ============================================================
   */

  @Post(
    ':submissionId/approval',
  )
  @HttpCode(
    HttpStatus.OK,
  )
  @OrganizationRoles(
    'APPROVER',
  )
  @ApiOperation({
    summary:
      'Decidir aprovação final',

    description:
      `
APPROVED executa a emissão oficial correspondente ao tipo da submissão.

NEW_DOCUMENT cria:

- Document;
- DocumentVersion v1;
- Attestation;
- QR Proof;
- evento lifecycle REGISTERED.

NEW_VERSION cria:

- nova DocumentVersion no mesmo Public ID;
- nova Attestation;
- novo QR Proof.

Ambos preservam o workflow CREATOR → REVIEWER → APPROVER.

REJECTED encerra a submissão sem emitir documento ou versão.
      `,
  })
  @ApiOkResponse({
    description:
      'Decisão final registada.',
  })
  @ApiBadRequestResponse({
    description:
      'REJECTED sem motivo.',
  })
  @ApiConflictResponse({
    description:
      'Submissão fora de PENDING_APPROVAL, sem revisão aprovada ou versão-base desatualizada.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'APPROVER necessário.',
  })
  @ApiNotFoundResponse({
    description:
      'Submissão ou documento alvo não encontrado.',
  })
  approve(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'submissionId',
    )
    submissionId:
      string,

    @Body()
    input:
      DecideApprovalDto,

    @CurrentUser()
    user:
      AuthenticatedUser,
  ) {
    return this.submissionApprovalService
      .decide({
        organizationId,

        submissionId,

        approverId:
          user.id,

        decision:
          input.decision,

        reason:
          input.reason,
      });
  }
}