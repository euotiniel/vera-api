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
  ReviewSubmissionDto,
} from './dto/review-submission.dto.js';

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
  ) {}

  @Post()
  @OrganizationRoles(
    'CREATOR',
  )
  @ApiOperation({
    summary:
      'Criar draft documental',
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
      'Draft criado.',
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
      'Submissão fora de DRAFT.',
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

    description:
      `
APPROVED move a submissão para PENDING_APPROVAL.

REJECTED encerra a submissão em REJECTED e exige motivo.

A decisão é persistida no histórico da submissão.
      `,
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
      'A submissão já não está em PENDING_REVIEW.',
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
      'Submissão não encontrada.',
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
}