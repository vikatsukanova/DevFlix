// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { filterBySize } from './ChannelsPage';

// Size filtering only applies with live data, so the preview flag is switched off here.
vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), isDemo: false }));

const items = [
  { id: 'tiny' }, { id: 'edge-low' }, { id: 'edge-mid' }, { id: 'edge-high' }, { id: 'huge' }, { id: 'unknown' },
];
const subs: Record<string, number | undefined> = {
  tiny: 1_200,
  'edge-low': 99_999,
  'edge-mid': 100_000,
  'edge-high': 999_999,
  huge: 1_000_000,
  unknown: undefined,
};
const ids = (list: { id: string }[]) => list.map(c => c.id);

describe('filterBySize buckets', () => {
  it('puts 99,999 under 100K and 100,000 in 100K–1M', () => {
    expect(ids(filterBySize(items, subs, 'small', 'suggested'))).toEqual(['tiny', 'edge-low']);
    expect(ids(filterBySize(items, subs, 'mid', 'suggested'))).toEqual(['edge-mid', 'edge-high']);
  });

  it('puts 999,999 in 100K–1M and 1,000,000 in 1M+', () => {
    expect(ids(filterBySize(items, subs, 'mid', 'suggested'))).toContain('edge-high');
    expect(ids(filterBySize(items, subs, 'mid', 'suggested'))).not.toContain('huge');
    expect(ids(filterBySize(items, subs, 'large', 'suggested'))).toEqual(['huge']);
  });

  it('excludes creators with unknown subscribers from every size bucket', () => {
    for (const size of ['small', 'mid', 'large'] as const) {
      expect(ids(filterBySize(items, subs, size, 'suggested'))).not.toContain('unknown');
    }
  });

  it('keeps creators with unknown subscribers under Any size', () => {
    expect(ids(filterBySize(items, subs, 'any', 'suggested'))).toEqual(ids(items));
  });
});

describe('filterBySize sorting', () => {
  it('sorts most subscribers first with unknown counts last', () => {
    expect(ids(filterBySize(items, subs, 'any', 'most'))).toEqual(['huge', 'edge-high', 'edge-mid', 'edge-low', 'tiny', 'unknown']);
  });

  it('sorts fewest subscribers first with unknown counts last', () => {
    expect(ids(filterBySize(items, subs, 'any', 'fewest'))).toEqual(['tiny', 'edge-low', 'edge-mid', 'edge-high', 'huge', 'unknown']);
  });

  it('keeps the suggested order unchanged', () => {
    expect(ids(filterBySize(items, subs, 'any', 'suggested'))).toEqual(ids(items));
  });

  it('does not mutate the input array when sorting', () => {
    const copy = [...items];
    filterBySize(items, subs, 'any', 'most');
    expect(items).toEqual(copy);
  });
});
