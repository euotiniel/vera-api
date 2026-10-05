import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import {
  Reflector,
} from '@nestjs/core';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import type {
  AuthenticatedRequest,
} from '../auth/auth.types.js';

import {
  ORGANIZATION_ROLES_KEY,
} from './organization-roles.decorator.js';

import type {
  OrganizationRoleValue,
} from './organization-role.types.js';

@Injectable()
export class OrganizationRoleGuard
  implements CanActivate
{
  constructor(
    private readonly reflector:
      Reflector,

    private readonly prisma:
      PrismaService,
  ) {}

  async canActivate(
    context:
      ExecutionContext,
  ): Promise<boolean> {
    const requiredRoles =
      this.reflector
        .getAllAndOverride<
          OrganizationRoleValue[]
        >(
          ORGANIZATION_ROLES_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    /*
     * Se nenhuma role organizacional
     * foi declarada, este guard não
     * impõe nenhuma regra adicional.
     */
    if (
      !requiredRoles ||
      requiredRoles.length === 0
    ) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<
          AuthenticatedRequest
        >();

    if (!request.user) {
      throw new ForbiddenException(
        'Utilizador autenticado necessário.',
      );
    }

    /*
     * As rotas protegidas por este guard
     * devem ser explicitamente scoped
     * por organização.
     *
     * Exemplo:
     *
     * /organizations/:organizationId/submissions
     */
    const organizationId =
      request.params
        ?.organizationId;

    if (
      typeof organizationId !==
        'string' ||
      organizationId.trim()
        .length === 0
    ) {
      throw new BadRequestException(
        'organizationId é obrigatório para esta operação.',
      );
    }

    /*
     * PLATFORM_ADMIN não recebe
     * autoridade organizacional implícita.
     *
     * Poder administrativo da Vera
     * e poder operacional dentro de
     * uma organização são conceitos
     * diferentes.
     */
    if (
      request.user.systemRole !==
      'USER'
    ) {
      throw new ForbiddenException(
        'Esta conta não possui função operacional nesta organização.',
      );
    }

    const membership =
      await this.prisma
        .organizationMember
        .findUnique({
          where: {
            organizationId_userId: {
              organizationId:
                organizationId.trim(),

              userId:
                request.user.id,
            },
          },

          select: {
            id:
              true,

            role:
              true,

            user: {
              select: {
                status:
                  true,
              },
            },

            organization: {
              select: {
                id:
                  true,
              },
            },
          },
        });

    if (!membership) {
      throw new ForbiddenException(
        'O utilizador não pertence a esta organização.',
      );
    }

    if (
      membership.user.status !==
      'ACTIVE'
    ) {
      throw new ForbiddenException(
        'O utilizador não está ativo.',
      );
    }

    if (
      !requiredRoles.includes(
        membership.role as
          OrganizationRoleValue,
      )
    ) {
      throw new ForbiddenException(
        'Não possui permissão para executar esta operação nesta organização.',
      );
    }

    return true;
  }
}