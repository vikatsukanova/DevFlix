import { describe, expect, it } from 'vitest';
import { isPreferredRegion } from './region';

describe('isPreferredRegion', () => {
  it('keeps creators in the preferred countries and creators with no country', () => {
    for (const c of ['US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'us', undefined]) expect(isPreferredRegion(c)).toBe(true);
  });
  it('drops creators who list a country outside the preference list', () => {
    for (const c of ['IN', 'PK', 'DE', 'BR']) expect(isPreferredRegion(c)).toBe(false);
  });
});
