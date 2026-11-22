import type { Channel } from './channels';
import { classifyByKeywords } from './classify';
import { subscribedChannels } from './channelApi';
import { requestYouTubeAccess, revokeYouTubeAccess } from './youtubeAuth';
export interface ImportResult { matched: Channel[]; others: Channel[]; total: number }
/** Sorts subscriptions into likely AI/dev channels (pre-selected for review) and everything else. */
export function sortSubscriptions(subscriptions: { channel: Channel; keywords?: string }[]): ImportResult {
  const matched: Channel[] = [];
  const others: Channel[] = [];
  for (const { channel, keywords } of subscriptions) {
    const result = classifyByKeywords({ ...channel, keywords });
    (result.dev ? matched : others).push({ ...channel, topics: result.topics });
  }
  const byTitle = (a: Channel, b: Channel) => a.title.localeCompare(b.title);
  return { matched: matched.sort(byTitle), others: others.sort(byTitle), total: subscriptions.length };
}
/** One-shot, read-only import: the token is revoked as soon as the subscriptions are read. */
export async function importFromYouTube(): Promise<ImportResult> {
  const token = await requestYouTubeAccess();
  try { return sortSubscriptions(await subscribedChannels(token)); }
  finally { revokeYouTubeAccess(token); }
}
