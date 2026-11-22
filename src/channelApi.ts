import { request, playlist, type Video } from './api';
import { type Channel } from './channels';
interface ChannelItem { id: string; snippet: { title: string; description: string; thumbnails?: { medium?: { url: string } } }; contentDetails?: { relatedPlaylists: { uploads: string } } }
export async function channelDetails(ids: string[], signal?: AbortSignal): Promise<Channel[]> {
  if (!ids.length) return [];
  const response = await request<{ items: ChannelItem[] }>('channels', { part: 'snippet,contentDetails', maxResults: '50', id: ids.join(',') }, signal);
  return response.items.map(c => ({ id: c.id, title: c.snippet.title, description: c.snippet.description, thumbnail: c.snippet.thumbnails?.medium?.url, uploadsId: c.contentDetails?.relatedPlaylists.uploads, topics: [] }));
}
export async function searchChannels(term: string, pageToken: string, signal?: AbortSignal) {
  const response = await request<{ items: { id: { channelId: string } }[]; nextPageToken?: string }>('search', { part: 'snippet', type: 'channel', q: term, maxResults: '12', ...(pageToken ? { pageToken } : {}) }, signal);
  return { channels: await channelDetails(response.items.map(c => c.id.channelId), signal), nextPageToken: response.nextPageToken };
}
const MAX_SUBSCRIPTIONS = 1000;
interface BrandedChannelItem extends ChannelItem { brandingSettings?: { channel?: { keywords?: string } } }
/** Reads the signed-in user's subscriptions (read-only) and loads channel details in batches of 50. */
export async function subscribedChannels(accessToken: string, signal?: AbortSignal): Promise<{ channel: Channel; keywords?: string }[]> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const page = await request<{ items: { snippet: { resourceId: { channelId: string } } }[]; nextPageToken?: string }>('subscriptions', { part: 'snippet', mine: 'true', maxResults: '50', ...(pageToken ? { pageToken } : {}) }, signal, accessToken);
    ids.push(...page.items.map(s => s.snippet.resourceId.channelId));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken && ids.length < MAX_SUBSCRIPTIONS);
  const unique = [...new Set(ids)].slice(0, MAX_SUBSCRIPTIONS);
  const batches = Array.from({ length: Math.ceil(unique.length / 50) }, (_, i) => unique.slice(i * 50, i * 50 + 50));
  const pages = await Promise.all(batches.map(batch => request<{ items: BrandedChannelItem[] }>('channels', { part: 'snippet,contentDetails,brandingSettings', maxResults: '50', id: batch.join(',') }, signal, accessToken)));
  return pages.flatMap(p => p.items).map(c => ({ channel: { id: c.id, title: c.snippet.title, description: c.snippet.description, thumbnail: c.snippet.thumbnails?.medium?.url, uploadsId: c.contentDetails?.relatedPlaylists.uploads, topics: [] }, keywords: c.brandingSettings?.channel?.keywords }));
}
export async function channelUploads(channel: Channel, signal?: AbortSignal) {
  const resolved = channel.uploadsId ? channel : (await channelDetails([channel.id], signal))[0];
  if (!resolved?.uploadsId) throw new Error(`${channel.title} has no available uploads playlist.`);
  return playlist(resolved.uploadsId, signal);
}
export function mergeFeed(groups: Video[][]): Video[] {
  return [...new Map(groups.flat().map(v => [v.id, v])).values()].sort((a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0));
}
