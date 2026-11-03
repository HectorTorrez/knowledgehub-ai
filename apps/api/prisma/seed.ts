import { hash } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { existsSync } from 'node:fs';
import {
  MembershipRole,
  PrismaClient,
} from '../src/generated/prisma/client.js';

const DEMO_ACCOUNT = {
  email: 'demo@knowledgehub.ai',
  password: 'DemoKnowledge2026!',
  firstName: 'Demo',
  lastName: 'User',
  organizationName: 'Northwind Labs',
} as const;

const ARGON2ID = 2 as Algorithm;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const envFile = new URL('../.env', import.meta.url);

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const passwordHash = await hash(DEMO_ACCOUNT.password, ARGON2_OPTIONS);

    const user = await prisma.user.upsert({
      where: { email: DEMO_ACCOUNT.email },
      update: {
        passwordHash,
        firstName: DEMO_ACCOUNT.firstName,
        lastName: DEMO_ACCOUNT.lastName,
      },
      create: {
        email: DEMO_ACCOUNT.email,
        passwordHash,
        firstName: DEMO_ACCOUNT.firstName,
        lastName: DEMO_ACCOUNT.lastName,
      },
    });

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, role: MembershipRole.OWNER },
      select: { id: true },
    });

    if (!membership) {
      await prisma.organization.create({
        data: {
          name: DEMO_ACCOUNT.organizationName,
          memberships: {
            create: {
              userId: user.id,
              role: MembershipRole.OWNER,
            },
          },
        },
      });
    }

    console.log(`Demo account ready: ${DEMO_ACCOUNT.email}`);
    console.log(`Password: ${DEMO_ACCOUNT.password}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
