import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as ChannelApi from './channelApi';
import type { Channel } from './channels';

// isDemo is read when api.ts loads, so live mode is switched on with a stubbed key before importing.
let channelApi: typeof ChannelApi;
beforeAll(async () => {
  vi.stubEnv('VITE_YT_API_KEY', 'test-key');
  vi.resetModules();
  channelApi = await import('./channelApi');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const channel = (id: string, title: string): Channel => ({ id, title, description: '', uploadsId: `UU${id.slice(2)}`, topics: [] });

describe('isEnglishChannel', () => {
  it('needs at least 60% English uploads', () => {
    const en = { title: 'Lesson', language: { audio: 'en' } };
    const de = { title: 'Lesson', language: { audio: 'de' } };
    expect(channelApi.isEnglishChannel([en, en, en, de, de])).toBe(true);
    expect(channelApi.isEnglishChannel([en, en, de, de, de])).toBe(false);
    expect(channelApi.isEnglishChannel([])).toBe(true);
  });
  it('treats English-titled uploads with non-English audio as non-English', () => {
    expect(channelApi.isEnglishChannel(Array.from({ length: 5 }, () => ({ title: 'What is MCP? Completely explained', language: { audio: 'de', metadata: 'en' } })))).toBe(false);
  });
});

describe('englishChannels', () => {
  it('drops a channel whose latest uploads are mostly non-English and keeps an English one', async () => {
    const other = channel('UCotherLanguageChannel00', 'Other-language channel');
    const english = channel('UCenglishLanguageChannel', 'English channel');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        const prefix = url.searchParams.get('playlistId') === other.uploadsId ? 'h' : 'e';
        return json({ items: [1, 2, 3].map(n => ({ snippet: { title: `Video ${n}`, resourceId: { videoId: `${prefix}${n}` } } })) });
      }
      const ids = url.searchParams.get('id')!.split(',');
      return json({ items: ids.map(id => ({ id, snippet: { defaultAudioLanguage: id.startsWith('h') ? 'de' : 'en' } })) });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await channelApi.englishChannels([other, english])).map(c => c.title)).toEqual(['English channel']);
    const calls = fetchMock.mock.calls.length;
    // Results are remembered for the session, so a second check costs nothing.
    expect((await channelApi.englishChannels([other, english])).map(c => c.title)).toEqual(['English channel']);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
