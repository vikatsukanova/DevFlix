import { useSyncExternalStore } from 'react';
// Channel IDs from the last YouTube import, kept locally so search results can say "Subscribed".
const key = 'devflix-youtube-subscriptions-v1';
export function readSubscriptions(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string' && /^UC[\w-]{22}$/.test(id)))] : [];
  } catch { return []; }
}
let ids: string[] = [];
try { ids = readSubscriptions(localStorage.getItem(key)); } catch { /* session fallback */ }
let lookup = new Set(ids);
const listeners = new Set<() => void>();
export function saveSubscriptions(next: string[]) {
  ids = readSubscriptions(JSON.stringify(next));
  lookup = new Set(ids);
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* session fallback */ }
  listeners.forEach(fn => fn());
}
window.addEventListener('storage', event => { if (event.key === key || event.key === null) { try { ids = readSubscriptions(localStorage.getItem(key)); } catch { ids = []; } lookup = new Set(ids); listeners.forEach(fn => fn()); } });
export const useSubscriptions = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => lookup);
