import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
export interface Video { id: string; title: string; channel: string; description: string; thumbnail: string; duration?: string; publishedAt?: string }
interface Snippet { publishedAt?: string; title: string; channelTitle: string; videoOwnerChannelTitle?: string; description: string; thumbnails: Record<string, { url: string }>; resourceId?: { videoId: string } }
interface Item { id: string | { videoId: string }; snippet: Snippet; contentDetails?: { duration?: string; videoPublishedAt?: string }; status?: { embeddable: boolean } }
export const isDemo = !import.meta.env.VITE_YT_API_KEY;
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(endpoint: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (isDemo) throw new ApiError('Add VITE_YT_API_KEY to .env.local to connect YouTube.', 400);
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.search = new URLSearchParams({ ...params, key: import.meta.env.VITE_YT_API_KEY }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason;
    throw new ApiError(reason === 'quotaExceeded' ? 'YouTube’s daily quota is used up. Your saved videos are still available. Try again tomorrow.' : response.status === 403 ? 'YouTube access was denied. Check your API key and its restrictions.' : response.status === 404 ? 'This playlist or video is no longer available.' : 'Could not reach YouTube. Please try again.', response.status);
  }
  return response.json();
}
export function normalize(item: Item): Video {
  const s = item.snippet;
  return { id: s.resourceId?.videoId ?? (typeof item.id === 'string' ? item.id : item.id.videoId), title: s.title, channel: s.videoOwnerChannelTitle ?? s.channelTitle, description: s.description, thumbnail: s.thumbnails.maxres?.url ?? s.thumbnails.high?.url ?? s.thumbnails.medium?.url ?? '', publishedAt: item.contentDetails?.videoPublishedAt ?? s.publishedAt, duration: item.contentDetails?.duration };
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
export const demoVideos: Video[] = [
  ['i7twT3x5yv8', 'System Design Interview: A Step-By-Step Guide', 'ByteByteGo'],
  ['Tn6-PIqc4UM', 'React in 100 Seconds', 'Fireship'],
  ['OhI005_aJkA', 'AI Agents for Beginners — Full Course', 'Microsoft Developer'],
  ['emRw8Lg3vys', 'Backend Engineering: Where to Start?', 'Hussein Nasser'],
  ['lcLbYictX3k', 'The “Wrong Way” to Use React', 'Theo - t3.gg'],
  ['Y12sGu8-qFE', 'React Wasn’t Built for the Web', 'Theo - t3.gg'],
].map(([id, title, channel]) => ({ id, title, channel, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, description: 'Explore ideas, sharpen your skills, and build something great. Watch this free lesson on YouTube.' }));
