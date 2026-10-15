import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { AuthConfig } from './auth.config.js';
import { TokenService } from './token.service.js';

const ACCESS_TTL_MS = 900_000;
const REFRESH_TTL_MS = 7 * 86_400_000;

function buildService(secret = 's'.repeat(48)) {
  const jwt = new JwtService({});
  const authConfig = {
    accessSecret: secret,
    accessTtlMs: ACCESS_TTL_MS,
    refreshTtlMs: REFRESH_TTL_MS,
  } as unknown as AuthConfig;

  return { service: new TokenService(jwt, authConfig), jwt, secret };
}

describe('TokenService', () => {
  it('signs and verifies an access token carrying sub and sid', async () => {
    const { service } = buildService();

    const token = await service.signAccessToken('user-1', 'session-1');
    const payload = await service.verifyAccessToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe('session-1');
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect(payload.exp! - payload.iat!).toBe(ACCESS_TTL_MS / 1000);
  });

  it('rejects a tampered token', async () => {
    const { service } = buildService();
    const token = await service.signAccessToken('user-1', 'session-1');

    await expect(
      service.verifyAccessToken(`${token.slice(0, -2)}xx`),
    ).rejects.toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const { service, jwt } = buildService();
    const foreign = jwt.sign(
      { sub: 'user-1', sid: 'session-1' },
      { secret: 'an-entirely-different-secret-value', expiresIn: 900 },
    );

    await expect(service.verifyAccessToken(foreign)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { service, jwt, secret } = buildService();
    const expired = jwt.sign(
      { sub: 'user-1', sid: 'session-1' },
      { secret, expiresIn: -10 },
    );

    await expect(service.verifyAccessToken(expired)).rejects.toThrow();
  });

  it('rejects a token missing the session claim', async () => {
    const { service, jwt, secret } = buildService();
    const incomplete = jwt.sign({ sub: 'user-1' }, { secret, expiresIn: 900 });

    await expect(service.verifyAccessToken(incomplete)).rejects.toThrow();
  });

  it('generates an opaque, high-entropy refresh token with only its hash persisted', () => {
    const { service } = buildService();
    const before = Date.now();

    const generated = service.generateRefreshToken();

    expect(generated.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.hash).not.toBe(generated.token);
    expect(generated.hash).toBe(service.hashRefreshToken(generated.token));
    expect(generated.expiresAt.getTime()).toBeGreaterThan(before);
    expect(generated.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + REFRESH_TTL_MS,
    );
  });

  it('generates a distinct token on each call', () => {
    const { service } = buildService();
    expect(service.generateRefreshToken().token).not.toBe(
      service.generateRefreshToken().token,
    );
  });

  it('hashes refresh tokens deterministically with SHA-256', () => {
    const { service } = buildService();
    const token = 'some-opaque-refresh-token';

    expect(service.hashRefreshToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });
});
