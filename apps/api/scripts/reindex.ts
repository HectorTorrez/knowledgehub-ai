import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReindexService } from '../src/processing/reindex.service.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let organizationId: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true;
    else if (
      args[i] === '--organization' &&
      args[i + 1] &&
      !args[i + 1]?.startsWith('--')
    )
      organizationId = args[++i];
    else throw new Error(`Invalid argument: ${args[i]}`);
  }
  const prisma = new PrismaService(new ConfigService());
  try {
    const count = await new ReindexService(prisma).run({
      organizationId,
      dryRun,
    });
    console.log(count);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
