// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pullOrSeed, startPushing, type ProfileStore } from './account';
import { clearLocalData, readLocalData, writeLocal, writeLocalData, type SyncedData } from './localData';
import { getSettings } from './settings';

function fakeStore(remote: SyncedData | null) {
  const saved: SyncedData[] = [];
  const store: ProfileStore = { load: vi.fn(async () => remote), save: vi.fn(async data => { saved.push(data); }) };
  return { store, saved };
}
const list = { saved: [], watching: [] };
beforeEach(() => clearLocalData());
afterEach(() => { vi.useRealTimers(); clearLocalData(); });

it('uploads this browser’s data to a brand-new account', async () => {
  writeLocal('devflix-preferences-v1', { completed: true, interests: ['Frontend'] });
  const { store, saved } = fakeStore(null);
  await pullOrSeed(store);
  expect(saved).toEqual([{ 'devflix-preferences-v1': { completed: true, interests: ['Frontend'] } }]);
});

it('replaces local data with the account’s copy and uploads keys only this browser has', async () => {
  writeLocal('devflix-preferences-v1', { completed: true, interests: ['Frontend'] });
  writeLocal('devflix-library-v1', list);
  const remote = { 'devflix-preferences-v1': { completed: true, interests: ['DevOps'] } };
  const { store, saved } = fakeStore(remote);
  await pullOrSeed(store);
  expect(readLocalData()).toEqual({ ...remote, 'devflix-library-v1': list });
  expect(saved).toEqual([{ ...remote, 'devflix-library-v1': list }]);
});

it('does not upload when the account already has everything this browser has', async () => {
  writeLocal('devflix-library-v1', list);
  const { store, saved } = fakeStore({ 'devflix-library-v1': { saved: [], watching: [] } });
  await pullOrSeed(store);
  expect(saved).toEqual([]);
});

it('updates stores that are already loaded when the account’s copy arrives', () => {
  writeLocalData({ 'devflix-settings-v1': { language: 'de', countries: ['DE'], creatorRegion: 'any' } });
  expect(getSettings()).toEqual({ language: 'de', countries: ['DE'], creatorRegion: 'any' });
});

it('batches quick changes into one upload, and uploads right away when the tab is hidden', async () => {
  vi.useFakeTimers();
  const { store, saved } = fakeStore(null);
  const pusher = startPushing(store, () => {}, 3000);
  writeLocal('devflix-library-v1', list);
  writeLocal('devflix-following-v1', []);
  expect(saved).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(3000);
  expect(saved).toEqual([{ 'devflix-library-v1': list, 'devflix-following-v1': [] }]);

  writeLocal('devflix-following-v1', []);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(saved).toHaveLength(2);
  pusher.stop();
});

it('reports upload failures so the app can say changes are only saved locally', async () => {
  vi.useFakeTimers();
  const onResult = vi.fn();
  const pusher = startPushing({ load: async () => null, save: async () => { throw new Error('offline'); } }, onResult, 1000);
  writeLocal('devflix-library-v1', list);
  await vi.advanceTimersByTimeAsync(1000);
  expect(onResult).toHaveBeenCalledWith(expect.any(Error));
  pusher.stop();
});
