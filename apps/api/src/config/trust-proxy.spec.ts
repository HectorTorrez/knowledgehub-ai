import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from './trust-proxy.js';

describe('resolveTrustProxy', () => {
  it('disables proxy trust by default', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy('false')).toBe(false);
  });

  it('accepts an explicit number of trusted hops', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('3')).toBe(3);
  });

  it('rejects values that would trust every hop or are not positive integers', () => {
    for (const raw of ['true', '0', '-1', '1.5', 'edge']) {
      expect(() => resolveTrustProxy(raw)).toThrow(/TRUST_PROXY/);
    }
  });
});
