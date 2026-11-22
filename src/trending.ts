import { useEffect, useRef } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { demoVideos, isDemo, trending, type Video } from './api';
import { channelDetails, channelUploads, englishChannels, mergeFeed } from './channelApi';
import { curatedChannels, type Channel } from './channels';
import type { Topic } from './classify';
import { isPreferredRegion } from './region';
import { useFollowing } from './channelStore';
import { queryKeys } from './queryKeys';
import { topicFeeds } from './topics';

export function trendingOptions(topic: Topic, enabled = true) {
  const index = Math.max(0, topicFeeds.findIndex(f => f.topic === topic));
  const feed = topicFeeds[index];
  return {
    queryKey: queryKeys.trending(topic),
    queryFn: ({ signal }: { signal: AbortSignal }) => isDemo ? Promise.resolve([...demoVideos.slice(index), ...demoVideos.slice(0, index)]) : trending(feed.query, signal),
    enabled,
  };
}

/** Creators behind this month's most-viewed videos for the given topics, most frequent first. */
export function useTrendingCreators(topics: Topic[], enabled: boolean) {
  const feeds = useQueries({ queries: topics.map(t => trendingOptions(t, enabled && !isDemo)) });
  const seen = new Map<string, { count: number; topics: Set<Topic> }>();
  feeds.forEach((feed, i) => feed.data?.forEach(video => {
    if (!video.channelId) return;
    const entry = seen.get(video.channelId) ?? { count: 0, topics: new Set<Topic>() };
    entry.count += 1;
    entry.topics.add(topics[i]);
    seen.set(video.channelId, entry);
  }));
  const ids = [...seen].sort((a, b) => b[1].count - a[1].count).slice(0, 48).map(([id]) => id);
  const feedsDone = feeds.every(f => !f.isPending);
  const details = useQuery({ queryKey: queryKeys.trendingCreators(ids), queryFn: async ({ signal }) => englishChannels((await channelDetails(ids, signal)).filter(c => isPreferredRegion(c.country)), signal), enabled: enabled && !isDemo && feedsDone && ids.length > 0 });
  const creators: Channel[] = isDemo
    ? curatedChannels.filter(c => !topics.length || c.topics.some(t => topics.includes(t as Topic)))
    : ids.flatMap(id => { const c = details.data?.find(d => d.id === id); return c ? [{ ...c, topics: [...seen.get(id)!.topics] }] : []; });
  return {
    creators,
    isPending: !isDemo && enabled && (!feedsDone || (ids.length > 0 && details.isPending)),
    error: feeds.find(f => f.isError)?.error ?? (details.isError ? details.error : null),
    retry: () => { feeds.forEach(f => { if (f.isError) void f.refetch(); }); if (details.isError) void details.refetch(); },
  };
}

/** Newest uploads from followed channels, merged into one feed. */
export function useFollowedFeed(enabled: boolean) {
  const following = useFollowing();
  const feeds = useQueries({ queries: following.map(channel => ({ queryKey: queryKeys.channelUploads(channel.id), queryFn: ({ signal }: { signal: AbortSignal }) => channelUploads(channel, signal), enabled: enabled && !isDemo })) });
  const videos: Video[] = isDemo ? demoVideos.filter(v => following.some(c => c.title === v.channel)) : mergeFeed(feeds.map(f => f.data ?? []));
  return {
    following,
    videos,
    isPending: !isDemo && feeds.some(f => f.isPending),
    errors: feeds.flatMap((f, i) => f.isError ? [{ channel: following[i], message: f.error.message, retry: () => void f.refetch() }] : []),
  };
}

/** Calls `load` when the returned element scrolls into view (infinite scroll). */
export function useLoadMoreSentinel(canLoad: boolean, load: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!canLoad || !ref.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(); }, { rootMargin: '300px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [canLoad, load]);
  return ref;
}
