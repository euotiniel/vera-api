import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  JwtService,
} from '@nestjs/jwt';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import type {
  AccessTokenPayload,
  AuthenticatedRequest,
  SystemRoleValue,
} from './auth.types.js';

@Injectable()
export class AccessTokenGuard
  implements CanActivate
{
  private readonly accessTokenSecret:
    string;

  constructor(
    private readonly jwtService:
      JwtService,

    private readonly configService:
      ConfigService,

    private readonly prisma:
      PrismaService,
  ) {
    const secret =
      this.configService
        .get<string>(
          'AUTH_ACCESS_TOKEN_SECRET',
        )
        ?.trim();

    if (
      !secret ||
      secret.length < 32
    ) {
      throw new Error(
        'AUTH_ACCESS_TOKEN_SECRET must contain at least 32 characters',
      );
    }

    this.accessTokenSecret =
      secret;
  }

  async canActivate(
    context:
      ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<
          AuthenticatedRequest
        >();

    const authorization =
      request.headers
        .authorization;

    if (!authorization) {
      throw new UnauthorizedException(
        'Token de acesso obrigatório.',
      );
    }

    const [
      scheme,
      token,
    ] =
      authorization
        .split(' ');

    if (
      scheme !== 'Bearer' ||
      !token
    ) {
      throw new UnauthorizedException(
        'Token de acesso inválido.',
      );
    }

    let payload:
      AccessTokenPayload;

    try {
      payload =
        await this.jwtService
          .verifyAsync<
            AccessTokenPayload
          >(
            token,
            {
              secret:
                this.accessTokenSecret,

              algorithms: [
                'HS256',
              ],
            },
          );
    } catch {
      throw new UnauthorizedException(
        'Token de acesso inválido ou expirado.',
      );
    }

    if (
      payload.type !==
        'access' ||
      typeof payload.sub !==
        'string' ||
      typeof payload.sid !==
        'string'
    ) {
      throw new UnauthorizedException(
        'Token de acesso inválido.',
      );
    }

    /*
     * Não confiamos em role dentro
     * do JWT.
     *
     * Consultamos a sessão + User
     * atuais na DB em cada request
     * autenticada.
     *
     * Assim:
     *
     * - suspensão é imediata;
     * - logout é imediato;
     * - mudança de role é imediata.
     */
    const session =
      await this.prisma.session
        .findUnique({
          where: {
            id:
              payload.sid,
          },

          include: {
            user:
              true,
          },
        });

    if (
      !session ||
      session.userId !==
        payload.sub ||
      session.revokedAt !==
        null ||
      session.expiresAt <=
        new Date() ||
      session.user.status !==
        'ACTIVE'
    ) {
      throw new UnauthorizedException(
        'A sessão já não é válida.',
      );
    }

    request.user = {
      id:
        session.user.id,

      email:
        session.user.email,

      name:
        session.user.name,

      status:
        'ACTIVE',

      systemRole:
        session.user
          .systemRole as
          SystemRoleValue,

      sessionId:
        session.id,
    };

    return true;
  }
}