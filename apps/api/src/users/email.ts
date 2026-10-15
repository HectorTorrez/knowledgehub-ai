/**
 * Canonicalizes an email address before it is stored or compared.
 *
 * Email uniqueness in the database is enforced on the normalized form (the
 * `User.email` column is `@unique`), so every write and lookup must pass through
 * this function. It applies the only normalization that is safe and lossless:
 * trimming surrounding whitespace and lower-casing. Provider-specific rules
 * (e.g. stripping dots in Gmail addresses) are intentionally not applied because
 * they are not universal and can merge distinct accounts.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
