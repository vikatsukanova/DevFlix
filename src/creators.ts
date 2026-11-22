import { useQuery } from '@tanstack/react-query';
import { isDemo, request, videoStats, type Video, type VideoStats } from './api';
import { curatedChannels } from './channels';

export interface Wiki { title: string; description?: string; extract: string; url: string }
export interface CreatorProfile { id: string; title: string; description: string; thumbnail?: string; handle?: string; subscribers?: number; videoCount?: number; joined?: string; country?: string; uploadsId?: string }

interface ChannelStatsItem { id: string; snippet: { title: string; description: string; customUrl?: string; publishedAt?: string; country?: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }

/** Channel name, description, subscriber/video counts and join date, 50 per call (1 quota unit each). */
export async function channelProfiles(ids: string[], signal?: AbortSignal): Promise<Record<string, CreatorProfile>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out: Record<string, CreatorProfile> = {};
  for (let i = 0; i < unique.length; i += 50) {
    const data = await request<{ items: ChannelStatsItem[] }>('channels', { part: 'snippet,statistics,contentDetails', id: unique.slice(i, i + 50).join(','), maxResults: '50' }, signal);
    for (const c of data.items) out[c.id] = {
      id: c.id, title: c.snippet.title, description: c.snippet.description, handle: c.snippet.customUrl,
      thumbnail: c.snippet.thumbnails?.medium?.url ?? c.snippet.thumbnails?.default?.url,
      subscribers: c.statistics?.hiddenSubscriberCount || !c.statistics?.subscriberCount ? undefined : Number(c.statistics.subscriberCount),
      videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount) : undefined,
      joined: c.snippet.publishedAt, country: c.snippet.country, uploadsId: c.contentDetails?.relatedPlaylists?.uploads,
    };
  }
  return out;
}

/**
 * Wikipedia summary for a channel, matched exactly through Wikidata's "YouTube channel ID" property (P2397),
 * so a creator never gets someone else's biography. Free, no API key. Returns null when there is no page.
 */
export async function wikipediaFor(channelId: string, signal?: AbortSignal): Promise<Wiki | null> {
  const search = await fetch(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=haswbstatement:P2397=${encodeURIComponent(channelId)}&srlimit=1&format=json&origin=*`, { signal }).then(r => r.ok ? r.json() : null);
  const qid: string | undefined = search?.query?.search?.[0]?.title;
  if (!qid) return null;
  const entity = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks|descriptions&sitefilter=enwiki&languages=en&format=json&origin=*`, { signal }).then(r => r.ok ? r.json() : null);
  const item = entity?.entities?.[qid];
  const title: string | undefined = item?.sitelinks?.enwiki?.title;
  const description: string | undefined = item?.descriptions?.en?.value;
  if (!title) return description ? { title: qid, description, extract: '', url: `https://www.wikidata.org/wiki/${qid}` } : null;
  const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal }).then(r => r.ok ? r.json() : null);
  return { title, description: description ?? summary?.description, extract: summary?.extract ?? '', url: summary?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

const keyOf = (ids: string[]) => [...new Set(ids)].filter(Boolean).sort().join(',');

/** Profiles for many channels at once; preview mode falls back to the curated descriptions. */
export function useCreatorProfiles(ids: string[], enabled = true) {
  const key = keyOf(ids);
  return useQuery({
    queryKey: ['youtube', 'creator-profiles', key],
    queryFn: ({ signal }): Promise<Record<string, CreatorProfile>> => isDemo
      ? Promise.resolve(Object.fromEntries(curatedChannels.filter(c => key.split(',').includes(c.id)).map(c => [c.id, { id: c.id, title: c.title, description: c.description } satisfies CreatorProfile])))
      : channelProfiles(key.split(','), signal),
    enabled: enabled && key.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useCreatorWiki(channelId: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['wikipedia', 'creator', channelId], queryFn: ({ signal }) => wikipediaFor(channelId!, signal), enabled: enabled && !isDemo && !!channelId, staleTime: 7 * 24 * 60 * 60 * 1000, retry: false });
}

/** View counts for a row of videos plus subscriber counts for their channels (about 2 quota units per row). */
export function useVideoDetails(videos: Video[], enabled = true) {
  const ids = keyOf(videos.map(v => v.id));
  const stats = useQuery({ queryKey: ['youtube', 'video-stats', ids], queryFn: ({ signal }) => videoStats(ids.split(','), signal), enabled: enabled && !isDemo && ids.length > 0 });
  const profiles = useCreatorProfiles(videos.flatMap(v => v.channelId ? [v.channelId] : []), enabled && !isDemo);
  return {
    stats: (stats.data ?? {}) as Record<string, VideoStats>,
    profiles: profiles.data ?? {},
  };
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCount = (n?: number) => n === undefined ? undefined : compact.format(n);

export function formatAge(iso?: string, now = Date.now()): string | undefined {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return undefined;
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  if (days === 0) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** One short line about who a creator is: Wikidata's description ("American software engineer") or the first sentence of their channel description. */
export function creatorTagline(profile?: Pick<CreatorProfile, 'description'>, wiki?: Wiki | null): string | undefined {
  if (wiki?.description) return wiki.description[0].toUpperCase() + wiki.description.slice(1);
  const first = profile?.description?.split(/(?<=[.!?])\s|\n/).find(s => s.trim().length > 0)?.trim();
  if (!first) return undefined;
  return first.length > 70 ? `${first.slice(0, 67).trimEnd()}…` : first;
}
