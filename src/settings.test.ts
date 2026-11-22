// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, detectCountry, getSettings, readSettings, saveSettings, settingsKey, type Settings } from './settings';

const storageKey = 'devflix-settings-v1';
const fallback: Settings = { language: 'en', countries: ['US', 'CA'], creatorRegion: 'prefer' };

// Detection reads navigator and the time zone at call time, so each test pins both.
function pinLocale(languages: string[], timeZone: string) {
  vi.stubGlobal('navigator', { languages, language: languages[0] });
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
    return { resolvedOptions: () => ({ timeZone }) } as Intl.DateTimeFormat;
  });
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  saveSettings(defaultSettings('US'));
});

describe('detectCountry', () => {
  it('reads the region from a language tag such as en-CA', () => {
    expect(detectCountry(['en-CA'], 'Europe/London')).toBe('CA');
  });
  it('falls back to the time zone when the language tag has no region', () => {
    expect(detectCountry(['en'], 'America/Toronto')).toBe('CA');
  });
  it('returns undefined when neither the language nor the time zone is known', () => {
    expect(detectCountry(['fr'], 'Mars/Olympus')).toBeUndefined();
  });
  it('uses the browser languages and time zone when no arguments are given', () => {
    pinLocale(['en-GB', 'en'], 'America/New_York');
    expect(detectCountry()).toBe('GB');
  });
});

describe('defaultSettings', () => {
  it('pairs Canada with the United States', () => {
    expect(defaultSettings('CA')).toEqual({ language: 'en', countries: ['US', 'CA'], creatorRegion: 'prefer' });
  });
  it('pairs the United Kingdom with Ireland', () => {
    expect(defaultSettings('GB').countries).toEqual(['GB', 'IE']);
  });
  it('uses only the detected country when it has no neighbour in the groups', () => {
    expect(defaultSettings('DE')).toEqual({ language: 'en', countries: ['DE'], creatorRegion: 'prefer' });
  });
  it('falls back to the US group when no country is detected', () => {
    pinLocale(['fr'], 'Mars/Olympus');
    expect(defaultSettings(undefined)).toEqual({ language: 'en', countries: ['US', 'CA'], creatorRegion: 'prefer' });
  });
});

describe('readSettings', () => {
  it('uses the fallback when nothing is stored or the JSON is unusable', () => {
    expect(readSettings(null, fallback)).toEqual(fallback);
    expect(readSettings('{not json', fallback)).toEqual(fallback);
    expect(readSettings('null', fallback)).toEqual(fallback);
    expect(readSettings('"en"', fallback)).toEqual(fallback);
  });
  it('replaces an unknown language with the fallback language', () => {
    expect(readSettings(JSON.stringify({ language: 'xx', countries: ['GB'], creatorRegion: 'any' }), fallback))
      .toEqual({ language: 'en', countries: ['GB'], creatorRegion: 'any' });
  });
  it('accepts "any" as a language', () => {
    expect(readSettings(JSON.stringify({ language: 'any', countries: ['US'], creatorRegion: 'prefer' }), fallback).language).toBe('any');
  });
  it('drops malformed country codes and removes duplicates', () => {
    const raw = JSON.stringify({ language: 'en', countries: ['us', 'GB', 'GBR', 42, 'GB', null], creatorRegion: 'prefer' });
    expect(readSettings(raw, fallback).countries).toEqual(['GB']);
  });
  it('uses the fallback countries when none are valid or the list is empty', () => {
    expect(readSettings(JSON.stringify({ language: 'es', countries: ['us', 'gb'], creatorRegion: 'only' }), fallback).countries).toEqual(['US', 'CA']);
    expect(readSettings(JSON.stringify({ language: 'es', countries: [], creatorRegion: 'only' }), fallback).countries).toEqual(['US', 'CA']);
  });
  it('replaces an invalid creator mode with the fallback mode and keeps a valid one', () => {
    expect(readSettings(JSON.stringify({ language: 'en', countries: ['US'], creatorRegion: 'sometimes' }), fallback).creatorRegion).toBe('prefer');
    expect(readSettings(JSON.stringify({ language: 'en', countries: ['US'], creatorRegion: 'only' }), fallback).creatorRegion).toBe('only');
  });
});

describe('saveSettings', () => {
  it('persists the settings and changes the key used by queries', () => {
    const before = settingsKey();
    saveSettings({ language: 'es', countries: ['MX', 'ES'], creatorRegion: 'only' });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ language: 'es', countries: ['MX', 'ES'], creatorRegion: 'only' });
    expect(getSettings()).toEqual({ language: 'es', countries: ['MX', 'ES'], creatorRegion: 'only' });
    expect(settingsKey()).not.toBe(before);
  });
  it('keys queries the same regardless of the order of countries', () => {
    saveSettings({ language: 'es', countries: ['MX', 'ES'], creatorRegion: 'only' });
    const one = settingsKey();
    saveSettings({ language: 'es', countries: ['ES', 'MX'], creatorRegion: 'only' });
    expect(settingsKey()).toBe(one);
    expect(one).toBe('es|only|ES,MX');
  });
  it('reads back what was saved when the module loads again', async () => {
    saveSettings({ language: 'ja', countries: ['JP'], creatorRegion: 'any' });
    vi.resetModules();
    const reloaded = await import('./settings');
    expect(reloaded.getSettings()).toEqual({ language: 'ja', countries: ['JP'], creatorRegion: 'any' });
  });
});

describe('detectCountry with script subtags', () => {
  it('finds the region after a script subtag', () => {
    expect(detectCountry(['zh-Hant-TW'], 'UTC')).toBe('TW');
    expect(detectCountry(['sr-Latn-RS'], 'UTC')).toBe('RS');
  });
});
