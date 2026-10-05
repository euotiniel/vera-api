import {
  Body,
  Controller,
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
  UsersService,
} from '../users/users.service.js';

import {
  CreateUserDto,
} from './dto/create-user.dto.js';

import {
  UpdateUserStatusDto,
} from './dto/update-user-status.dto.js';

@ApiTags('Admin')
@ApiBearerAuth(
  'access-token',
)
@Controller(
  'admin/users',
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
export class AdminUsersController {
  constructor(
    private readonly usersService:
      UsersService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Criar utilizador',
    description:
      'Cria internamente uma conta USER. A Vera não possui registo público.',
  })
  @ApiCreatedResponse({
    description:
      'Utilizador criado.',
  })
  @ApiConflictResponse({
    description:
      'Já existe uma conta com este email.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas PLATFORM_ADMIN pode criar utilizadores.',
  })
  create(
    @Body()
    input:
      CreateUserDto,
  ) {
    return this.usersService
      .createProvisionedUser(
        input,
      );
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar utilizadores',
  })
  @ApiOkResponse({
    description:
      'Lista de utilizadores da Vera.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas PLATFORM_ADMIN pode listar utilizadores.',
  })
  list() {
    return this.usersService
      .listUsers();
  }

  @Patch(
    ':id/status',
  )
  @ApiOperation({
    summary:
      'Alterar estado de um utilizador',
    description:
      'Ativa ou suspende uma conta USER. Suspender revoga imediatamente todas as sessões existentes.',
  })
  @ApiOkResponse({
    description:
      'Estado do utilizador alterado.',
  })
  @ApiNotFoundResponse({
    description:
      'Utilizador não encontrado.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas PLATFORM_ADMIN pode executar a operação. Contas PLATFORM_ADMIN também não podem ser alteradas por este endpoint.',
  })
  updateStatus(
    @Param(
      'id',
    )
    userId:
      string,

    @Body()
    input:
      UpdateUserStatusDto,
  ) {
    return this.usersService
      .setStatus(
        userId,
        input.status,
      );
  }
}