// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChannelsPage, FollowingPage } from './ChannelsPage';
import { curatedChannels } from './channels';
import { readFollowing, toggleFollow } from './channelStore';
import { mergeFeed } from './channelApi';
import type { Video } from './api';
vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), isDemo: true }));
afterEach(() => { cleanup(); for (const c of readFollowing(localStorage.getItem('devflix-following-v1'))) toggleFollow(c); vi.restoreAllMocks(); });
it('validates stored channels and deduplicates follows', () => {
  expect(readFollowing('null')).toEqual([]);
  expect(readFollowing('{broken')).toEqual([]);
  expect(readFollowing(JSON.stringify([{}, null, curatedChannels[0], curatedChannels[0]]))).toEqual([curatedChannels[0]]);
});
it('persists follow and unfollow across module reloads', async () => {
  toggleFollow(curatedChannels[0]);
  expect(readFollowing(localStorage.getItem('devflix-following-v1'))).toEqual([curatedChannels[0]]);
  vi.resetModules();
  const restored = await import('./channelStore');
  restored.toggleFollow(curatedChannels[0]);
  expect(readFollowing(localStorage.getItem('devflix-following-v1'))).toEqual([]);
  toggleFollow(curatedChannels[0]);
});
it('merges channels without duplicate videos and sorts newest first', () => {
  const older: Video = { id: 'a', title: 'Older', channel: 'One', description: '', thumbnail: '', publishedAt: '2025-01-01' };
  const newer = { ...older, id: 'b', publishedAt: '2026-01-01' };
  expect(mergeFeed([[older], [newer, older]]).map(v => v.id)).toEqual(['b', 'a']);
});
it('filters channels, follows a creator and shows their feed', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><ChannelsPage/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'DevOps' }));
  expect(screen.queryByRole('button', { name: 'Follow Fireship' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Follow TechWorld with Nana' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
  fireEvent.click(screen.getByRole('button', { name: 'Follow Fireship' }));
  expect(screen.getByRole('button', { name: 'Unfollow Fireship' }).getAttribute('aria-pressed')).toBe('true');
  result.unmount();
  render(<QueryClientProvider client={client}><FollowingPage onOpen={() => {}} onBrowse={() => {}} Card={({ video }) => <div>{video.title}</div>}/></QueryClientProvider>);
  expect(screen.getByText('React in 100 Seconds')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Unfollow Fireship' }));
  expect(screen.getByText('Your feed starts with a follow.')).toBeTruthy();
});
