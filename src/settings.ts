import { useSyncExternalStore } from 'react';

/** 'any' turns the language filter off. Otherwise an ISO 639-1 code such as 'en'. */
export type LanguageSetting = string;
/**
 * prefer: hide creators who list another country, keep creators with no country.
 * only: the creator must list one of your countries and the video must be tagged with your language.
 * any: no region filter.
 */
export type CreatorRegion = 'prefer' | 'only' | 'any';
export interface Settings { language: LanguageSetting; countries: string[]; creatorRegion: CreatorRegion }

export const LANGUAGES: { code: LanguageSetting; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' }, { code: 'pt', label: 'Portuguese' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }, { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' }, { code: 'ko', label: 'Korean' }, { code: 'zh', label: 'Chinese' },
  { code: 'ru', label: 'Russian' }, { code: 'any', label: 'Any language' },
];
export const COUNTRIES: { code: string; label: string }[] = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['AU', 'Australia'], ['NZ', 'New Zealand'],
  ['IN', 'India'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['PT', 'Portugal'],
  ['NL', 'Netherlands'], ['SE', 'Sweden'], ['PL', 'Poland'], ['JP', 'Japan'], ['KR', 'South Korea'], ['SG', 'Singapore'], ['ZA', 'South Africa'],
].map(([code, label]) => ({ code, label }));

// Neighbouring markets that share most of their creators, used only for the first-run default.
const REGION_GROUPS: string[][] = [['US', 'CA'], ['GB', 'IE'], ['AU', 'NZ']];
// A few time zones for browsers whose language tag has no country (e.g. plain "en").
const ZONE_COUNTRY: Record<string, string> = {
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Pacific/Auckland': 'NZ',
};

/** Country from the browser's language tag (en-CA) or time zone. No location permission is requested. */
export function detectCountry(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language], timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string | undefined {
  // The region is the first two-letter subtag after the language, so zh-Hant-TW and sr-Latn-RS work too.
  for (const tag of languages) { const region = tag.split('-').slice(1).find(part => /^[A-Za-z]{2}$/.test(part)); if (region) return region.toUpperCase(); }
  return ZONE_COUNTRY[timeZone];
}
export function defaultSettings(country = detectCountry()): Settings {
  const home = country ?? 'US';
  return { language: 'en', countries: REGION_GROUPS.find(g => g.includes(home)) ?? [home], creatorRegion: 'prefer' };
}

const key = 'devflix-settings-v1';
export function readSettings(raw: string | null, fallback: Settings = defaultSettings()): Settings {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return fallback;
    const language = typeof value.language === 'string' && LANGUAGES.some(l => l.code === value.language) ? value.language : fallback.language;
    const countries = Array.isArray(value.countries) ? [...new Set(value.countries.filter((c: unknown): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c)))] as string[] : fallback.countries;
    const creatorRegion = ['prefer', 'only', 'any'].includes(value.creatorRegion) ? value.creatorRegion as CreatorRegion : fallback.creatorRegion;
    return { language, countries: countries.length ? countries : fallback.countries, creatorRegion };
  } catch { return fallback; }
}

let state: Settings = defaultSettings();
try { state = readSettings(localStorage.getItem(key)); } catch { /* session fallback */ }
const listeners = new Set<() => void>();
export const getSettings = () => state;
export function saveSettings(next: Settings) {
  state = readSettings(JSON.stringify(next));
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* session fallback */ }
  listeners.forEach(fn => fn());
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (event.key === key || event.key === null) { try { state = readSettings(localStorage.getItem(key)); } catch { state = defaultSettings(); } listeners.forEach(fn => fn()); } });
export const useSettings = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
/** Part of every YouTube query key, so changing a setting refetches instead of showing results filtered the old way. */
export const settingsKey = (s: Settings = state) => `${s.language}|${s.creatorRegion}|${[...s.countries].sort().join(',')}`;
