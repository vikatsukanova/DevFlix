// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalize } from './api';
import { queryKeys } from './queryKeys';
import { readLibrary, saveProgress, toggleSaved } from './storage';
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
describe('local library', () => {
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
