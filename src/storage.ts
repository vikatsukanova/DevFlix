import { useSyncExternalStore } from 'react';
import type { Video } from './api';
export interface Progress { video: Video; seconds: number; duration: number; updatedAt: number }
interface Library { saved: Video[]; watching: Progress[] }
const key = 'devflix-library-v1';
let state: Library = { saved: [], watching: [] };
export function readLibrary(raw: string | null): Library {
  try {
    const value = JSON.parse(raw ?? '{}');
    const validVideo = (v: Video) => v && typeof v.id === 'string' && typeof v.title === 'string' && typeof v.thumbnail === 'string';
    return { saved: Array.isArray(value.saved) ? value.saved.filter(validVideo) : [], watching: Array.isArray(value.watching) ? value.watching.filter((p: Progress) => p && validVideo(p.video) && Number.isFinite(p.seconds) && Number.isFinite(p.duration)) : [] };
  } catch { return { saved: [], watching: [] }; }
}
try { state = readLibrary(localStorage.getItem(key)); } catch { /* storage unavailable */ }
const listeners = new Set<() => void>();
function publish() { listeners.forEach(fn => fn()); }
function commit(next: Library) { state = next; try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* session-only fallback */ } publish(); }
window.addEventListener('storage', event => { if (event.key === key) { state = readLibrary(event.newValue); publish(); } });
export const toggleSaved = (video: Video) => commit({ ...state, saved: state.saved.some(v => v.id === video.id) ? state.saved.filter(v => v.id !== video.id) : [video, ...state.saved].slice(0, 200) });
export const saveProgress = (video: Video, seconds: number, duration: number) => {
  if (!Number.isFinite(seconds) || seconds < 1 || !Number.isFinite(duration) || duration <= 0) return;
  const remaining = state.watching.filter(p => p.video.id !== video.id);
  commit({ ...state, watching: seconds / duration >= .95 ? remaining : [{ video, seconds, duration, updatedAt: Date.now() }, ...remaining].slice(0, 50) });
};
export const useLibrary = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
