import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The value is read directly rather than through Prisma's `env()` helper so that
// codegen-only commands like `prisma generate` keep working even when the
// variable is not set.
const envPath = new URL('.env', import.meta.url);

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
