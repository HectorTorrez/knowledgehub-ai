import { z } from 'zod';

const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 100;
export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const QUESTION_MAX_LENGTH = 2000;
export const SEARCH_QUERY_MAX_LENGTH = 2000;
export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;

export function isAllowedUploadContentType(value: string): boolean {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

const email = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters.`)
  .pipe(z.email('Enter a valid email address.'));

export const loginFormSchema = z.object({
  email,
  password: z
    .string()
    .min(1, 'Password is required.')
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
});

export const registerFormSchema = z.object({
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required.')
    .max(NAME_MAX_LENGTH, `First name must be at most ${NAME_MAX_LENGTH} characters.`),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required.')
    .max(NAME_MAX_LENGTH, `Last name must be at most ${NAME_MAX_LENGTH} characters.`),
});

export const organizationNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Organization name is required.')
    .max(NAME_MAX_LENGTH, `Organization name must be at most ${NAME_MAX_LENGTH} characters.`),
});

export const memberEmailSchema = z.object({
  email,
});

export const questionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Enter a question.')
    .max(
      QUESTION_MAX_LENGTH,
      `Questions must be at most ${QUESTION_MAX_LENGTH} characters.`,
    ),
});

export const documentTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'A title is required.')
    .max(
      DOCUMENT_TITLE_MAX_LENGTH,
      `Title must be at most ${DOCUMENT_TITLE_MAX_LENGTH} characters.`,
    ),
});

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Enter a search query.')
    .max(
      SEARCH_QUERY_MAX_LENGTH,
      `Search queries must be at most ${SEARCH_QUERY_MAX_LENGTH} characters.`,
    ),
});

export type LoginForm = z.infer<typeof loginFormSchema>;
export type RegisterForm = z.infer<typeof registerFormSchema>;
export type OrganizationNameForm = z.infer<typeof organizationNameSchema>;
export type MemberEmailForm = z.infer<typeof memberEmailSchema>;
export type QuestionForm = z.infer<typeof questionSchema>;
