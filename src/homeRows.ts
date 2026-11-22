import { daysAgo, demoVideos, durationSeconds, isDemo, searchVideos, videoStats, type Video, type VideoSearch } from './api';
import { channelProfiles } from './creators';
import type { Topic } from './classify';
import { topicFeeds, maxAgeDays, FAST_MOVING_DAYS } from './topics';
import { topicsForText } from './classify';

export type HomeRowId = 'hot' | 'deep' | 'quick' | 'rising';
export const homeRows: { id: HomeRowId; title: string; subtitle: string }[] = [
  { id: 'hot', title: 'Hot this week', subtitle: 'Most viewed in your topics over the last 7 days.' },
  { id: 'deep', title: 'Deep dives', subtitle: 'Long tutorials and courses. AI picks are from the last 45 days.' },
  { id: 'quick', title: 'Quick explainers', subtitle: 'Learn something in under 10 minutes.' },
  { id: 'rising', title: 'Rising creators', subtitle: 'Smaller channels whose new videos are taking off.' },
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

export async function fetchHomeRow(id: HomeRowId, topics: Topic[], signal?: AbortSignal): Promise<Video[]> {
  if (isDemo) { const shift = homeRows.findIndex(r => r.id === id) + 1; return [...demoVideos.slice(shift), ...demoVideos.slice(0, shift)]; }
  const q = topicsQuery(topics);
  switch (id) {
    case 'hot':
      return searchVideos({ q, order: 'viewCount', publishedAfter: daysAgo(7) }, signal);
    case 'deep':
      return freshSearch(topics, (query, publishedAfter) => ({ q: `${query} tutorial course`, order: 'relevance', videoDuration: 'long', publishedAfter }), signal);
    case 'quick': {
      // "medium" is 4-20 min in YouTube's filter (it excludes Shorts); trim to 10 min using real durations.
      const videos = await freshSearch(topics, (query, publishedAfter) => ({ q: `${query} explained`, order: 'viewCount', videoDuration: 'medium', publishedAfter, maxResults: 50 }), signal);
      const stats = await videoStats(videos.map(v => v.id), signal);
      return videos.filter(v => (durationSeconds(stats[v.id]?.duration) ?? Infinity) <= 600).slice(0, 25);
    }
    case 'rising': {
      // Views relative to subscribers: a 50K-view video from a 5K-subscriber channel ranks above a 1M-view video from a 10M one.
      const videos = await searchVideos({ q, order: 'viewCount', publishedAfter: daysAgo(30), maxResults: 50 }, signal);
      const [stats, profiles] = await Promise.all([videoStats(videos.map(v => v.id), signal), channelProfiles(videos.flatMap(v => v.channelId ? [v.channelId] : []), signal)]);
      const scored = videos.flatMap(v => {
        const subs = v.channelId ? profiles[v.channelId]?.subscribers : undefined;
        const views = stats[v.id]?.views;
        return subs && views && subs >= 1_000 && subs <= 250_000 ? [{ v, score: views / subs }] : [];
      });
      return onePerChannel(scored.sort((a, b) => b.score - a.score).map(s => s.v)).slice(0, 20);
    }
  }
}

export const homeRowKey = (id: HomeRowId, topics: Topic[]) => ['youtube', 'home-row', id, [...topics].sort().join(',')] as const;
