import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AccessTokenGuard,
} from './access-token.guard.js';

import {
  AuthService,
} from './auth.service.js';

import {
  CurrentUser,
} from './current-user.decorator.js';

import {
  LoginDto,
} from './dto/login.dto.js';

import {
  RefreshDto,
} from './dto/refresh.dto.js';

import type {
  AuthenticatedUser,
} from './auth.types.js';

@ApiTags('Auth')
@Controller('auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuthController {
  constructor(
    private readonly authService:
      AuthService,
  ) {}

  @Post('login')
  @HttpCode(
    HttpStatus.OK,
  )
  @ApiOperation({
    summary:
      'Iniciar sessão',
    description:
      'Autentica um utilizador previamente provisionado pela Vera.',
  })
  @ApiOkResponse({
    description:
      'Credenciais válidas e sessão criada.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Credenciais inválidas ou conta indisponível.',
  })
  login(
    @Body()
    input:
      LoginDto,
  ) {
    return this.authService
      .login(
        input,
      );
  }

  @Post('refresh')
  @HttpCode(
    HttpStatus.OK,
  )
  @ApiOperation({
    summary:
      'Renovar sessão',
    description:
      'Emite um novo access token e roda obrigatoriamente o refresh token.',
  })
  @ApiOkResponse({
    description:
      'Access token e refresh token renovados.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token inválido, revogado ou expirado.',
  })
  refresh(
    @Body()
    input:
      RefreshDto,
  ) {
    return this.authService
      .refresh(
        input,
      );
  }

  @Post('logout')
  @HttpCode(
    HttpStatus.OK,
  )
  @ApiOperation({
    summary:
      'Terminar sessão',
    description:
      'Revoga a sessão associada ao refresh token.',
  })
  @ApiOkResponse({
    description:
      'Sessão terminada.',
  })
  logout(
    @Body()
    input:
      RefreshDto,
  ) {
    return this.authService
      .logout(
        input,
      );
  }

  @Get('me')
  @UseGuards(
    AccessTokenGuard,
  )
  @ApiBearerAuth(
    'access-token',
  )
  @ApiOperation({
    summary:
      'Obter utilizador autenticado',
  })
  @ApiOkResponse({
    description:
      'Identidade e role atual do utilizador autenticado.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Access token ausente, inválido, expirado ou sessão revogada.',
  })
  me(
    @CurrentUser()
    user:
      AuthenticatedUser,
  ) {
    return {
      user,
    };
  }
}