import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const organization = await prisma.organization.upsert({
    where: {
      slug: 'aeucan',
    },
    update: {
      name: 'Associação dos Estudantes da Universidade Católica de Angola',
      verified: true,
    },
    create: {
      name: 'Associação dos Estudantes da Universidade Católica de Angola',
      slug: 'aeucan',
      verified: true,
    },
  });

  console.log('Organization created/updated:');
  console.log(organization);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });