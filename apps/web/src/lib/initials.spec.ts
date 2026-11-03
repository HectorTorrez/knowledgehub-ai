import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('uses the first character of each trimmed name', () => {
    expect(initials(' Ada ', ' Lovelace ')).toBe('AL');
  });

  it('handles missing names and Unicode characters', () => {
    expect(initials('', 'éclair')).toBe('É');
    expect(initials('😀', '')).toBe('😀');
  });
});
