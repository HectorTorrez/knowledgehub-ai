import { hash, verify } from '@node-rs/argon2';
import type { Algorithm, Options } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

// Argon2id is numeric value 2. It is written as a literal and asserted to the
// type because the library declares `Algorithm` as an ambient `const enum`,
// which cannot be referenced as a value when `isolatedModules` is enabled.
const ARGON2ID = 2 as Algorithm;

/**
 * OWASP-recommended Argon2id parameters: 19 MiB memory, 2 iterations, 1 lane.
 * The parameters are encoded into the hash string, so verification does not
 * need them.
 */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} satisfies Options;

/** Hashes and verifies passwords with Argon2id. Never handles plaintext at rest. */
@Injectable()
export class PasswordService {
  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    return verify(passwordHash, plainPassword);
  }
}
