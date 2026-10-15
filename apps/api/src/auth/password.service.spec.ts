import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();
  const plaintext = 'correct horse battery staple';

  it('produces an Argon2id hash, never the plaintext', async () => {
    const hash = await passwords.hash(plaintext);

    expect(hash).not.toBe(plaintext);
    expect(hash).not.toContain(plaintext);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('encodes the configured Argon2id parameters', async () => {
    const hash = await passwords.hash(plaintext);

    expect(hash).toContain('$argon2id$v=19$m=19456,t=2,p=1$');
  });

  it('uses a random salt so identical passwords hash differently', async () => {
    const first = await passwords.hash(plaintext);
    const second = await passwords.hash(plaintext);

    expect(first).not.toBe(second);
  });

  it('verifies the correct password and rejects the wrong one', async () => {
    const hash = await passwords.hash(plaintext);

    await expect(passwords.verify(hash, plaintext)).resolves.toBe(true);
    await expect(passwords.verify(hash, `${plaintext}!`)).resolves.toBe(false);
  });

  it('does not accept a trimmed variant when the password has padding', async () => {
    const padded = '  padded passphrase  ';
    const hash = await passwords.hash(padded);

    await expect(passwords.verify(hash, padded)).resolves.toBe(true);
    await expect(passwords.verify(hash, padded.trim())).resolves.toBe(false);
  });
});
