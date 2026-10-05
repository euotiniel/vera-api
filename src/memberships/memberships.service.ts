import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import type {
  OrganizationRoleValue,
} from './organization-role.types.js';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async create(
    organizationId:
      string,

    input: {
      userId:
        string;

      role:
        OrganizationRoleValue;
    },
  ) {
    const [
      organization,
      user,
    ] =
      await Promise.all([
        this.prisma.organization
          .findUnique({
            where: {
              id:
                organizationId,
            },

            select: {
              id:
                true,

              name:
                true,

              slug:
                true,
            },
          }),

        this.prisma.user
          .findUnique({
            where: {
              id:
                input.userId,
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
            },
          }),
      ]);

    if (!organization) {
      throw new NotFoundException(
        'Organização não encontrada.',
      );
    }

    if (!user) {
      throw new NotFoundException(
        'Utilizador não encontrado.',
      );
    }

    if (
      user.systemRole ===
      'PLATFORM_ADMIN'
    ) {
      throw new ForbiddenException(
        'Contas PLATFORM_ADMIN não recebem funções organizacionais.',
      );
    }

    const existingMembership =
      await this.prisma
        .organizationMember
        .findUnique({
          where: {
            organizationId_userId: {
              organizationId,

              userId:
                input.userId,
            },
          },
        });

    if (existingMembership) {
      throw new ConflictException(
        'O utilizador já pertence a esta organização.',
      );
    }

    return this.prisma
      .organizationMember
      .create({
        data: {
          organizationId,

          userId:
            input.userId,

          role:
            input.role,
        },

        select: {
          id:
            true,

          role:
            true,

          createdAt:
            true,

          updatedAt:
            true,

          organization: {
            select: {
              id:
                true,

              name:
                true,

              slug:
                true,
            },
          },

          user: {
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
            },
          },
        },
      });
  }

  async listByOrganization(
    organizationId:
      string,
  ) {
    const organization =
      await this.prisma.organization
        .findUnique({
          where: {
            id:
              organizationId,
          },

          select: {
            id:
              true,
          },
        });

    if (!organization) {
      throw new NotFoundException(
        'Organização não encontrada.',
      );
    }

    return this.prisma
      .organizationMember
      .findMany({
        where: {
          organizationId,
        },

        select: {
          id:
            true,

          role:
            true,

          createdAt:
            true,

          updatedAt:
            true,

          user: {
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
            },
          },
        },

        orderBy: {
          createdAt:
            'asc',
        },
      });
  }

  async updateRole(
    organizationId:
      string,

    userId:
      string,

    role:
      OrganizationRoleValue,
  ) {
    const membership =
      await this.prisma
        .organizationMember
        .findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId,
            },
          },

          select: {
            id:
              true,
          },
        });

    if (!membership) {
      throw new NotFoundException(
        'Membership não encontrado.',
      );
    }

    return this.prisma
      .organizationMember
      .update({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },

        data: {
          role,
        },

        select: {
          id:
            true,

          role:
            true,

          createdAt:
            true,

          updatedAt:
            true,

          organization: {
            select: {
              id:
                true,

              name:
                true,

              slug:
                true,
            },
          },

          user: {
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
            },
          },
        },
      });
  }

  async remove(
    organizationId:
      string,

    userId:
      string,
  ) {
    const membership =
      await this.prisma
        .organizationMember
        .findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId,
            },
          },

          select: {
            id:
              true,
          },
        });

    if (!membership) {
      throw new NotFoundException(
        'Membership não encontrado.',
      );
    }

    await this.prisma
      .organizationMember
      .delete({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
      });

    return {
      success:
        true,
    };
  }

  findForUser(
    organizationId:
      string,

    userId:
      string,
  ) {
    return this.prisma
      .organizationMember
      .findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
      });
  }
}