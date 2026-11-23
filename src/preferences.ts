import { useSyncExternalStore } from 'react';
import { writeLocal } from './localData';
import { channelTopics, type ChannelTopic } from './channels';
export type Interest = Exclude<ChannelTopic, 'All topics'>;
export interface Preferences { completed: boolean; interests: Interest[] }
export const preferenceKey = 'devflix-preferences-v1';
export function readPreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? '{}');
    return { completed: value?.completed === true, interests: Array.isArray(value?.interests) ? [...new Set<Interest>(value.interests.filter((t: unknown): t is Interest => typeof t === 'string' && t !== 'All topics' && channelTopics.includes(t as ChannelTopic)))] : [] };
  } catch { return { completed: false, interests: [] }; }
}
let state = readPreferences(null);
try { state = readPreferences(localStorage.getItem(preferenceKey)); } catch { /* session fallback */ }
const listeners = new Set<() => void>();
export function savePreferences(interests: Interest[]) {
  state = { completed: true, interests: [...interests] };
  writeLocal(preferenceKey, state);
  listeners.forEach(fn => fn());
}
window.addEventListener('storage', event => {
  if (event.key !== preferenceKey && event.key !== null) return;
  try { state = readPreferences(localStorage.getItem(preferenceKey)); } catch { state = readPreferences(null); }
  listeners.forEach(fn => fn());
});
export const usePreferences = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
