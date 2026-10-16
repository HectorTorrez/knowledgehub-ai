import { z } from 'zod';

const ORIGINAL_FILE_NAME_MAX_LENGTH = 255;
const CONTROL_CHARACTER_PATTERN = /^[^\p{Cc}]*$/u;

export const completeUploadSchema = z
  .object({
    originalFileName: z
      .string()
      .trim()
      .min(1, 'originalFileName must not be empty')
      .max(
        ORIGINAL_FILE_NAME_MAX_LENGTH,
        `originalFileName must be at most ${ORIGINAL_FILE_NAME_MAX_LENGTH} characters`,
      )
      .regex(
        CONTROL_CHARACTER_PATTERN,
        'originalFileName must not contain control characters',
      )
      .optional(),
  })
  .strict()
  .default({});

export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
