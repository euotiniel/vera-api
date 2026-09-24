import 'dotenv/config';

import {
  PrismaPg,
} from '@prisma/adapter-pg';

import * as argon2
  from 'argon2';

import {
  PrismaClient,
} from '../generated/prisma/client.js';

function requireEnv(
  name: string,
): string {
  const value =
    process.env[name]
      ?.trim();

  if (!value) {
    throw new Error(
      `${name} is not defined`,
    );
  }

  return value;
}

const connectionString =
  requireEnv(
    'DATABASE_URL',
  );

const adminEmail =
  requireEnv(
    'SEED_PLATFORM_ADMIN_EMAIL',
  )
    .toLowerCase();

const adminName =
  requireEnv(
    'SEED_PLATFORM_ADMIN_NAME',
  );

const adminPassword =
  requireEnv(
    'SEED_PLATFORM_ADMIN_PASSWORD',
  );

if (
  adminPassword.length < 12
) {
  throw new Error(
    'SEED_PLATFORM_ADMIN_PASSWORD must contain at least 12 characters',
  );
}

const adapter =
  new PrismaPg({
    connectionString,
  });

const prisma =
  new PrismaClient({
    adapter,
  });

async function main() {
  /*
   * ============================================================
   * DEVELOPMENT ORGANIZATION
   * ============================================================
   *
   * verified=true ainda é temporário.
   *
   * Será substituído pelo mecanismo
   * real de confiança do emissor.
   */

  const organization =
    await prisma.organization
      .upsert({
        where: {
          slug:
            'aeucan',
        },

        update: {
          name:
            'Associação dos Estudantes da Universidade Católica de Angola',

          verified:
            true,
        },

        create: {
          name:
            'Associação dos Estudantes da Universidade Católica de Angola',

          slug:
            'aeucan',

          verified:
            true,
        },
      });

  /*
   * ============================================================
   * PLATFORM ADMIN
   * ============================================================
   *
   * A password nunca é armazenada.
   *
   * Apenas o hash Argon2id
   * é persistido.
   */

  const passwordHash =
    await argon2.hash(
      adminPassword,
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

  const platformAdmin =
    await prisma.user
      .upsert({
        where: {
          email:
            adminEmail,
        },

        update: {
          name:
            adminName,

          passwordHash,

          status:
            'ACTIVE',

          systemRole:
            'PLATFORM_ADMIN',
        },

        create: {
          email:
            adminEmail,

          name:
            adminName,

          passwordHash,

          status:
            'ACTIVE',

          systemRole:
            'PLATFORM_ADMIN',
        },
      });

  /*
   * Nunca imprimimos:
   *
   * - password
   * - passwordHash
   * - tokens
   */

  console.log(
    'Seed completed.',
  );

  console.log({
    organization: {
      id:
        organization.id,

      slug:
        organization.slug,

      verified:
        organization.verified,
    },

    platformAdmin: {
      id:
        platformAdmin.id,

      email:
        platformAdmin.email,

      name:
        platformAdmin.name,

      status:
        platformAdmin.status,

      systemRole:
        platformAdmin.systemRole,
    },
  });
}

main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error,
      );

      process.exit(1);
    },
  )
  .finally(
    async () => {
      await prisma
        .$disconnect();
    },
  );