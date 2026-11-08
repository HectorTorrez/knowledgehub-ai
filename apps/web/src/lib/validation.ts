import { z } from 'zod';
import type { Translator } from '~/lib/i18n/translate';

const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 100;
export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const QUESTION_MAX_LENGTH = 2000;
export const SEARCH_QUERY_MAX_LENGTH = 2000;
export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'application/pdf',
  DOCX_CONTENT_TYPE,
  PPTX_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  'text/html',
  'text/plain',
  'text/markdown',
] as const;

export function isAllowedUploadContentType(value: string): boolean {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

function emailField(t: Translator) {
  return z
    .string()
    .trim()
    .min(
      1,
      t('validation.required', { field: t('validation.fieldNames.email') }),
    )
    .max(
      EMAIL_MAX_LENGTH,
      t('validation.tooLong', {
        field: t('validation.fieldNames.email'),
        max: EMAIL_MAX_LENGTH,
      }),
    )
    .pipe(z.email(t('validation.emailInvalid')));
}

function nameField(
  t: Translator,
  field: 'firstName' | 'lastName' | 'organizationName',
) {
  return z
    .string()
    .trim()
    .min(
      1,
      t('validation.required', { field: t(`validation.fieldNames.${field}`) }),
    )
    .max(
      NAME_MAX_LENGTH,
      t('validation.tooLong', {
        field: t(`validation.fieldNames.${field}`),
        max: NAME_MAX_LENGTH,
      }),
    );
}

export const loginFormSchema = (t: Translator) =>
  z.object({
    email: emailField(t),
    password: z
      .string()
      .min(
        1,
        t('validation.required', {
          field: t('validation.fieldNames.password'),
        }),
      )
      .max(
        PASSWORD_MAX_LENGTH,
        t('validation.passwordTooLong', { max: PASSWORD_MAX_LENGTH }),
      ),
  });

export const registerFormSchema = (t: Translator) =>
  z.object({
    email: emailField(t),
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        t('validation.passwordTooShort', { min: PASSWORD_MIN_LENGTH }),
      )
      .max(
        PASSWORD_MAX_LENGTH,
        t('validation.passwordTooLong', { max: PASSWORD_MAX_LENGTH }),
      ),
    firstName: nameField(t, 'firstName'),
    lastName: nameField(t, 'lastName'),
  });

export const forgotPasswordFormSchema = (t: Translator) =>
  z.object({
    email: emailField(t),
  });

export const resetPasswordFormSchema = (t: Translator) =>
  z
    .object({
      password: z
        .string()
        .min(
          PASSWORD_MIN_LENGTH,
          t('validation.passwordTooShort', { min: PASSWORD_MIN_LENGTH }),
        )
        .max(
          PASSWORD_MAX_LENGTH,
          t('validation.passwordTooLong', { max: PASSWORD_MAX_LENGTH }),
        ),
      confirmPassword: z
        .string()
        .min(1, t('validation.confirmPasswordRequired')),
    })
    .refine((value) => value.password === value.confirmPassword, {
      message: t('validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });

export const profileFormSchema = (t: Translator) =>
  z.object({
    firstName: nameField(t, 'firstName'),
    lastName: nameField(t, 'lastName'),
  });

export const changePasswordFormSchema = (t: Translator) =>
  z
    .object({
      currentPassword: z
        .string()
        .min(1, t('validation.currentPasswordRequired')),
      newPassword: z
        .string()
        .min(
          PASSWORD_MIN_LENGTH,
          t('validation.newPasswordTooShort', { min: PASSWORD_MIN_LENGTH }),
        )
        .max(
          PASSWORD_MAX_LENGTH,
          t('validation.newPasswordTooLong', { max: PASSWORD_MAX_LENGTH }),
        ),
      confirmPassword: z
        .string()
        .min(1, t('validation.confirmPasswordRequired')),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      message: t('validation.passwordsMismatch'),
      path: ['confirmPassword'],
    })
    .refine((value) => value.newPassword !== value.currentPassword, {
      message: t('validation.passwordUnchanged'),
      path: ['newPassword'],
    });

export const organizationNameSchema = (t: Translator) =>
  z.object({
    name: nameField(t, 'organizationName'),
  });

export const memberEmailSchema = (t: Translator) =>
  z.object({
    email: emailField(t),
  });

export const questionSchema = (t: Translator) =>
  z.object({
    question: z
      .string()
      .trim()
      .min(1, t('validation.questionRequired'))
      .max(
        QUESTION_MAX_LENGTH,
        t('validation.tooLong', {
          field: t('validation.fieldNames.question'),
          max: QUESTION_MAX_LENGTH,
        }),
      ),
  });

export const documentTitleSchema = (t: Translator) =>
  z.object({
    title: z
      .string()
      .trim()
      .min(1, t('validation.titleRequired'))
      .max(
        DOCUMENT_TITLE_MAX_LENGTH,
        t('validation.tooLong', {
          field: t('validation.fieldNames.title'),
          max: DOCUMENT_TITLE_MAX_LENGTH,
        }),
      ),
  });

export const searchQuerySchema = (t: Translator) =>
  z.object({
    q: z
      .string()
      .trim()
      .min(1, t('validation.searchRequired'))
      .max(
        SEARCH_QUERY_MAX_LENGTH,
        t('validation.tooLong', {
          field: t('validation.fieldNames.searchQuery'),
          max: SEARCH_QUERY_MAX_LENGTH,
        }),
      ),
  });

export type LoginForm = z.infer<ReturnType<typeof loginFormSchema>>;
export const inviteSignupFormSchema = (t: Translator) =>
  registerFormSchema(t).omit({ email: true });

export type RegisterForm = z.infer<ReturnType<typeof registerFormSchema>>;
export type OrganizationNameForm = z.infer<
  ReturnType<typeof organizationNameSchema>
>;
export type MemberEmailForm = z.infer<ReturnType<typeof memberEmailSchema>>;
export type QuestionForm = z.infer<ReturnType<typeof questionSchema>>;
