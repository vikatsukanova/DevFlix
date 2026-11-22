import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
export interface Video { id: string; title: string; channel: string; channelId?: string; description: string; thumbnail: string; duration?: string; publishedAt?: string }
interface Snippet { publishedAt?: string; title: string; channelTitle: string; channelId?: string; videoOwnerChannelId?: string; videoOwnerChannelTitle?: string; description: string; thumbnails: Record<string, { url: string }>; resourceId?: { videoId: string } }
interface Item { id: string | { videoId: string }; snippet: Snippet; contentDetails?: { duration?: string; videoPublishedAt?: string }; status?: { embeddable: boolean } }
export const isDemo = !import.meta.env.VITE_YT_API_KEY;
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(endpoint: string, params: Record<string, string>, signal?: AbortSignal, accessToken?: string): Promise<T> {
  if (isDemo) throw new ApiError('Add VITE_YT_API_KEY to .env.local to connect YouTube.', 400);
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.search = new URLSearchParams({ ...params, key: import.meta.env.VITE_YT_API_KEY }).toString();
  const response = await fetch(url, { signal, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined });
  if (response.status === 401 && accessToken) throw new ApiError('Your YouTube sign-in expired. Please import again.', 401);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason;
    throw new ApiError(reason === 'quotaExceeded' ? 'YouTube’s daily quota is used up. Your saved videos are still available. Try again tomorrow.' : response.status === 403 ? 'YouTube access was denied. Check your API key and its restrictions.' : response.status === 404 ? 'This playlist or video is no longer available.' : 'Could not reach YouTube. Please try again.', response.status);
  }
  return response.json();
}
export function normalize(item: Item): Video {
  const s = item.snippet;
  return { id: s.resourceId?.videoId ?? (typeof item.id === 'string' ? item.id : item.id.videoId), title: s.title, channel: s.videoOwnerChannelTitle ?? s.channelTitle, channelId: s.videoOwnerChannelId ?? s.channelId, description: s.description, thumbnail: s.thumbnails.maxres?.url ?? s.thumbnails.high?.url ?? s.thumbnails.medium?.url ?? '', publishedAt: item.contentDetails?.videoPublishedAt ?? s.publishedAt, duration: item.contentDetails?.duration };
}
export async function playlist(id: string, signal?: AbortSignal): Promise<Video[]> {
  const data = await request<{ items: Item[] }>('playlistItems', { part: 'snippet,contentDetails', playlistId: id, maxResults: '20' }, signal);
  return data.items.filter(i => i.snippet.resourceId?.videoId && !['Private video', 'Deleted video'].includes(i.snippet.title)).map(normalize);
}
export const videoOptions = (id: string) => queryOptions({ queryKey: queryKeys.video(id), queryFn: async ({ signal }) => {
  const data = await request<{ items: Item[] }>('videos', { part: 'snippet,contentDetails,status', id }, signal);
  if (!data.items[0]) throw new ApiError('This video is no longer available.', 404);
  return { ...normalize(data.items[0]), embeddable: data.items[0].status?.embeddable !== false };
} });
export async function search(term: string, pageToken: string, signal?: AbortSignal) {
  const data = await request<{ items: Item[]; nextPageToken?: string }>('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', q: term, maxResults: '20', ...(pageToken ? { pageToken } : {}) }, signal);
  return { videos: data.items.map(normalize), nextPageToken: data.nextPageToken };
}
export const DAY = 24 * 60 * 60 * 1000;
/** ISO date `days` ago, rounded to the day so cached query results stay stable. */
export const daysAgo = (days: number) => new Date(Math.floor((Date.now() - days * DAY) / DAY) * DAY).toISOString();
export interface VideoSearch { q: string; order: 'viewCount' | 'relevance' | 'date'; publishedAfter?: string; videoDuration?: 'short' | 'medium' | 'long'; maxResults?: number }
/** search.list for embeddable English videos (100 quota units per call). */
export async function searchVideos({ q, order, publishedAfter, videoDuration, maxResults = 25 }: VideoSearch, signal?: AbortSignal): Promise<Video[]> {
  const data = await request<{ items: Item[] }>('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', q, order, relevanceLanguage: 'en', maxResults: String(maxResults), ...(publishedAfter ? { publishedAfter } : {}), ...(videoDuration ? { videoDuration } : {}) }, signal);
  return data.items.map(normalize);
}
/** Most-viewed embeddable videos for a topic from the last 30 days. */
export const trending = (query: string, signal?: AbortSignal) => searchVideos({ q: query, order: 'viewCount', publishedAfter: daysAgo(30) }, signal);
export interface VideoStats { views?: number; likes?: number; duration?: string }
/** View counts and durations for up to 50 videos per call (1 quota unit per call). */
export async function videoStats(ids: string[], signal?: AbortSignal): Promise<Record<string, VideoStats>> {
  const unique = [...new Set(ids)];
  const out: Record<string, VideoStats> = {};
  for (let i = 0; i < unique.length; i += 50) {
    const data = await request<{ items: { id: string; statistics?: { viewCount?: string; likeCount?: string }; contentDetails?: { duration?: string } }[] }>('videos', { part: 'statistics,contentDetails', id: unique.slice(i, i + 50).join(','), maxResults: '50' }, signal);
    for (const v of data.items) out[v.id] = { views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined, likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : undefined, duration: v.contentDetails?.duration };
  }
  return out;
}
/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function durationSeconds(iso?: string): number | undefined {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const [, d = '0', h = '0', min = '0', sec = '0'] = m;
  return ((Number(d) * 24 + Number(h)) * 60 + Number(min)) * 60 + Number(sec);
}
export const demoVideos: Video[] = [
  ['i7twT3x5yv8', 'System Design Interview: A Step-By-Step Guide', 'ByteByteGo'],
  ['Tn6-PIqc4UM', 'React in 100 Seconds', 'Fireship'],
  ['OhI005_aJkA', 'AI Agents for Beginners — Full Course', 'Microsoft Developer'],
  ['emRw8Lg3vys', 'Backend Engineering: Where to Start?', 'Hussein Nasser'],
  ['lcLbYictX3k', 'The “Wrong Way” to Use React', 'Theo - t3.gg'],
  ['Y12sGu8-qFE', 'React Wasn’t Built for the Web', 'Theo - t3.gg'],
].map(([id, title, channel]) => ({ id, title, channel, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, description: 'Explore ideas, sharpen your skills, and build something great. Watch this free lesson on YouTube.' }));
