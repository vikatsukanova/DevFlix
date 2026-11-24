import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { getSettings } from './settings';
export interface Video { id: string; title: string; channel: string; channelId?: string; description: string; thumbnail: string; duration?: string; publishedAt?: string }
interface Snippet { publishedAt?: string; title: string; channelTitle: string; channelId?: string; videoOwnerChannelId?: string; videoOwnerChannelTitle?: string; description: string; thumbnails: Record<string, { url: string }>; resourceId?: { videoId: string } }
interface Item { id: string | { videoId: string }; snippet: Snippet; contentDetails?: { duration?: string; videoPublishedAt?: string }; status?: { embeddable: boolean } }
const hasProxy = !!import.meta.env.VITE_YT_PROXY_URL;
const proxyUrl = hasProxy ? (import.meta.env.VITE_YT_PROXY_URL as string).replace(/\/+$/, '') : '';
const apiKey = hasProxy ? '' : (import.meta.env.VITE_YT_API_KEY ?? '');
export const isDemo = !hasProxy && !apiKey;
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(endpoint: string, params: Record<string, string>, signal?: AbortSignal, accessToken?: string): Promise<T> {
  if (isDemo) throw new ApiError('Set VITE_YT_PROXY_URL or VITE_YT_API_KEY in .env.local to connect YouTube.', 400);
  const base = hasProxy ? `${proxyUrl}/${endpoint}` : `https://www.googleapis.com/youtube/v3/${endpoint}`;
  const query = new URLSearchParams(hasProxy ? params : { ...params, key: apiKey }).toString();
  const url = query ? `${base}?${query}` : base;
  const response = await fetch(url, { signal, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined });
  if (response.status === 401 && accessToken) throw new ApiError('Your YouTube sign-in expired. Please import again.', 401);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason;
    throw new ApiError(reason === 'quotaExceeded' ? 'YouTube’s daily quota is used up. Your saved videos are still available. Try again tomorrow.' : response.status === 403 ? 'YouTube access was denied. Check your API key and its restrictions.' : response.status === 404 ? 'This playlist or video is no longer available.' : 'Could not reach YouTube. Please try again.', response.status);
  }
  return response.json();
}
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** YouTube search returns titles and descriptions HTML-escaped (e.g. "China&#39;s"); React would show the escapes literally. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') { const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : match; }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}
export function normalize(item: Item): Video {
  const s = item.snippet;
  return { id: s.resourceId?.videoId ?? (typeof item.id === 'string' ? item.id : item.id.videoId), title: decodeEntities(s.title), channel: s.videoOwnerChannelTitle ?? s.channelTitle, channelId: s.videoOwnerChannelId ?? s.channelId, description: decodeEntities(s.description), thumbnail: s.thumbnails.maxres?.url ?? s.thumbnails.high?.url ?? s.thumbnails.medium?.url ?? '', publishedAt: item.contentDetails?.videoPublishedAt ?? s.publishedAt, duration: item.contentDetails?.duration };
}
export async function playlist(id: string, signal?: AbortSignal): Promise<Video[]> {
  const data = await request<{ items: Item[] }>('playlistItems', { part: 'snippet,contentDetails', playlistId: id, maxResults: '20' }, signal);
  return filterVideos(data.items.filter(i => i.snippet.resourceId?.videoId && !['Private video', 'Deleted video'].includes(i.snippet.title)).map(normalize), signal);
}
export const videoOptions = (id: string) => queryOptions({ queryKey: queryKeys.video(id), queryFn: async ({ signal }) => {
  const data = await request<{ items: Item[] }>('videos', { part: 'snippet,contentDetails,status', id }, signal);
  if (!data.items[0]) throw new ApiError('This video is no longer available.', 404);
  return { ...normalize(data.items[0]), embeddable: data.items[0].status?.embeddable !== false };
} });
export async function search(term: string, pageToken: string, signal?: AbortSignal) {
  const data = await request<{ items: Item[]; nextPageToken?: string }>('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', q: term, ...searchBias(), maxResults: '20', ...(pageToken ? { pageToken } : {}) }, signal);
  return { videos: await filterVideos(data.items.map(normalize), signal), nextPageToken: data.nextPageToken };
}
export interface VideoLanguage { audio?: string; metadata?: string }
// Regional English audio tags that are frequently applied to mixed-language audio, so they aren't treated as English.
const UNRELIABLE_ENGLISH_TAGS = ['en-in'];
const LATIN_SCRIPT_LANGUAGES = ['en', 'es', 'pt', 'fr', 'de'];
const codeMatches = (code: string, language: string) => code.toLowerCase().split('-')[0] === language && !(language === 'en' && UNRELIABLE_ENGLISH_TAGS.includes(code.toLowerCase()));
/** Share of letters outside the Latin script. */
const nonLatinShare = (text: string) => { const letters = text.match(/\p{L}/gu) ?? []; return letters.length ? letters.filter(c => !/\p{Script=Latin}/u.test(c)).length / letters.length : 0; };
/**
 * Whether a video is in the chosen language (Settings; 'any' keeps everything). The spoken (audio) language wins,
 * so a title in your language over audio in another one is dropped. Without an audio language, a different metadata
 * language drops it, and for Latin-script languages so does a mostly non-Latin title; otherwise it's kept.
 */
