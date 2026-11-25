import { describe, expect, it } from 'vitest';
import { parseArgs, parseClaims, stampBacklog } from './stamp-backlog.mjs';

const ledger = [
  '| ID | Status | Priority | Item | Done when / notes |',
  '| --- | --- | --- | --- | --- |',
  '| DF-1 | `open` | P1 | Fix the thing | thing works |',
  '| DF-2 | `needs decision` | P2 | Maybe this | |',
  '| DF-3 | `done` | P2 | Already shipped | Shipped: #1 |',
  '| DF-10 | `wontfix` | P3 | Nope | |',
].join('\n');

describe('parseClaims', () => {
  it('reads IDs after Fixes/Closes/Resolves, in title or body, sorted numerically', () => {
    expect(parseClaims('feat: thing (Fixes: DF-10, DF-2)\n\nCloses DF-1')).toEqual(['DF-1', 'DF-2', 'DF-10']);
  });

  it('ignores IDs that are only mentioned, not claimed', () => {
    expect(parseClaims('Related to DF-4, follow-up to DF-5')).toEqual([]);
  });
});

describe('parseArgs', () => {
  it('merges --id and --claims-text and rejects malformed IDs', () => {
    expect(parseArgs(['--id', 'DF-3', '--claims-text', 'Fixes DF-1 DF-3', '--pr-url', 'u']).ids).toEqual(['DF-1', 'DF-3']);
    expect(() => parseArgs(['--id', 'MT-3'])).toThrow('Invalid --id');
  });
});

describe('stampBacklog', () => {
  it('flips open rows to done and appends the PR link', () => {
    const { markdown, changed, skipped } = stampBacklog(ledger, ['DF-1', 'DF-2'], { prUrl: 'https://x/pull/9' });
    expect(changed).toEqual(['DF-1', 'DF-2']);
    expect(skipped).toEqual([]);
    expect(markdown).toContain('| DF-1 | `done` | P1 | Fix the thing | thing works · Shipped: https://x/pull/9 |');
    expect(markdown).toContain('| DF-2 | `done` | P2 | Maybe this | Shipped: https://x/pull/9 |');
  });

  it('skips rows that are missing, done or wontfix without touching the file', () => {
    const { markdown, changed, skipped } = stampBacklog(ledger, ['DF-3', 'DF-10', 'DF-99']);
    expect(changed).toEqual([]);
    expect(skipped).toEqual(['DF-3 (already done)', 'DF-10 (already wontfix)', 'DF-99 (row missing)']);
    expect(markdown).toBe(ledger);
  });

  it('does not confuse DF-1 with DF-10', () => {
    const { markdown } = stampBacklog(ledger, ['DF-1']);
    expect(markdown).toContain('| DF-10 | `wontfix` |');
  });
});
