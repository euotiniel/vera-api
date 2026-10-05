import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AccessTokenGuard,
} from '../auth/access-token.guard.js';

import {
  SystemRoleGuard,
} from '../auth/system-role.guard.js';

import {
  SystemRoles,
} from '../auth/system-roles.decorator.js';

import {
  MembershipsService,
} from '../memberships/memberships.service.js';

import {
  CreateOrganizationMemberDto,
} from './dto/create-organization-member.dto.js';

import {
  UpdateOrganizationMemberRoleDto,
} from './dto/update-organization-member-role.dto.js';

@ApiTags('Admin')
@ApiBearerAuth(
  'access-token',
)
@Controller(
  'admin/organizations/:organizationId/members',
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
export class AdminOrganizationMembersController {
  constructor(
    private readonly membershipsService:
      MembershipsService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Adicionar membro a uma organização',
  })
  @ApiCreatedResponse({
    description:
      'Membership criado.',
  })
  @ApiConflictResponse({
    description:
      'O utilizador já pertence à organização.',
  })
  @ApiNotFoundResponse({
    description:
      'Utilizador ou organização não encontrados.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas PLATFORM_ADMIN pode gerir memberships.',
  })
  create(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Body()
    input:
      CreateOrganizationMemberDto,
  ) {
    return this.membershipsService
      .create(
        organizationId,
        input,
      );
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar membros de uma organização',
  })
  @ApiOkResponse({
    description:
      'Memberships da organização.',
  })
  @ApiNotFoundResponse({
    description:
      'Organização não encontrada.',
  })
  list(
    @Param(
      'organizationId',
    )
    organizationId:
      string,
  ) {
    return this.membershipsService
      .listByOrganization(
        organizationId,
      );
  }

  @Patch(
    ':userId',
  )
  @ApiOperation({
    summary:
      'Alterar função de um membro',
  })
  @ApiOkResponse({
    description:
      'Função organizacional alterada.',
  })
  @ApiNotFoundResponse({
    description:
      'Membership não encontrado.',
  })
  updateRole(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'userId',
    )
    userId:
      string,

    @Body()
    input:
      UpdateOrganizationMemberRoleDto,
  ) {
    return this.membershipsService
      .updateRole(
        organizationId,
        userId,
        input.role,
      );
  }

  @Delete(
    ':userId',
  )
  @ApiOperation({
    summary:
      'Remover membro de uma organização',
  })
  @ApiOkResponse({
    description:
      'Membership removido.',
  })
  @ApiNotFoundResponse({
    description:
      'Membership não encontrado.',
  })
  remove(
    @Param(
      'organizationId',
    )
    organizationId:
      string,

    @Param(
      'userId',
    )
    userId:
      string,
  ) {
    return this.membershipsService
      .remove(
        organizationId,
        userId,
      );
  }
}