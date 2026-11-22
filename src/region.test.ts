import { describe, expect, it } from 'vitest';
import { isPreferredRegion } from './region';
import type { Settings } from './settings';

// Every case passes its settings explicitly, so the result never depends on what is saved in this browser.
const withRegion = (creatorRegion: Settings['creatorRegion'], countries = ['US', 'CA']): Settings => ({ language: 'en', countries, creatorRegion });

describe('isPreferredRegion with "prefer" (default)', () => {
  const prefer = withRegion('prefer');
  it('keeps creators in the chosen countries, ignoring case', () => {
    for (const c of ['US', 'CA', 'us']) expect(isPreferredRegion(c, prefer)).toBe(true);
  });
  it('keeps creators who list no country', () => {
    expect(isPreferredRegion(undefined, prefer)).toBe(true);
  });
  it('drops creators who list a country outside the chosen countries', () => {
    for (const c of ['IN', 'PK', 'DE', 'BR']) expect(isPreferredRegion(c, prefer)).toBe(false);
  });
  it('follows the countries in Settings, not a fixed list', () => {
    const germany = withRegion('prefer', ['DE']);
    expect(isPreferredRegion('DE', germany)).toBe(true);
    expect(isPreferredRegion('US', germany)).toBe(false);
  });
});

describe('isPreferredRegion with "only"', () => {
  const only = withRegion('only');
  it('keeps creators in the chosen countries', () => {
    expect(isPreferredRegion('US', only)).toBe(true);
  });
  it('drops creators with no listed country and creators elsewhere', () => {
    expect(isPreferredRegion(undefined, only)).toBe(false);
    expect(isPreferredRegion('IN', only)).toBe(false);
  });
});

describe('isPreferredRegion with "any"', () => {
  const anywhere = withRegion('any');
  it('keeps every creator, whatever country they list', () => {
    for (const c of ['US', 'IN', 'BR', undefined]) expect(isPreferredRegion(c, anywhere)).toBe(true);
  });
});
