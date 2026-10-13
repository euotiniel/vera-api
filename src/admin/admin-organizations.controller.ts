import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBadRequestResponse,
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

import type {
  AuthenticatedRequest,
} from '../auth/auth.types.js';

import {
  SystemRoleGuard,
} from '../auth/system-role.guard.js';

import {
  SystemRoles,
} from '../auth/system-roles.decorator.js';

import {
  AdminOrganizationsService,
} from './admin-organizations.service.js';

import {
  UpdateOrganizationVerificationStatusDto,
} from './dto/update-organization-verification-status.dto.js';

@ApiTags('Admin')
@ApiBearerAuth(
  'access-token',
)
@Controller(
  'admin/organizations',
)
@UseGuards(
  AccessTokenGuard,
  SystemRoleGuard,
)
@SystemRoles(
  'PLATFORM_ADMIN',
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
export class AdminOrganizationsController {
  constructor(
    private readonly adminOrganizationsService:
      AdminOrganizationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar organizações',
  })
  @ApiOkResponse({
    description:
      'Organizações provisionadas na Vera e respetivo estado de confiança.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas PLATFORM_ADMIN pode consultar organizações.',
  })
  list() {
    return this
      .adminOrganizationsService
      .listOrganizations();
  }

  @Get(
    ':organizationId/verification',
  )
  @ApiOperation({
    summary:
      'Consultar confiança de um emissor',
  })
  @ApiParam({
    name:
      'organizationId',

    description:
      'ID da organização.',
  })
  @ApiOkResponse({
    description:
      'Estado atual e histórico administrativo de confiança.',
  })
  @ApiNotFoundResponse({
    description:
      'Organização não encontrada.',
  })
  getVerification(
    @Param(
      'organizationId',
    )
    organizationId:
      string,
  ) {
    return this
      .adminOrganizationsService
      .getVerification(
        organizationId,
      );
  }

  @Patch(
    ':organizationId/verification',
  )
  @ApiOperation({
    summary:
      'Alterar estado de confiança de um emissor',
    description:
      'Controla se uma organização está PENDING, VERIFIED, SUSPENDED ou REVOKED. Apenas PLATFORM_ADMIN pode executar esta operação.',
  })
  @ApiParam({
    name:
      'organizationId',

    description:
      'ID da organização.',
  })
  @ApiOkResponse({
    description:
      'Estado de confiança alterado.',
  })
  @ApiBadRequestResponse({
    description:
      'Dados inválidos ou motivo obrigatório ausente.',
  })
  @ApiConflictResponse({
    description:
      'Transição de estado inválida ou concorrente.',
  })
  @ApiNotFoundResponse({
    description:
      'Organização não encontrada.',
  })
  updateVerification(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Req()
    request:
      AuthenticatedRequest,

    @Body()
    input:
      UpdateOrganizationVerificationStatusDto,
  ) {
    return this
      .adminOrganizationsService
      .setVerificationStatus({
        organizationId,

        actorId:
          request.user!.id,

        status:
          input.status,

        reason:
          input.reason,
      });
  }
}