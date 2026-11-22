import { daysAgo, demoVideos, durationSeconds, isDemo, searchVideos, videoStats, type Video } from './api';
import { channelProfiles } from './creators';
import type { Topic } from './classify';
import { topicFeeds } from './topics';

export type HomeRowId = 'hot' | 'deep' | 'quick' | 'rising';
export const homeRows: { id: HomeRowId; title: string; subtitle: string }[] = [
  { id: 'hot', title: 'Hot this week', subtitle: 'Most viewed in your topics over the last 7 days.' },
  { id: 'deep', title: 'Deep dives', subtitle: 'Long tutorials and courses, 20 minutes or more.' },
  { id: 'quick', title: 'Quick explainers', subtitle: 'Learn something in under 10 minutes.' },
  { id: 'rising', title: 'Rising creators', subtitle: 'Smaller channels whose new videos are taking off.' },
];

/** One search across several topics using YouTube's OR operator, e.g. "AI agents | system design". */
export function topicsQuery(topics: Topic[]): string {
  return topicFeeds.filter(f => topics.includes(f.topic)).map(f => f.keywords).join(' | ') || topicFeeds.map(f => f.keywords).join(' | ');
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
      return searchVideos({ q: `${q} tutorial course`, order: 'relevance', videoDuration: 'long', publishedAfter: daysAgo(365) }, signal);
    case 'quick': {
      // "medium" is 4-20 min in YouTube's filter (it excludes Shorts); trim to 10 min using real durations.
      const videos = await searchVideos({ q: `${q} explained`, order: 'viewCount', videoDuration: 'medium', publishedAfter: daysAgo(90), maxResults: 50 }, signal);
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
