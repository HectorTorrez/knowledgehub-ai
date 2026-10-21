import { z } from 'zod';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'currentPassword is required')
      .max(
        PASSWORD_MAX_LENGTH,
        `currentPassword must be at most ${PASSWORD_MAX_LENGTH} characters`,
      ),
    newPassword: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `newPassword must be at least ${PASSWORD_MIN_LENGTH} characters`,
      )
      .max(
        PASSWORD_MAX_LENGTH,
        `newPassword must be at most ${PASSWORD_MAX_LENGTH} characters`,
      ),
  })
  .strict()
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'newPassword must differ from currentPassword',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
