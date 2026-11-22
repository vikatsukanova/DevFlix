import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchVideos, type Video, type VideoSearch } from './api';
import { allowedAge, freshSearch, rankHot } from './homeRows';

// Real daysAgo stays in place (it reads the faked clock); only the network call is replaced.
vi.mock('./api', async importOriginal => ({
  ...await importOriginal<typeof import('./api')>(),
  isDemo: false,
  searchVideos: vi.fn(),
}));

const DAY = 86_400_000;
const now = Date.parse('2026-11-22T12:00:00Z');
const agoIso = (days: number) => new Date(now - days * DAY).toISOString();
const video = (id: string, title: string, daysOld: number, description = ''): Video => ({
  id, title, channel: 'Channel', channelId: `UC-${id}`, description, thumbnail: '', publishedAt: agoIso(daysOld),
});
const build = (q: string, publishedAfter: string): VideoSearch => ({ q, order: 'viewCount', publishedAfter });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.mocked(searchVideos).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('allowedAge', () => {
  it('gives an AI-detected video the 45-day AI cutoff, whatever the fallback', () => {
    expect(allowedAge(video('a', 'AI agents in production', 1, ''), 1825)).toBe(45);
  });

  it('uses the System Design cutoff for a system design title', () => {
    expect(allowedAge(video('s', 'System design basics', 1, ''), 45)).toBe(1825);
  });

  it('keeps the AI cutoff when AI and backend topics are both detected', () => {
    expect(allowedAge(video('m', 'AI agents for backend engineering', 1, ''), 1825)).toBe(45);
  });

  it('falls back to the search window when no topic is detected', () => {
    expect(allowedAge(video('n', 'Cooking pasta at home', 1, ''), 730)).toBe(730);
  });
});

describe('freshSearch', () => {
  it('runs one search per window and drops videos older than their topic allows', async () => {
    vi.mocked(searchVideos)
      .mockResolvedValueOnce([video('ai-new', 'AI agents tutorial', 10), video('ai-old', 'AI agents tutorial', 60)])
      .mockResolvedValueOnce([
        video('ai-in-backend', 'AI agents tutorial', 200),
        video('postgres', 'Postgres internals backend', 730),
      ]);

    const results = await freshSearch(['AI & Agents', 'Backend'], build, undefined, now);

    expect(searchVideos).toHaveBeenCalledTimes(2);
    const [aiCall, backendCall] = vi.mocked(searchVideos).mock.calls.map(([params]) => params);
    expect(aiCall.q).toBe('AI agents');
    expect(aiCall.publishedAfter).toBe(new Date(Math.floor((now - 45 * DAY) / DAY) * DAY).toISOString());
    expect(backendCall.q).toBe('backend engineering');
    expect(backendCall.publishedAfter).toBe(new Date(Math.floor((now - 1095 * DAY) / DAY) * DAY).toISOString());

    expect(results.map(v => v.id)).not.toContain('ai-old');
    expect(results.map(v => v.id)).not.toContain('ai-in-backend');
    expect(results.map(v => v.id)).toContain('postgres');
  });

  it('interleaves the two lists and removes duplicates', async () => {
    vi.mocked(searchVideos)
      .mockResolvedValueOnce([video('a1', 'AI agents', 1), video('a2', 'AI agents', 2)])
      .mockResolvedValueOnce([video('b1', 'Backend engineering', 3), video('a1', 'AI agents', 1), video('b2', 'Backend engineering', 4)]);

    const results = await freshSearch(['AI & Agents', 'Backend'], build, undefined, now);

    expect(results.map(v => v.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('makes a single call when only an evergreen topic is selected', async () => {
    vi.mocked(searchVideos).mockResolvedValueOnce([video('sd', 'System design interview', 900)]);

    const results = await freshSearch(['System Design'], build, undefined, now);

    expect(searchVideos).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchVideos).mock.calls[0][0].publishedAfter).toBe(new Date(Math.floor((now - 1825 * DAY) / DAY) * DAY).toISOString());
    expect(results.map(v => v.id)).toEqual(['sd']);
  });
});

describe('rankHot', () => {
  it('needs 10K+ views, skips Shorts, and ranks by views per day', () => {
    const videos = [
      video('tiny', 'Small upload', 5),           // 400 views: not hot
      video('short', 'Viral short', 1),           // 2M views but 45 seconds
      video('steady', 'Big but slow', 6),         // 120K over 6 days = 20K/day
      video('fast', 'Taking off', 1),             // 60K in 1 day = 60K/day
      video('edge', 'Exactly the bar', 2),        // 25K over 2 days
    ];
    const stats = {
      tiny: { views: 400, duration: 'PT12M' },
      short: { views: 2_000_000, duration: 'PT45S' },
      steady: { views: 120_000, duration: 'PT20M' },
      fast: { views: 60_000, duration: 'PT8M' },
      edge: { views: 25_000, duration: 'PT5M' },
    };
    expect(rankHot(videos, stats, now).map(v => v.id)).toEqual(['fast', 'steady', 'edge']);
  });
  it('drops videos with unknown views or duration', () => {
    expect(rankHot([video('x', 'No stats', 1)], {}, now)).toEqual([]);
  });
});
