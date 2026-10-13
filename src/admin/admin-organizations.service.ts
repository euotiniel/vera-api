import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

type VerificationStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'SUSPENDED'
  | 'REVOKED';

interface SetVerificationStatusInput {
  organizationId:
    string;

  actorId:
    string;

  status:
    Exclude<
      VerificationStatus,
      'PENDING'
    >;

  reason?:
    string;
}

@Injectable()
export class AdminOrganizationsService {
  private readonly allowedTransitions:
    Record<
      VerificationStatus,
      VerificationStatus[]
    > = {
      PENDING: [
        'VERIFIED',
      ],

      VERIFIED: [
        'SUSPENDED',
        'REVOKED',
      ],

      SUSPENDED: [
        'VERIFIED',
        'REVOKED',
      ],

      REVOKED: [],
    };

  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async listOrganizations() {
    return this.prisma
      .organization
      .findMany({
        select: {
          id:
            true,

          name:
            true,

          slug:
            true,

          verified:
            true,

          verificationStatus:
            true,

          createdAt:
            true,

          updatedAt:
            true,

          _count: {
            select: {
              documents:
                true,

              memberships:
                true,

              submissions:
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

  async getVerification(
    organizationId:
      string,
  ) {
    const organization =
      await this.prisma
        .organization
        .findUnique({
          where: {
            id:
              organizationId.trim(),
          },

          select: {
            id:
              true,

            name:
              true,

            slug:
              true,

            verified:
              true,

            verificationStatus:
              true,

            createdAt:
              true,

            updatedAt:
              true,

            verificationEvents: {
              orderBy: {
                createdAt:
                  'desc',
              },

              select: {
                id:
                  true,

                source:
                  true,

                fromStatus:
                  true,

                toStatus:
                  true,

                reason:
                  true,

                createdAt:
                  true,

                actor: {
                  select: {
                    id:
                      true,

                    name:
                      true,

                    email:
                      true,
                  },
                },
              },
            },
          },
        });

    if (!organization) {
      throw new NotFoundException(
        'Organização não encontrada.',
      );
    }

    return organization;
  }

  async setVerificationStatus(
    input:
      SetVerificationStatusInput,
  ) {
    const organizationId =
      input.organizationId
        .trim();

    const actorId =
      input.actorId
        .trim();

    const reason =
      input.reason
        ?.trim() ||
      null;

    if (
      !organizationId
    ) {
      throw new BadRequestException(
        'organizationId é obrigatório.',
      );
    }

    if (
      !actorId
    ) {
      throw new BadRequestException(
        'actorId é obrigatório.',
      );
    }

    return this.prisma
      .$transaction(
        async (
          tx,
        ) => {
          const organization =
            await tx.organization
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

                  verified:
                    true,

                  verificationStatus:
                    true,
                },
              });

          if (!organization) {
            throw new NotFoundException(
              'Organização não encontrada.',
            );
          }

          const currentStatus =
            organization
              .verificationStatus as
              VerificationStatus;

          const nextStatus =
            input.status;

          if (
            currentStatus ===
            nextStatus
          ) {
            throw new ConflictException(
              `A organização já está em ${nextStatus}.`,
            );
          }

          if (
            !this.allowedTransitions[
              currentStatus
            ].includes(
              nextStatus,
            )
          ) {
            throw new ConflictException(
              `A transição ${currentStatus} → ${nextStatus} não é permitida.`,
            );
          }

          const requiresReason =
            nextStatus ===
              'SUSPENDED' ||
            nextStatus ===
              'REVOKED' ||
            (
              currentStatus ===
                'SUSPENDED' &&
              nextStatus ===
                'VERIFIED'
            );

          if (
            requiresReason &&
            !reason
          ) {
            throw new BadRequestException(
              'O motivo é obrigatório para esta alteração do estado de confiança.',
            );
          }

          /*
           * Bridge temporária:
           *
           * verificationStatus é a nova
           * fonte semântica.
           *
           * verified continua sincronizado
           * até todos os consumidores
           * migrarem.
           */
          const transition =
            await tx.organization
              .updateMany({
                where: {
                  id:
                    organization.id,

                  verificationStatus:
                    currentStatus,
                },

                data: {
                  verificationStatus:
                    nextStatus,

                  verified:
                    nextStatus ===
                    'VERIFIED',
                },
              });

          if (
            transition.count !==
            1
          ) {
            throw new ConflictException(
              'O estado da organização foi alterado por outra operação.',
            );
          }

          const event =
            await tx
              .organizationVerificationEvent
              .create({
                data: {
                  organizationId:
                    organization.id,

                  actorId,

                  source:
                    'ADMIN',

                  fromStatus:
                    currentStatus,

                  toStatus:
                    nextStatus,

                  reason,
                },

                select: {
                  id:
                    true,

                  source:
                    true,

                  fromStatus:
                    true,

                  toStatus:
                    true,

                  reason:
                    true,

                  createdAt:
                    true,

                  actor: {
                    select: {
                      id:
                        true,

                      name:
                        true,

                      email:
                        true,
                    },
                  },
                },
              });

          const updatedOrganization =
            await tx.organization
              .findUniqueOrThrow({
                where: {
                  id:
                    organization.id,
                },

                select: {
                  id:
                    true,

                  name:
                    true,

                  slug:
                    true,

                  verified:
                    true,

                  verificationStatus:
                    true,

                  createdAt:
                    true,

                  updatedAt:
                    true,
                },
              });

          return {
            organization:
              updatedOrganization,

            event,
          };
        },
      );
  }
}