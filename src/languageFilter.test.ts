import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Api from './api';
import type * as Settings from './settings';

// isDemo is read when api.ts loads, so live mode is switched on with a stubbed key before importing.
let api: typeof Api;
let settings: typeof Settings;
beforeAll(async () => {
  vi.stubEnv('VITE_YT_API_KEY', 'test-key');
  vi.resetModules();
  api = await import('./api');
  settings = await import('./settings');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); settings.saveSettings(settings.defaultSettings('US')); });

const video = (id: string, title: string): Api.Video => ({ id, title, channel: 'Creator', thumbnail: '', description: '' });
const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('matchesLanguage', () => {
  it('keeps English audio tags except the ones listed as unreliable', () => {
    expect(api.matchesLanguage(video('a', 'Lesson'), { audio: 'en-IN' }, 'en', false)).toBe(false);
    expect(api.matchesLanguage(video('a', 'Lesson'), { audio: 'en-GB' }, 'en', false)).toBe(true);
  });

  it('drops a video whose audio is not in the chosen language even when the title is', () => {
    expect(api.matchesLanguage(video('b', 'React hooks explained'), { audio: 'de' }, 'en', false)).toBe(false);
  });

  it('drops a video with no audio language but a different metadata language', () => {
    expect(api.matchesLanguage(video('c', 'Introducción a React'), { metadata: 'es' }, 'en', false)).toBe(false);
  });

  it('drops a video with no language data when its title is mostly non-Latin', () => {
    expect(api.matchesLanguage(video('d', 'नमस्ते दुनिया सीखें'), undefined, 'en', false)).toBe(false);
  });

  it('keeps a video with no language data and an English title outside strict mode', () => {
    expect(api.matchesLanguage(video('e', 'Kubernetes in 10 minutes'), undefined, 'en', false)).toBe(true);
  });

  it('keeps Spanish audio, including regional tags, and drops English audio when Spanish is chosen', () => {
    expect(api.matchesLanguage(video('f', 'Lección de React'), { audio: 'es-MX' }, 'es', false)).toBe(true);
    expect(api.matchesLanguage(video('g', 'Lección de React'), { audio: 'en' }, 'es', false)).toBe(false);
  });

  it('keeps every video when the language is "any"', () => {
    expect(api.matchesLanguage(video('h', 'नमस्ते दुनिया सीखें'), { audio: 'de', metadata: 'fr' }, 'any', true)).toBe(true);
    expect(api.matchesLanguage(video('i', 'Untagged'), undefined, 'any', true)).toBe(true);
  });

  it('drops untagged videos in strict mode ("Only my region")', () => {
    expect(api.matchesLanguage(video('j', 'Kubernetes in 10 minutes'), undefined, 'en', true)).toBe(false);
  });

  it('does not apply the Latin-title check to a non-Latin language such as Japanese', () => {
    expect(api.matchesLanguage(video('k', 'नमस्ते दुनिया सीखें'), undefined, 'ja', false)).toBe(true);
    expect(api.matchesLanguage(video('l', 'नमस्ते दुनिया सीखें'), undefined, 'en', false)).toBe(false);
  });
});

describe('searchBias', () => {
  it('omits the language for "any" and sends only the first chosen country', () => {
    settings.saveSettings({ language: 'any', countries: ['CA'], creatorRegion: 'prefer' });
    expect(api.searchBias()).toEqual({ regionCode: 'CA' });
  });
  it('sends the chosen language and the first chosen country', () => {
    settings.saveSettings({ language: 'es', countries: ['MX', 'ES'], creatorRegion: 'prefer' });
    expect(api.searchBias()).toEqual({ relevanceLanguage: 'es', regionCode: 'MX' });
  });
});

describe('filterVideos', () => {
  it('returns an empty list without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.filterVideos([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks language fields with one videos.list call and keeps only videos in the chosen language (English by default)', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => json({
      items: [
        { id: 'en', snippet: { defaultAudioLanguage: 'en' } },
        { id: 'hi', snippet: { defaultAudioLanguage: 'de', defaultLanguage: 'de' } },
        { id: 'es', snippet: { defaultLanguage: 'es' } },
        { id: 'dev', snippet: { defaultLanguage: 'de' } },
        { id: 'ru', snippet: {} },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const kept = await api.filterVideos([
      video('en', 'English lesson'),
      video('hi', 'Non-English lesson'),
      video('es', 'Lección en español'),
      video('dev', 'नमस्ते'),
      video('ru', 'Урок'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/videos$/);
    expect(url.searchParams.get('part')).toBe('snippet');
    expect(url.searchParams.get('id')).toBe('en,hi,es,dev,ru');
    expect(kept.map(v => v.id)).toEqual(['en']);
  });

  it('drops videos in blocked categories such as Gaming and News & Politics, using the same call', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => json({
      items: [
        { id: 'tech', snippet: { defaultAudioLanguage: 'en', categoryId: '28' } },
        { id: 'edu', snippet: { defaultAudioLanguage: 'en', categoryId: '27' } },
        { id: 'game', snippet: { defaultAudioLanguage: 'en', categoryId: '20' } },
        { id: 'politics', snippet: { defaultAudioLanguage: 'en', categoryId: '25' } },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const kept = await api.filterVideos(['tech', 'edu', 'game', 'politics'].map(id => video(id, 'Lesson')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(kept.map(v => v.id)).toEqual(['tech', 'edu']);
  });

  it('batches video IDs 50 at a time', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const videos = Array.from({ length: 51 }, (_, i) => video(`v${i}`, `Lesson ${i}`));

    await api.filterVideos(videos);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
