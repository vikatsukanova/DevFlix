/** Everything a person personalises. These keys are what gets saved to their account when they sign in. */
export const SYNCED_KEYS = [
  'devflix-settings-v1',
  'devflix-preferences-v1',
  'devflix-following-v1',
  'devflix-youtube-subscriptions-v1',
  'devflix-library-v1',
] as const;
export type SyncedData = Partial<Record<(typeof SYNCED_KEYS)[number], unknown>>;

const writeListeners = new Set<() => void>();
/** Stores call this instead of localStorage.setItem so account sync hears about the change. */
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* session-only fallback */ }
  writeListeners.forEach(fn => fn());
}
export function onLocalWrite(fn: () => void) { writeListeners.add(fn); return () => { writeListeners.delete(fn); }; }

export function readLocalData(): SyncedData {
  const data: SyncedData = {};
  for (const key of SYNCED_KEYS) {
    try { const raw = localStorage.getItem(key); if (raw !== null) data[key] = JSON.parse(raw); } catch { /* skip unreadable values */ }
  }
  return data;
}
/** Overwrites local data with the account's copy. Keys the account doesn't have are left alone. */
export function writeLocalData(data: SyncedData) {
  for (const key of SYNCED_KEYS) {
    if (data[key] === undefined) continue;
    const newValue = JSON.stringify(data[key]);
    try { localStorage.setItem(key, newValue); } catch { /* storage unavailable */ }
    // Stores already reload on cross-tab storage events, so this updates them if the app is already on screen.
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  }
}
export function clearLocalData() {
  for (const key of SYNCED_KEYS) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
}
