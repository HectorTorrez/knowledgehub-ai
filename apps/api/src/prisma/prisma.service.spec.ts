import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  it('retains lifecycle and unscoped access on the injected client', async () => {
    const service = new PrismaService(
      new ConfigService({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      }),
    );

    expect(service.unscoped).toBeDefined();
    expect(service.onModuleDestroy).toBeTypeOf('function');
    await service.onModuleDestroy();
  });
});
