import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
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

    description:
      `
Cria uma submissão documental em estado DRAFT.

O ficheiro é validado e armazenado, mas ainda não é um documento oficial Vera.

Nesta etapa não são emitidos:

- Public ID;
- Attestation;
- QR Proof;
- Lifecycle REGISTERED.

Apenas membros CREATOR da organização podem executar esta operação.
      `,
  })
  @ApiParam({
    name:
      'organizationId',

    description:
      'ID da organização.',
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

          description:
            'PDF original. Máximo: 10 MB.',
        },

        title: {
          type:
            'string',

          example:
            'Pedido de parceria',
        },

        type: {
          type:
            'string',

          nullable:
            true,

          example:
            'Ofício',
        },

        reference: {
          type:
            'string',

          nullable:
            true,

          example:
            '0054/2026',
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
      'Draft criado com sucesso.',
  })
  @ApiBadRequestResponse({
    description:
      'Dados inválidos ou PDF não permitido.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'O utilizador não é CREATOR desta organização.',
  })
  @ApiConflictResponse({
    description:
      'Organização não verificada, ficheiro já registado ou submissão duplicada.',
  })
  @ApiNotFoundResponse({
    description:
      'Organização não encontrada.',
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
  @OrganizationRoles(
    'CREATOR',
  )
  @ApiOperation({
    summary:
      'Enviar draft para revisão',

    description:
      'Move uma submissão do próprio CREATOR de DRAFT para PENDING_REVIEW.',
  })
  @ApiParam({
    name:
      'organizationId',

    description:
      'ID da organização.',
  })
  @ApiParam({
    name:
      'submissionId',

    description:
      'ID da submissão.',
  })
  @ApiOkResponse({
    description:
      'Submissão enviada para REVIEWER.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'O utilizador não é CREATOR da organização ou não criou esta submissão.',
  })
  @ApiConflictResponse({
    description:
      'A submissão já não está em DRAFT.',
  })
  @ApiNotFoundResponse({
    description:
      'Submissão não encontrada.',
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
}