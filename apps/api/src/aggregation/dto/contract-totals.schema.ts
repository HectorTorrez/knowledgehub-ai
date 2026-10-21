import { z } from 'zod';

export const CONTRACT_TOTALS_DEFAULT_LIMIT = 50;

export const CONTRACT_TOTALS_MAX_LIMIT = 200;

export const contractTotalsSchema = z
  .object({
    documentId: z.uuid('documentId must be a UUID').optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code')
      .optional(),
    limit: z.coerce
      .number()
      .int('limit must be a whole number')
      .min(1, 'limit must be at least 1')
      .max(
        CONTRACT_TOTALS_MAX_LIMIT,
        `limit must be at most ${CONTRACT_TOTALS_MAX_LIMIT}`,
      )
      .default(CONTRACT_TOTALS_DEFAULT_LIMIT),
    offset: z.coerce
      .number()
      .int('offset must be a whole number')
      .min(0, 'offset must not be negative')
      .default(0),
  })
  .strict();

export type ContractTotalsInput = z.infer<typeof contractTotalsSchema>;
