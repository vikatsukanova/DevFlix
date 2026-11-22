import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { durationSeconds, searchVideos, videoStats, type Video } from './api';
import { channelProfiles, creatorTagline, formatAge, formatCount, wikipediaFor, type CreatorProfile } from './creators';
import { clearWeekPools, fetchHomeRow, topicsQuery } from './homeRows';

// Real helpers stay in place; the API surface that touches the network is replaced.
vi.mock('./api', async original => ({
  ...await original<typeof import('./api')>(),
  isDemo: false,
  searchVideos: vi.fn(),
  videoStats: vi.fn(),
}));
vi.mock('./creators', async original => ({
  ...await original<typeof import('./creators')>(),
  channelProfiles: vi.fn(),
}));

const DAY = 86_400_000;
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('durationSeconds', () => {
  it('converts ISO 8601 durations to seconds', () => {
    expect(durationSeconds('PT1H2M3S')).toBe(3723);
    expect(durationSeconds('PT45S')).toBe(45);
    expect(durationSeconds('P1DT1M')).toBe(86460);
    expect(durationSeconds(undefined)).toBeUndefined();
  });
});

describe('formatCount', () => {
  it('shortens counts and leaves missing values empty', () => {
    expect(formatCount(1234)).toBe('1.2K');
    expect(formatCount(3_900_000)).toBe('3.9M');
    expect(formatCount(undefined)).toBeUndefined();
  });
});

describe('formatAge', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  const ago = (days: number) => new Date(now - days * DAY).toISOString();

  it('describes how long ago a video was published', () => {
    expect(formatAge(ago(0), now)).toBe('today');
    expect(formatAge(ago(3), now)).toBe('3d ago');
    expect(formatAge(ago(14), now)).toBe('2w ago');
    expect(formatAge(ago(150), now)).toBe('5mo ago');
    expect(formatAge(ago(730), now)).toBe('2y ago');
  });

  it('returns undefined for missing or invalid dates', () => {
    expect(formatAge(undefined, now)).toBeUndefined();
    expect(formatAge('not a date', now)).toBeUndefined();
  });
});

describe('creatorTagline', () => {
  it('prefers the Wikidata description, capitalized', () => {
    expect(creatorTagline({ description: 'Channel text. More.' }, { title: 'X', description: 'american software engineer', extract: '', url: '' })).toBe('American software engineer');
  });

  it('falls back to the first sentence of the channel description', () => {
    expect(creatorTagline({ description: 'Fast explanations of code. More about tools.' })).toBe('Fast explanations of code.');
    expect(creatorTagline({ description: 'First line here\nSecond line' })).toBe('First line here');
  });

  it('truncates long lines to 70 characters with an ellipsis', () => {
    // Cut at 67 characters, then trailing spaces are trimmed before the ellipsis.
    const long = `${'x'.repeat(66)} ${'y'.repeat(20)}`;
    expect(creatorTagline({ description: long })).toBe(`${'x'.repeat(66)}…`);
    const exact = 'a'.repeat(70);
    expect(creatorTagline({ description: exact })).toBe(exact);
  });

  it('returns undefined when there is nothing to say', () => {
    expect(creatorTagline({ description: '' })).toBeUndefined();
    expect(creatorTagline({ description: '   ' })).toBeUndefined();
    expect(creatorTagline(undefined, null)).toBeUndefined();
  });
});

describe('wikipediaFor', () => {
  const channelId = 'UCsBjURrPoezykLs9EqgamOA';

  function stubWikidata(routes: { search: unknown; entity?: unknown; summary?: unknown }) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('list=search')) return json(routes.search);
      if (url.includes('wbgetentities')) return json(routes.entity ?? {});
      if (url.includes('/api/rest_v1/page/summary/')) return json(routes.summary ?? {});
      return json({}, false);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('returns null when no Wikidata item has this YouTube channel ID', async () => {
    const fetchMock = stubWikidata({ search: { query: { search: [] } } });

    await expect(wikipediaFor(channelId)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`haswbstatement:P2397=${channelId}`);
  });

  it('returns the English Wikipedia summary when the item has an enwiki sitelink', async () => {
    stubWikidata({
      search: { query: { search: [{ title: 'Q42000' }] } },
      entity: { entities: { Q42000: { sitelinks: { enwiki: { title: 'Fireship (YouTube channel)' } }, descriptions: { en: { value: 'YouTube channel' } } } } },
      summary: { extract: 'Fireship is a YouTube channel.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Fireship_(YouTube_channel)' } } },
    });

    await expect(wikipediaFor(channelId)).resolves.toEqual({
      title: 'Fireship (YouTube channel)',
      description: 'YouTube channel',
      extract: 'Fireship is a YouTube channel.',
      url: 'https://en.wikipedia.org/wiki/Fireship_(YouTube_channel)',
    });
  });

  it('returns the Wikidata description and item link when there is no Wikipedia page', async () => {
    const fetchMock = stubWikidata({
      search: { query: { search: [{ title: 'Q7000' }] } },
      entity: { entities: { Q7000: { sitelinks: {}, descriptions: { en: { value: 'American software engineer' } } } } },
    });

    await expect(wikipediaFor(channelId)).resolves.toEqual({
      title: 'Q7000',
      description: 'American software engineer',
      extract: '',
      url: 'https://www.wikidata.org/wiki/Q7000',
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('en.wikipedia.org'))).toBe(false);
  });
});

