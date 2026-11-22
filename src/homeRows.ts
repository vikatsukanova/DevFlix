import { daysAgo, demoVideos, durationSeconds, isDemo, searchVideos, videoStats, type Video, type VideoSearch, type VideoStats } from './api';
import { channelProfiles } from './creators';
import type { Topic } from './classify';
import { topicFeeds, maxAgeDays, FAST_MOVING_DAYS } from './topics';
import { isClickbait, isDevRelated, isOffTopic, topicsForText } from './classify';
import { isPreferredRegion } from './region';

export type HomeRowId = 'hot' | 'deep' | 'quick' | 'rising';
export const homeRows: { id: HomeRowId; title: string; subtitle: string }[] = [
  { id: 'hot', title: 'Hot this week', subtitle: 'Taking off this week: 10K+ views, fastest-growing first.' },
  { id: 'deep', title: 'Deep dives', subtitle: 'Long tutorials and courses. AI picks are from the last 45 days.' },
  { id: 'quick', title: 'Quick explainers', subtitle: 'Learn something in under 10 minutes.' },
  { id: 'rising', title: 'Rising creators', subtitle: 'Smaller channels with a dev video taking off this week.' },
];

/** One search across several topics using YouTube's OR operator, e.g. "AI agents | system design". */
export function topicsQuery(topics: Topic[]): string {
  return topicFeeds.filter(f => topics.includes(f.topic)).map(f => f.keywords).join(' | ') || topicFeeds.map(f => f.keywords).join(' | ');
}

const ageDays = (v: Video, now: number) => { const t = Date.parse(v.publishedAt ?? ''); return Number.isNaN(t) ? 0 : (now - t) / 86_400_000; };
/** Oldest a video may be: an AI video gets the AI cutoff even inside a backend search; otherwise its most lenient detected topic, else the search window. */
export function allowedAge(v: Video, fallbackDays: number): number {
  const detected = topicsForText(`${v.title}\n${v.description}`);
  if (!detected.length) return fallbackDays;
  const ages = detected.map(maxAgeDays);
  return Math.min(...ages) <= FAST_MOVING_DAYS ? Math.min(...ages) : Math.max(...ages);
}
/**
 * Runs one search for fast-moving topics (AI) with a short window and one for evergreen topics with a long window,
 * then drops anything older than its own topic allows and interleaves the two lists.
 */
export async function freshSearch(topics: Topic[], build: (q: string, publishedAfter: string) => VideoSearch, signal?: AbortSignal, now = Date.now()): Promise<Video[]> {
  const chosen = topics.length ? topics : topicFeeds.map(f => f.topic);
  const groups = [chosen.filter(t => maxAgeDays(t) <= FAST_MOVING_DAYS), chosen.filter(t => maxAgeDays(t) > FAST_MOVING_DAYS)].filter(g => g.length);
  const lists = await Promise.all(groups.map(async group => {
    const windowDays = Math.max(...group.map(maxAgeDays));
    const videos = await searchVideos(build(topicsQuery(group), daysAgo(windowDays)), signal);
    return videos.filter(v => ageDays(v, now) <= allowedAge(v, windowDays));
  }));
  const merged: Video[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map(l => l.length)); i++) for (const list of lists) if (list[i] && !merged.some(m => m.id === list[i].id)) merged.push(list[i]);
  return merged;
}

