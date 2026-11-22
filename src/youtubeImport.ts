import type { Channel } from './channels';
import { classifyByKeywords, classifyByTitles } from './classify';
import { subscribedChannels, recentUploadTitles } from './channelApi';
import { saveSubscriptions } from './subscriptionStore';
import { requestYouTubeAccess, revokeYouTubeAccess } from './youtubeAuth';
export interface ImportResult { matched: Channel[]; others: Channel[]; total: number }
const MAX_TITLE_CHECKS = 500;
const CONCURRENCY = 8;
/** Sorts subscriptions into likely AI/dev channels (pre-selected for review) and everything else. Channels keywords reject get a second look at their recent upload titles. */
export function sortSubscriptions(subscriptions: { channel: Channel; keywords?: string }[], uploadTitles?: Map<string, string[]>): ImportResult {
  const matched: Channel[] = [];
  const others: Channel[] = [];
  for (const { channel, keywords } of subscriptions) {
    let result = classifyByKeywords({ ...channel, keywords });
    const titles = uploadTitles?.get(channel.id);
    if (!result.dev && titles?.length) {
      const byUploads = classifyByTitles(channel.id, titles);
      if (byUploads.dev) result = byUploads;
    }
    (result.dev ? matched : others).push({ ...channel, topics: result.topics });
  }
  const byTitle = (a: Channel, b: Channel) => a.title.localeCompare(b.title);
  return { matched: matched.sort(byTitle), others: others.sort(byTitle), total: subscriptions.length };
}
/** Runs `task` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => { while (next < items.length) await task(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
/** One-shot, read-only import: the token is revoked as soon as the subscriptions are read. */
export async function importFromYouTube(): Promise<ImportResult> {
  const token = await requestYouTubeAccess();
  try {
    const subscriptions = await subscribedChannels(token);
    const unmatched = subscriptions.filter(s => !classifyByKeywords({ ...s.channel, keywords: s.keywords }).dev && s.channel.uploadsId).slice(0, MAX_TITLE_CHECKS);
    const uploadTitles = new Map<string, string[]>();
    await pool(unmatched, CONCURRENCY, async ({ channel }) => {
      try { uploadTitles.set(channel.id, await recentUploadTitles(channel.uploadsId!, token)); } catch { /* no titles for this channel */ }
    });
    saveSubscriptions(subscriptions.map(s => s.channel.id));
    return sortSubscriptions(subscriptions, uploadTitles);
  } finally { revokeYouTubeAccess(token); }
}