describe('topicsQuery', () => {
  it('joins the selected topics with YouTube\'s OR operator, in catalog order', () => {
    expect(topicsQuery(['AI & Agents', 'System Design'])).toBe('AI agents | system design');
  });

  it('uses every topic when none is selected', () => {
    expect(topicsQuery([])).toBe(['AI agents', 'React JS', 'backend engineering', 'system design', 'DevOps'].join(' | '));
  });
});

describe('fetchHomeRow (live mode)', () => {
  // Titles mention coding so the dev-relevance check passes; ids stay short for readable expectations.
  const video = (id: string, channelId?: string): Video => ({ id, title: `${id} coding tutorial`, channel: channelId ?? 'none', channelId, description: '', thumbnail: '' });

  beforeEach(() => {
    clearWeekPools();
    vi.mocked(searchVideos).mockReset();
    vi.mocked(videoStats).mockReset();
    vi.mocked(channelProfiles).mockReset();
  });

  /** Mocks one search result set: each entry is [videoId, channelId, views]. */
  function mockRising(entries: [string, string | undefined, number][], subscribers: Record<string, number>) {
    vi.mocked(searchVideos).mockResolvedValue(entries.map(([id, channelId]) => video(id, channelId)));
    vi.mocked(videoStats).mockResolvedValue(Object.fromEntries(entries.map(([id, , views]) => [id, { views, duration: 'PT10M' }])));
    vi.mocked(channelProfiles).mockResolvedValue(Object.fromEntries(Object.entries(subscribers).map(([id, subs]) => [id, { id, title: id, description: '', subscribers: subs } satisfies CreatorProfile])));
  }

  it('hot: searches each topic for this week, ranks by real views per day, and alternates topics', async () => {
    const day = 86_400_000;
    const at = (daysOld: number) => new Date(Date.now() - daysOld * day).toISOString();
    const v = (id: string, daysOld: number): Video => ({ ...video(id, `UC${id}`), publishedAt: at(daysOld) });
    vi.mocked(searchVideos).mockImplementation(async ({ q }) => q === 'AI agents'
      ? [v('ai-slow', 5), v('ai-fast', 1), v('ai-small', 1)]
      : [v('be-fast', 1), v('be-short', 1)]);
    vi.mocked(videoStats).mockResolvedValue({
      'ai-slow': { views: 100_000, duration: 'PT20M' },  // 20K/day
      'ai-fast': { views: 80_000, duration: 'PT12M' },   // 80K/day
      'ai-small': { views: 400, duration: 'PT12M' },     // under 10K: not hot
      'be-fast': { views: 15_000, duration: 'PT30M' },
      'be-short': { views: 900_000, duration: 'PT50S' }, // a Short
    });

    const rows = await fetchHomeRow('hot', ['AI & Agents', 'Backend']);

    expect(rows.map(r => r.id)).toEqual(['ai-fast', 'be-fast', 'ai-slow']);
    expect(searchVideos).toHaveBeenCalledTimes(2);
    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: 'AI agents', order: 'viewCount', maxResults: 50 }), undefined);
    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: 'backend engineering', order: 'viewCount', maxResults: 50 }), undefined);
  });

  it('keeps creators in preferred regions or with no listed country', async () => {
    const recent = (id: string): Video => ({ ...video(id, `UC${id}`), publishedAt: new Date(Date.now() - 86_400_000).toISOString() });
    vi.mocked(searchVideos).mockResolvedValue([recent('us'), recent('in'), recent('blank')]);
    vi.mocked(videoStats).mockResolvedValue({ us: { views: 50_000, duration: 'PT10M' }, in: { views: 90_000, duration: 'PT10M' }, blank: { views: 20_000, duration: 'PT10M' } });
    vi.mocked(channelProfiles).mockResolvedValue({ UCus: { id: 'UCus', title: 'us', description: '', country: 'US' }, UCin: { id: 'UCin', title: 'in', description: '', country: 'IN' }, UCblank: { id: 'UCblank', title: 'blank', description: '' } });

    const rows = await fetchHomeRow('hot', ['DevOps']);

    expect(rows.map(r => r.id)).toEqual(['us', 'blank']);
  });

  it('hot and rising share the weekly per-topic searches', async () => {
    vi.mocked(searchVideos).mockResolvedValue([]);
    vi.mocked(videoStats).mockResolvedValue({});
    vi.mocked(channelProfiles).mockResolvedValue({});
    await fetchHomeRow('hot', ['DevOps']);
    await fetchHomeRow('rising', ['DevOps']);
    expect(searchVideos).toHaveBeenCalledTimes(1);
  });

  it('rising: keeps only channels with 1K to 250K subscribers and 10K+ views, ranked by views per subscriber', async () => {
    mockRising([
      ['e', 'UCmid', 300_000],     // 300K / 60K = 5
      ['c', 'UCbig', 1_000_000],   // 10M subscribers is over the range
      ['d', 'UCtiny', 900],        // 500 subscribers is under the range
      ['h', 'UCfloor', 2_000],     // exactly 1K subscribers: 2K / 1K = 2
      ['g', 'UCceiling', 250_000], // exactly 250K subscribers: 1
      ['f', 'UCmid2', 100],        // 100 / 1K = 0.1
      ['n', undefined, 9_000_000], // no channel, cannot be scored
      ['a', 'UCsmall', 50_000],    // 50K / 5K = 10
    ], { UCmid: 60_000, UCbig: 10_000_000, UCtiny: 500, UCfloor: 1_000, UCceiling: 250_000, UCmid2: 1_000, UCsmall: 5_000 });

    const rows = await fetchHomeRow('rising', ['Frontend']);

    expect(rows.map(v => v.id)).toEqual(['a', 'e', 'g']); // h and f are under 10K views
    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: 'React JS', order: 'viewCount', maxResults: 50 }), undefined);
    expect(channelProfiles).toHaveBeenCalledWith(expect.arrayContaining(['UCmid', 'UCbig']), undefined);
  });

  it('rising: skips short videos, clickbait titles and off-topic videos', async () => {
    const v = (id: string, title: string): Video => ({ ...video(id, `UC${id}`), title });
    vi.mocked(searchVideos).mockResolvedValue([v('ok', 'Building a Postgres queue in Go'), v('short', 'Coding tip'), v('bait', 'This AI Tool Is INSANE 🤯🔥'), v('gta', 'GTA 6 coding easter eggs')]);
    vi.mocked(videoStats).mockResolvedValue({ ok: { views: 40_000, duration: 'PT14M' }, short: { views: 90_000, duration: 'PT2M' }, bait: { views: 90_000, duration: 'PT14M' }, gta: { views: 90_000, duration: 'PT14M' } });
    vi.mocked(channelProfiles).mockResolvedValue(Object.fromEntries(['ok', 'short', 'bait', 'gta'].map(id => [`UC${id}`, { id: `UC${id}`, title: id, description: '', subscribers: 20_000 }])));

    const rows = await fetchHomeRow('rising', ['Backend']);

    expect(rows.map(r => r.id)).toEqual(['ok']);
  });

  it('rising: keeps the top-ranked video when one channel has several qualifying videos', async () => {
    mockRising([
      ['a', 'UCsmall', 50_000],  // score 10, ranked first
      ['b', 'UCsmall', 40_000],  // score 8, same channel
    ], { UCsmall: 5_000 });

    const rows = await fetchHomeRow('rising', ['Frontend']);

    expect(rows.map(v => v.id)).toEqual(['a']);
  });

  it('quick: keeps only videos of 10 minutes or less with 5K+ views, using real durations', async () => {
    vi.mocked(searchVideos).mockResolvedValue([
      video('short'),     // PT5M
      video('long'),      // PT1H
      video('edge'),      // PT10M, exactly 600 seconds
      video('over'),      // PT10M1S
      video('nostats'),   // no duration returned, so it cannot be verified
      video('unseen'),    // PT5M but only 400 views
    ]);
    vi.mocked(videoStats).mockResolvedValue({
      short: { duration: 'PT5M', views: 12_000 },
      long: { duration: 'PT1H', views: 12_000 },
      edge: { duration: 'PT10M', views: 5_000 },
      over: { duration: 'PT10M1S', views: 12_000 },
      unseen: { duration: 'PT5M', views: 400 },
    });

    const rows = await fetchHomeRow('quick', ['AI & Agents']);

    expect(rows.map(v => v.id)).toEqual(['short', 'edge']);
    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: 'AI agents explained', videoDuration: 'medium', maxResults: 50 }), undefined);
    expect(videoStats).toHaveBeenCalledWith(['short', 'long', 'edge', 'over', 'nostats', 'unseen'], undefined);
  });
});
