import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import * as argon2 from 'argon2';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  findByEmail(
    email: string,
  ) {
    return this.prisma.user
      .findUnique({
        where: {
          email,
        },
      });
  }

  findById(
    id: string,
  ) {
    return this.prisma.user
      .findUnique({
        where: {
          id,
        },
      });
  }

  async createProvisionedUser(
    input: {
      email: string;
      name: string;
      password: string;
    },
  ) {
    const email =
      input.email
        .trim()
        .toLowerCase();

    const name =
      input.name.trim();

    const passwordHash =
      await argon2.hash(
        input.password,
        {
          type:
            argon2.argon2id,

          memoryCost:
            19456,

          timeCost:
            2,

          parallelism:
            1,
        },
      );

    try {
      return await this.prisma.user
        .create({
          data: {
            email,
            name,
            passwordHash,

            status:
              'ACTIVE',

            systemRole:
              'USER',
          },

          select: {
            id:
              true,

            email:
              true,

            name:
              true,

            status:
              true,

            systemRole:
              true,

            emailVerifiedAt:
              true,

            createdAt:
              true,

            updatedAt:
              true,
          },
        });
    } catch (
      error:
        unknown
    ) {
      if (
        this.isPrismaUniqueError(
          error,
        )
      ) {
        throw new ConflictException(
          'Já existe uma conta com este email.',
        );
      }

      throw error;
    }
  }

  listUsers() {
    return this.prisma.user
      .findMany({
        select: {
          id:
            true,

          email:
            true,

          name:
            true,

          status:
            true,

          systemRole:
            true,

          emailVerifiedAt:
            true,

          createdAt:
            true,

          updatedAt:
            true,
        },

        orderBy: {
          createdAt:
            'desc',
        },
      });
  }

  async setStatus(
    userId: string,
    status:
      | 'ACTIVE'
      | 'SUSPENDED',
  ) {
    const targetUser =
      await this.prisma.user
        .findUnique({
          where: {
            id:
              userId,
          },

          select: {
            id:
              true,

            systemRole:
              true,
          },
        });

    if (!targetUser) {
      throw new NotFoundException(
        'Utilizador não encontrado.',
      );
    }

    /*
     * Contas PLATFORM_ADMIN não são
     * administradas através desta API.
     *
     * Isso evita que um admin da plataforma
     * suspenda ou modifique outra conta
     * administrativa por acidente.
     */
    if (
      targetUser.systemRole !==
      'USER'
    ) {
      throw new ForbiddenException(
        'Contas PLATFORM_ADMIN não podem ser alteradas por este endpoint.',
      );
    }

    const now =
      new Date();

    return this.prisma
      .$transaction(
        async (
          transaction,
        ) => {
          const user =
            await transaction.user
              .update({
                where: {
                  id:
                    userId,
                },

                data: {
                  status,
                },

                select: {
                  id:
                    true,

                  email:
                    true,

                  name:
                    true,

                  status:
                    true,

                  systemRole:
                    true,

                  emailVerifiedAt:
                    true,

                  createdAt:
                    true,

                  updatedAt:
                    true,
                },
              });

          /*
           * Suspensão significa perda
           * imediata de acesso.
           *
           * Não esperamos o JWT expirar.
           */
          if (
            status ===
            'SUSPENDED'
          ) {
            await transaction.session
              .updateMany({
                where: {
                  userId,

                  revokedAt:
                    null,
                },

                data: {
                  revokedAt:
                    now,
                },
              });
          }

          return user;
        },
      );
  }

  private isPrismaUniqueError(
    error:
      unknown,
  ) {
    return (
      typeof error ===
        'object' &&
      error !==
        null &&
      'code' in error &&
      (
        error as {
          code?:
            unknown;
        }
      ).code ===
        'P2002'
    );
  }
}