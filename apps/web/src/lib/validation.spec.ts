import { describe, expect, it } from 'vitest';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  documentTitleSchema,
  isAllowedUploadContentType,
  loginFormSchema,
  memberEmailSchema,
  organizationNameSchema,
  questionSchema,
  registerFormSchema,
} from './validation';

describe('registerFormSchema', () => {
  const valid = {
    email: 'hector@example.com',
    password: 'correct-horse-battery',
    firstName: 'Hector',
    lastName: 'Torrez',
  };

  it('accepts a valid registration', () => {
    expect(registerFormSchema.safeParse(valid).success).toBe(true);
  });

  it('trims the name fields', () => {
    const result = registerFormSchema.parse({
      ...valid,
      firstName: '  Hector  ',
    });

    expect(result.firstName).toBe('Hector');
  });

  it('rejects a password shorter than 12 characters', () => {
    expect(
      registerFormSchema.safeParse({ ...valid, password: 'short' }).success,
    ).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(
      registerFormSchema.safeParse({ ...valid, email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('rejects an empty first name', () => {
    expect(
      registerFormSchema.safeParse({ ...valid, firstName: '   ' }).success,
    ).toBe(false);
  });
});

describe('loginFormSchema', () => {
  it('requires a password', () => {
    const result = loginFormSchema.safeParse({
      email: 'hector@example.com',
      password: '',
    });

    expect(result.success).toBe(false);
  });

  it('accepts any non-empty password, matching the API contract', () => {
    const result = loginFormSchema.safeParse({
      email: 'hector@example.com',
      password: 'x',
    });

    expect(result.success).toBe(true);
  });
});

describe('organizationNameSchema', () => {
  it('rejects a blank name', () => {
    expect(organizationNameSchema.safeParse({ name: '  ' }).success).toBe(false);
  });
});

describe('memberEmailSchema', () => {
  it('requires a valid email', () => {
    expect(memberEmailSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('questionSchema', () => {
  it('rejects a blank question', () => {
    expect(questionSchema.safeParse({ question: '   ' }).success).toBe(false);
  });

  it('trims the question', () => {
    expect(questionSchema.parse({ question: '  Why?  ' }).question).toBe('Why?');
  });
});

describe('documentTitleSchema', () => {
  it('accepts a 200 character title, matching the API limit', () => {
    expect(documentTitleSchema.safeParse({ title: 'a'.repeat(200) }).success).toBe(true);
  });

  it('rejects a 201 character title', () => {
    expect(documentTitleSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('loginFormSchema password bounds', () => {
  it('rejects a password longer than 128 characters', () => {
    const result = loginFormSchema.safeParse({
      email: 'hector@example.com',
      password: 'a'.repeat(129),
    });

    expect(result.success).toBe(false);
  });
});

describe('isAllowedUploadContentType', () => {
  it('accepts the content types the API allows', () => {
    for (const contentType of ALLOWED_UPLOAD_CONTENT_TYPES) {
      expect(isAllowedUploadContentType(contentType)).toBe(true);
    }
  });

  it('rejects anything else, including an empty type', () => {
    expect(isAllowedUploadContentType('image/png')).toBe(false);
    expect(isAllowedUploadContentType('')).toBe(false);
  });
});
