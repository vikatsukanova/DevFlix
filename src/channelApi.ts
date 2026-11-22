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
export async function channelUploads(channel: Channel, signal?: AbortSignal) {
  const resolved = channel.uploadsId ? channel : (await channelDetails([channel.id], signal))[0];
  if (!resolved?.uploadsId) throw new Error(`${channel.title} has no available uploads playlist.`);
  return playlist(resolved.uploadsId, signal);
}
export function mergeFeed(groups: Video[][]): Video[] {
  return [...new Map(groups.flat().map(v => [v.id, v])).values()].sort((a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0));
}
