import { useSyncExternalStore } from 'react';
import type { Channel } from './channels';
const key = 'devflix-following-v1';
export function readFollowing(raw: string | null): Channel[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Map(parsed.filter((c): c is Channel => !!c && typeof c.id === 'string' && /^UC[\w-]{22}$/.test(c.id) && typeof c.title === 'string' && typeof c.description === 'string' && Array.isArray(c.topics)).map(c => [c.id, c])).values()];
  } catch { return []; }
}
let following: Channel[] = [];
try { following = readFollowing(localStorage.getItem(key)); } catch { /* session fallback */ }
const listeners = new Set<() => void>();
function notify() { listeners.forEach(fn => fn()); }
window.addEventListener('storage', event => { if (event.key === key || event.key === null) { try { following = readFollowing(localStorage.getItem(key)); } catch { following = []; } notify(); } });
export function setFollowing(channels: Channel[]) {
  following = readFollowing(JSON.stringify(channels));
  try { localStorage.setItem(key, JSON.stringify(following)); } catch { /* session fallback */ }
  notify();
}
export function toggleFollow(channel: Channel) {
  setFollowing(following.some(c => c.id === channel.id) ? following.filter(c => c.id !== channel.id) : [...following, channel]);
}
export const useFollowing = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => following);
