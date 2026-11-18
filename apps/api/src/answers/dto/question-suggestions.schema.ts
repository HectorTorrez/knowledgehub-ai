import { z } from 'zod';

export const questionSuggestionsSchema = z
  .object({ locale: z.enum(['en', 'es']).default('en') })
  .strict();

export type QuestionSuggestionsInput = z.infer<
  typeof questionSuggestionsSchema
>;