/** Keeps each channel's first (highest-ranked) video. */
function onePerChannel(videos: Video[]): Video[] {
  const seen = new Set<string>();
  return videos.filter(v => { const key = v.channelId ?? v.channel; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Hot this week: at least this many views. */
export const HOT_MIN_VIEWS = 10_000;
/** Deep dives and Quick explainers: skip videos almost nobody has watched. */
export const MIN_VIEWS = 5_000;
/** Rising creators: a minimum audience and length, so tiny or throwaway uploads don't qualify. */
export const RISING_MIN_VIEWS = 10_000;
const RISING_MIN_SECONDS = 300;
/** Shorts (under 3 minutes) aren't lessons, even when they go viral. */
const MIN_HOT_SECONDS = 180;
/** Keeps videos with HOT_MIN_VIEWS+ views that aren't Shorts, fastest-growing (views per day since upload) first. */
export function rankHot(videos: Video[], stats: Record<string, VideoStats>, now = Date.now()): Video[] {
  const perDay = (v: Video) => (stats[v.id]?.views ?? 0) / Math.max(ageDays(v, now), 0.25);
  return videos
    .filter(v => (stats[v.id]?.views ?? 0) >= HOT_MIN_VIEWS && (durationSeconds(stats[v.id]?.duration) ?? 0) >= MIN_HOT_SECONDS)
    .sort((a, b) => perDay(b) - perDay(a));
}
/**
 * This week's most-viewed English videos, one search per topic. A single "A | B | C" search ranks poorly
 * (almost nothing popular comes back), so Hot this week and Rising creators share these per-topic searches.
 * Kept for 6 hours per topic so both rows cost 100 units per topic, not 200.
 */
const POOL_TTL = 6 * 60 * 60 * 1000;
const pools = new Map<string, { at: number; videos: Promise<Video[]> }>();
export function clearWeekPools() { pools.clear(); }
export async function weekPools(topics: Topic[], signal?: AbortSignal): Promise<Video[][]> {
  const chosen = topicFeeds.filter(f => !topics.length || topics.includes(f.topic));
  return Promise.all(chosen.map(feed => {
    const cached = pools.get(feed.topic);
    if (cached && Date.now() - cached.at < POOL_TTL) return cached.videos;
    const videos = searchVideos({ q: feed.keywords, order: 'viewCount', publishedAfter: daysAgo(7), maxResults: 50 }, signal);
    pools.set(feed.topic, { at: Date.now(), videos });
    videos.catch(() => pools.delete(feed.topic));
    return videos;
  }));
}
/** Takes one from each list in turn: [a1, b1, c1, a2, b2, ...], skipping duplicates. */
export function interleave(lists: Video[][]): Video[] {
  const out: Video[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map(l => l.length)); i++) for (const list of lists) if (list[i] && !out.some(v => v.id === list[i].id)) out.push(list[i]);
  return out;
}
/** Discovery rows only show videos about dev or AI, and never politics, news or games. */
export const isOnTopic = (v: Video) => isDevRelated(`${v.title}\n${v.description}`) && !isOffTopic(v.title);
const ROW_LIMIT: Record<HomeRowId, number> = { hot: 25, deep: 25, quick: 25, rising: 20 };
/** Keeps videos from creators in the preferred regions or with no listed country (1 unit per 50 channels). See region.ts. */
export async function preferredRegionOnly(videos: Video[], signal?: AbortSignal): Promise<Video[]> {
  const ids = videos.flatMap(v => v.channelId ? [v.channelId] : []);
  if (!ids.length) return videos;
  const profiles = (await channelProfiles(ids, signal)) ?? {};
  return videos.filter(v => !v.channelId || isPreferredRegion(profiles[v.channelId]?.country));
}
export async function fetchHomeRow(id: HomeRowId, topics: Topic[], signal?: AbortSignal): Promise<Video[]> {
  if (isDemo) { const shift = homeRows.findIndex(r => r.id === id) + 1; return [...demoVideos.slice(shift), ...demoVideos.slice(0, shift)]; }
  const relevant = (await rowCandidates(id, topics, signal)).filter(isOnTopic);
  return (await preferredRegionOnly(relevant, signal)).slice(0, ROW_LIMIT[id]);
}
async function rowCandidates(id: HomeRowId, topics: Topic[], signal?: AbortSignal): Promise<Video[]> {
  const q = topicsQuery(topics);
  switch (id) {
    case 'hot': {
      // Rank by real views per day with a minimum, per topic, then alternate topics so AI doesn't fill the row.
      const pools = await weekPools(topics, signal);
      const stats = await videoStats(pools.flat().map(v => v.id), signal);
      return interleave(pools.map(pool => rankHot(pool, stats)));
    }
    case 'deep': {
      const videos = await freshSearch(topics, (query, publishedAfter) => ({ q: `${query} tutorial course`, order: 'relevance', videoDuration: 'long', publishedAfter, maxResults: 50 }), signal);
      const stats = await videoStats(videos.map(v => v.id), signal);
      return videos.filter(v => (stats[v.id]?.views ?? 0) >= MIN_VIEWS);
    }
    case 'quick': {
      // "medium" is 4-20 min in YouTube's filter (it excludes Shorts); trim to 10 min using real durations.
      const videos = await freshSearch(topics, (query, publishedAfter) => ({ q: `${query} explained`, order: 'relevance', videoDuration: 'medium', publishedAfter, maxResults: 50 }), signal);
      const stats = await videoStats(videos.map(v => v.id), signal);
      return videos.filter(v => (durationSeconds(stats[v.id]?.duration) ?? Infinity) <= 600 && (stats[v.id]?.views ?? 0) >= MIN_VIEWS);
    }
    case 'rising': {
      // Views relative to subscribers: a 50K-view video from a 5K-subscriber channel ranks above a 1M-view video from a 10M one.
      const videos = (await weekPools(topics, signal)).flat();
      const [stats, profiles] = await Promise.all([videoStats(videos.map(v => v.id), signal), channelProfiles(videos.flatMap(v => v.channelId ? [v.channelId] : []), signal)]);
      const scored = videos.flatMap(v => {
        const subs = v.channelId ? profiles[v.channelId]?.subscribers : undefined;
        const views = stats[v.id]?.views;
        const seconds = durationSeconds(stats[v.id]?.duration) ?? 0;
        // Small channels only, but with real traction, real length and no hype-style titles.
        const qualifies = subs && views && subs >= 1_000 && subs <= 250_000 && views >= RISING_MIN_VIEWS && seconds >= RISING_MIN_SECONDS && !isClickbait(v.title);
        return qualifies ? [{ v, score: views / subs }] : [];
      });
      return onePerChannel(scored.sort((a, b) => b.score - a.score).map(s => s.v));
    }
  }
}

export const homeRowKey = (id: HomeRowId, topics: Topic[]) => ['youtube', 'home-row', 'v3', id, [...topics].sort().join(',')] as const;
