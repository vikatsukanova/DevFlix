import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Api from './api';

// isDemo is read when api.ts loads, so live mode is switched on with a stubbed key before importing.
let api: typeof Api;
beforeAll(async () => {
  vi.stubEnv('VITE_YT_API_KEY', 'test-key');
  vi.resetModules();
  api = await import('./api');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const video = (id: string, title: string): Api.Video => ({ id, title, channel: 'Creator', thumbnail: '', description: '' });
const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('isEnglishVideo', () => {
  it('keeps English audio tags except the ones listed as unreliable', () => {
    expect(api.isEnglishVideo(video('a', 'Lesson'), { audio: 'en-IN' })).toBe(false);
    expect(api.isEnglishVideo(video('a', 'Lesson'), { audio: 'en-GB' })).toBe(true);
  });

  it('drops a video whose audio is not English even when the title is', () => {
    expect(api.isEnglishVideo(video('b', 'React hooks explained'), { audio: 'de' })).toBe(false);
  });

  it('drops a video with no audio language but a non-English metadata language', () => {
    expect(api.isEnglishVideo(video('c', 'Introducción a React'), { metadata: 'es' })).toBe(false);
  });

  it('drops a video with no language data when its title is mostly non-Latin', () => {
    expect(api.isEnglishVideo(video('d', 'नमस्ते दुनिया सीखें'))).toBe(false);
  });

  it('keeps a video with no language data and an English title', () => {
    expect(api.isEnglishVideo(video('e', 'Kubernetes in 10 minutes'))).toBe(true);
  });
});

describe('englishOnly', () => {
  it('returns an empty list without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.englishOnly([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks language fields with one videos.list call and keeps only English videos', async () => {
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

    const kept = await api.englishOnly([
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
    const kept = await api.englishOnly(['tech', 'edu', 'game', 'politics'].map(id => video(id, 'Lesson')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(kept.map(v => v.id)).toEqual(['tech', 'edu']);
  });

  it('batches video IDs 50 at a time', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const videos = Array.from({ length: 51 }, (_, i) => video(`v${i}`, `Lesson ${i}`));

    await api.englishOnly(videos);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
