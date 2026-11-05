import { hash } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  MembershipRole,
  PrismaClient,
} from '../src/generated/prisma/client.js';
import { PROCESSING_MAX_ATTEMPTS } from '../src/documents/processing-policy.js';
import { createVerifiedStorageKey } from '../src/documents/upload-key.js';
import { demoDocuments } from './demo-documents.js';

const DEMO_ACCOUNT = {
  email: 'demo@knowledgehub.ai',
  password: 'DemoKnowledge2026!',
  firstName: 'Demo',
  lastName: 'User',
  organizationName: 'Northwind Labs',
} as const;

const ARGON2ID = 2 as Algorithm;

const DEMO_MEMBERS = [
  {
    email: 'maya.chen@northwind.example',
    firstName: 'Maya',
    lastName: 'Chen',
    role: MembershipRole.ADMIN,
  },
  {
    email: 'alex.rivera@northwind.example',
    firstName: 'Alex',
    lastName: 'Rivera',
    role: MembershipRole.MEMBER,
  },
  {
    email: 'sam.patel@northwind.example',
    firstName: 'Sam',
    lastName: 'Patel',
    role: MembershipRole.VIEWER,
  },
] as const;

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
        emailVerifiedAt: new Date(),
      },
      create: {
        email: DEMO_ACCOUNT.email,
        passwordHash,
        firstName: DEMO_ACCOUNT.firstName,
        lastName: DEMO_ACCOUNT.lastName,
        emailVerifiedAt: new Date(),
      },
    });

    const membership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        role: MembershipRole.OWNER,
        organization: { name: DEMO_ACCOUNT.organizationName },
      },
      select: { organizationId: true },
    });

    const organizationId =
      membership?.organizationId ??
      (
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
        })
      ).id;

    await seedMembers(prisma, organizationId);
    await seedDocuments(prisma, organizationId, user.id);

    console.log(`Demo account ready: ${DEMO_ACCOUNT.email}`);
    console.log(`Password: ${DEMO_ACCOUNT.password}`);
  } finally {
    await prisma.$disconnect();
  }
}

function demoId(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function seedMembers(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  for (const member of DEMO_MEMBERS) {
    const id = demoId(`knowledgehub-demo-user:${member.email}`);
    const existing = await prisma.user.findUnique({
      where: { email: member.email },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      throw new Error(
        `Cannot seed ${member.email}: email belongs to another user`,
      );
    }
    if (!existing) {
      await prisma.user.create({
        data: {
          id,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          passwordHash: await hash(randomUUID(), ARGON2_OPTIONS),
          emailVerifiedAt: new Date(),
        },
      });
    }
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: id, organizationId } },
      create: { userId: id, organizationId, role: member.role },
      update: {},
    });
  }
}

async function seedDocuments(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const {
    STORAGE_BUCKET,
    STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY,
  } = process.env;
  if (
    !STORAGE_BUCKET ||
    !STORAGE_ENDPOINT ||
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_SECRET_ACCESS_KEY
  ) {
    console.warn('Demo documents skipped: object storage is not configured.');
    return;
  }
  const storage = new S3Client({
    endpoint: STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'auto',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: STORAGE_ACCESS_KEY_ID,
      secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
    },
  });
  try {
    for (const document of demoDocuments) {
      const id = demoId(
        `knowledgehub-demo-document:${organizationId}:${document.slug}`,
      );
      if (
        await prisma.document.findUnique({
          where: { id },
          select: { id: true },
        })
      )
        continue;
      const key = createVerifiedStorageKey(organizationId, id);
      const body = Buffer.from(document.content, 'utf8');
      await storage.send(
        new PutObjectCommand({
          Bucket: STORAGE_BUCKET,
          Key: key,
          Body: body,
          ContentType: 'text/markdown',
        }),
      );
      await prisma.document.create({
        data: {
          id,
          organizationId,
          uploadedById: userId,
          title: document.title,
          status: 'PROCESSING',
          generation: 1,
          storageKey: key,
          originalFileName: `${document.slug}.md`,
          contentType: 'text/markdown',
          sizeBytes: body.length,
          processingJobs: {
            create: {
              organizationId,
              documentGeneration: 1,
              verifiedStorageKey: key,
              maxAttempts: PROCESSING_MAX_ATTEMPTS,
            },
          },
        },
      });
    }
  } finally {
    storage.destroy();
  }
}

await main();
