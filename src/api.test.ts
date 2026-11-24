// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalize } from './api';
import { queryKeys } from './queryKeys';
import { clearWatching, readLibrary, saveProgress, toggleSaved } from './storage';
const video = { id: 'abc', title: 'A lesson', channel: 'Creator', thumbnail: 'https://example.com/image.jpg', description: '' };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('cache identity', () => {
  it('normalizes equivalent searches without mixing resources', () => {
    expect(queryKeys.search(' React ')).toEqual(queryKeys.search('react'));
    expect(queryKeys.playlist('abc')).not.toEqual(queryKeys.video('abc'));
  });
});
describe('YouTube normalization', () => {
  it('uses the video owner and resource ID from playlist items', () => {
    expect(normalize({ id: 'playlist-entry', snippet: { title: 'Lesson', channelTitle: 'Curator', videoOwnerChannelTitle: 'Teacher', description: '', resourceId: { videoId: 'video-id' }, thumbnails: { high: { url: 'image' } } } })).toMatchObject({ id: 'video-id', channel: 'Teacher', thumbnail: 'image' });
  });
});
describe('YouTube request routing', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('routes through relative same-origin VITE_YT_PROXY_URL without sending an API key', async () => {
    vi.stubEnv('VITE_YT_PROXY_URL', '/api/youtube/');
    vi.stubEnv('VITE_YT_API_KEY', 'should-not-be-sent');
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { isDemo, request } = await import('./api');

    expect(isDemo).toBe(false);
    await request('search', { part: 'snippet', q: 'react' }, undefined, 'oauth-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(calledUrl, 'https://devflix.workers.dev');
    expect(calledUrl.startsWith('/api/youtube/search?')).toBe(true);
    expect(parsed.searchParams.get('q')).toBe('react');
    expect(parsed.searchParams.get('key')).toBeNull();
    expect(init.headers).toEqual({ Authorization: 'Bearer oauth-token' });
  });

  it('falls back to YouTube directly when only VITE_YT_API_KEY is set', async () => {
    vi.stubEnv('VITE_YT_PROXY_URL', '');
    vi.stubEnv('VITE_YT_API_KEY', 'local-dev-key');
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { isDemo, request } = await import('./api');

    expect(isDemo).toBe(false);
    await request('videos', { part: 'snippet', id: 'abc' });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    const parsed = new URL(calledUrl);
    expect(parsed.origin + parsed.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect(parsed.searchParams.get('key')).toBe('local-dev-key');
  });
});
describe('local library', () => {
  it('clears Continue Watching without touching My List', () => {
    toggleSaved(video);
    saveProgress(video, 30, 100);
    clearWatching();
    const library = readLibrary(localStorage.getItem('devflix-library-v1'));
    expect(library.watching).toHaveLength(0);
    expect(library.saved).toContainEqual(video);
    toggleSaved(video);
  });
  it('recovers from malformed or incompatible storage', () => {
    expect(readLibrary('{broken')).toEqual({ saved: [], watching: [] });
    expect(readLibrary('null')).toEqual({ saved: [], watching: [] });
    expect(readLibrary('{"saved":[null,{}],"watching":[{}]}')).toEqual({ saved: [], watching: [] });
  });
  it('toggles saved videos and removes completed videos from continue watching', () => {
    toggleSaved(video);
    expect(readLibrary(localStorage.getItem('devflix-library-v1')).saved).toContainEqual(video);
    toggleSaved(video);
    expect(readLibrary(localStorage.getItem('devflix-library-v1')).saved).toHaveLength(0);
    saveProgress(video, 30, 100);
    expect(readLibrary(localStorage.getItem('devflix-library-v1')).watching[0].seconds).toBe(30);
    saveProgress(video, 96, 100);
    expect(readLibrary(localStorage.getItem('devflix-library-v1')).watching).toHaveLength(0);
  });
});
