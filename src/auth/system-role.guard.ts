import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import {
  Reflector,
} from '@nestjs/core';

import type {
  AuthenticatedRequest,
  SystemRoleValue,
} from './auth.types.js';

import {
  SYSTEM_ROLES_KEY,
} from './system-roles.decorator.js';

@Injectable()
export class SystemRoleGuard
  implements CanActivate
{
  constructor(
    private readonly reflector:
      Reflector,
  ) {}

  canActivate(
    context:
      ExecutionContext,
  ): boolean {
    const requiredRoles =
      this.reflector
        .getAllAndOverride<
          SystemRoleValue[]
        >(
          SYSTEM_ROLES_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    /*
     * Endpoint sem @SystemRoles(...)
     * não precisa de role de plataforma.
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

    if (
      !request.user ||
      !requiredRoles.includes(
        request.user
          .systemRole,
      )
    ) {
      throw new ForbiddenException(
        'Não possui permissão para executar esta operação.',
      );
    }

    return true;
  }
}