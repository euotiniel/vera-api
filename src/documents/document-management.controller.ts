import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
  OrganizationRoleGuard,
} from '../memberships/organization-role.guard.js';

import {
  OrganizationRoles,
} from '../memberships/organization-roles.decorator.js';

import {
  DocumentStatusService,
} from './document-status.service.js';

import {
  ReplaceDocumentDto,
} from './dto/replace-document.dto.js';

@ApiTags(
  'Document Management',
)
@ApiBearerAuth(
  'access-token',
)
@Controller(
  'organizations/:organizationId/documents',
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
export class DocumentManagementController {
  constructor(
    private readonly documentStatusService:
      DocumentStatusService,
  ) {}

  @Post(
    ':publicId/replace',
  )
  @HttpCode(
    HttpStatus.OK,
  )
  @OrganizationRoles(
    'APPROVER',
  )
  @ApiOperation({
    summary:
      'Substituir um documento oficial',

    description:
      `
Associa explicitamente um Document Vera existente a outro Document Vera que passa a ser o seu sucessor.

Esta operação:

- exige que ambos pertençam à mesma organização;
- exige que ambos estejam VALID;
- impede self-replacement;
- impede ciclos;
- altera o documento original para REPLACED;
- preserva os dois Public IDs;
- cria um evento lifecycle assinado vera.lifecycle.v2 contendo o Public ID do sucessor.

Isto é diferente de criar v2/v3 do mesmo Document.
    `,
  })
  @ApiParam({
    name:
      'organizationId',

    description:
      'ID da organização emissora.',
  })
  @ApiParam({
    name:
      'publicId',

    description:
      'Public ID do documento que será substituído.',
  })
  @ApiOkResponse({
    description:
      'Documento substituído e sucessor associado.',
  })
  @ApiBadRequestResponse({
    description:
      'Pedido inválido, self-replacement ou motivo ausente.',
  })
  @ApiConflictResponse({
    description:
      'Estado inválido, lifecycle inválido, documento já substituído ou ciclo.',
  })
  @ApiNotFoundResponse({
    description:
      'Documento original ou sucessor não encontrado.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'APPROVER necessário.',
  })
  replace(
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

    @Body()
    input:
      ReplaceDocumentDto,
  ) {
    return this.documentStatusService
      .replace({
        organizationId,

        publicId,

        replacementPublicId:
          input
            .replacementPublicId,

        reason:
          input.reason,
      });
  }
}