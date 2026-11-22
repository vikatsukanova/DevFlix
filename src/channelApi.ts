import { request, playlist, ApiError, isEnglishVideo, type Video, type VideoLanguage } from './api';
const SAMPLE = 5;
const channelLanguage = new Map<string, boolean>();
/** A channel counts as English when most of its latest uploads are (same rules as `isEnglishVideo`). */
export function isEnglishChannel(samples: { title: string; language?: VideoLanguage }[]): boolean {
  if (!samples.length) return true;
  return samples.filter(s => isEnglishVideo(s, s.language)).length / samples.length >= 0.6;
}
/**
 * Drops channels that mostly publish in other languages, judged from their latest uploads' spoken language.
 * Channel-level language fields are usually empty, so this samples 5 uploads per channel:
 * 1 unit per channel plus 1 per 50 videos, remembered for the session.
 */
export async function englishChannels(channels: Channel[], signal?: AbortSignal): Promise<Channel[]> {
  const unknown = channels.filter(c => c.uploadsId && !channelLanguage.has(c.id));
  const uploads = await Promise.all(unknown.map(async c => {
    try {
      const page = await request<{ items: { snippet: { title: string; resourceId?: { videoId: string } } }[] }>('playlistItems', { part: 'snippet', playlistId: c.uploadsId!, maxResults: String(SAMPLE) }, signal);
      return { channel: c, videos: page.items.flatMap(i => i.snippet.resourceId ? [{ id: i.snippet.resourceId.videoId, title: i.snippet.title }] : []) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return { channel: c, videos: [] };
      throw error;
    }
  }));
  const ids = uploads.flatMap(u => u.videos.map(v => v.id));
  const languages: Record<string, VideoLanguage> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await request<{ items: { id: string; snippet?: { defaultAudioLanguage?: string; defaultLanguage?: string } }[] }>('videos', { part: 'snippet', id: ids.slice(i, i + 50).join(','), maxResults: '50' }, signal);
    for (const item of data.items) languages[item.id] = { audio: item.snippet?.defaultAudioLanguage, metadata: item.snippet?.defaultLanguage };
  }
  for (const { channel, videos } of uploads) channelLanguage.set(channel.id, isEnglishChannel(videos.map(v => ({ title: v.title, language: languages[v.id] }))));
  return channels.filter(c => channelLanguage.get(c.id) !== false);
}
import { type Channel } from './channels';
interface ChannelItem { id: string; snippet: { title: string; description: string; thumbnails?: { medium?: { url: string } } }; contentDetails?: { relatedPlaylists: { uploads: string } } }
export async function channelDetails(ids: string[], signal?: AbortSignal): Promise<Channel[]> {
  if (!ids.length) return [];
  const response = await request<{ items: ChannelItem[] }>('channels', { part: 'snippet,contentDetails', maxResults: '50', id: ids.join(',') }, signal);
  return response.items.map(c => ({ id: c.id, title: c.snippet.title, description: c.snippet.description, thumbnail: c.snippet.thumbnails?.medium?.url, uploadsId: c.contentDetails?.relatedPlaylists.uploads, topics: [] }));
}
export async function searchChannels(term: string, pageToken: string, signal?: AbortSignal) {
  const response = await request<{ items: { id: { channelId: string } }[]; nextPageToken?: string }>('search', { part: 'snippet', type: 'channel', q: term, maxResults: '12', ...(pageToken ? { pageToken } : {}) }, signal);
  return { channels: await englishChannels(await channelDetails(response.items.map(c => c.id.channelId), signal), signal), nextPageToken: response.nextPageToken };
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
/** Titles of a channel's most recent uploads (1 quota unit). Returns [] when the channel has no uploads playlist. */
export async function recentUploadTitles(uploadsId: string, accessToken: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const data = await request<{ items: { snippet: { title: string } }[] }>('playlistItems', { part: 'snippet', maxResults: '10', playlistId: uploadsId }, signal, accessToken);
    return data.items.map(i => i.snippet.title).filter(t => t !== 'Private video' && t !== 'Deleted video');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}