export function matchesLanguage(video: Pick<Video, 'title'>, language?: VideoLanguage, setting: string = getSettings().language, strict = getSettings().creatorRegion === 'only'): boolean {
  if (setting === 'any') return true;
  if (language?.audio) return codeMatches(language.audio, setting);
  // Strict mode ("Only my region") also requires the creator to have tagged the spoken language.
  if (strict) return false;
  if (language?.metadata && !codeMatches(language.metadata, setting)) return false;
  return !LATIN_SCRIPT_LANGUAGES.includes(setting) || nonLatinShare(video.title) < 0.3;
}
/** Search parameters from Settings: lean results toward the chosen language and first chosen country. */
export function searchBias(): Record<string, string> {
  const { language, countries } = getSettings();
  return { ...(language !== 'any' ? { relevanceLanguage: language } : {}), ...(countries[0] ? { regionCode: countries[0] } : {}) };
}
/**
 * YouTube categories that are never shown: Film & Animation, Autos, Music, Pets, Sports, Travel, Gaming, Comedy,
 * News & Politics, Shows and Trailers. Science & Technology, Education, Howto, People & Blogs and Entertainment stay,
 * because developers upload under all of them.
 */
export const BLOCKED_CATEGORIES = new Set(['1', '2', '10', '15', '17', '19', '20', '23', '25', '43', '44']);
/**
 * Removes videos not in the chosen language and videos in blocked categories. Search's relevanceLanguage only biases results,
 * so this checks each video's snippet (1 quota unit per 50, language and category in the same call).
 */
export async function filterVideos(videos: Video[], signal?: AbortSignal): Promise<Video[]> {
  if (!videos.length) return videos;
  const languages: Record<string, VideoLanguage> = {};
  const categories: Record<string, string | undefined> = {};
  const ids = [...new Set(videos.map(v => v.id))];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await request<{ items: { id: string; snippet?: { defaultAudioLanguage?: string; defaultLanguage?: string; categoryId?: string } }[] }>('videos', { part: 'snippet', id: ids.slice(i, i + 50).join(','), maxResults: '50' }, signal);
    for (const item of data.items) { languages[item.id] = { audio: item.snippet?.defaultAudioLanguage, metadata: item.snippet?.defaultLanguage }; categories[item.id] = item.snippet?.categoryId; }
  }
  return videos.filter(v => matchesLanguage(v, languages[v.id]) && !BLOCKED_CATEGORIES.has(categories[v.id] ?? ''));
}
export const DAY = 24 * 60 * 60 * 1000;
/** ISO date `days` ago, rounded to the day so cached query results stay stable. */
export const daysAgo = (days: number) => new Date(Math.floor((Date.now() - days * DAY) / DAY) * DAY).toISOString();
export interface VideoSearch { q: string; order: 'viewCount' | 'relevance' | 'date'; publishedAfter?: string; videoDuration?: 'short' | 'medium' | 'long'; maxResults?: number }
/** search.list for embeddable English videos (100 quota units per call). */
export async function searchVideos({ q, order, publishedAfter, videoDuration, maxResults = 25 }: VideoSearch, signal?: AbortSignal): Promise<Video[]> {
  const data = await request<{ items: Item[] }>('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', q, order, ...searchBias(), maxResults: String(maxResults), ...(publishedAfter ? { publishedAfter } : {}), ...(videoDuration ? { videoDuration } : {}) }, signal);
  return filterVideos(data.items.map(normalize), signal);
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
