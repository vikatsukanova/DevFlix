// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Onboarding from './Onboarding';
import App from './App';
import { preferenceKey, readPreferences } from './preferences';
import { readFollowing, setFollowing } from './channelStore';
import { curatedChannels } from './channels';
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), isDemo: true }));
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.removeItem(preferenceKey);
  window.dispatchEvent(new StorageEvent('storage', { key: preferenceKey }));
  setFollowing([]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function wrapper(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
it('validates stored preferences and maps all supported topics', () => {
  expect(readPreferences('null')).toEqual({ completed: false, interests: [] });
  expect(readPreferences('bad')).toEqual({ completed: false, interests: [] });
  expect(readPreferences(JSON.stringify({ completed: true, interests: ['Frontend', 'Frontend', 'All topics', 'unknown'] }))).toEqual({ completed: true, interests: ['Frontend'] });
});
it('completes onboarding and personalizes the homepage, while keeping Discover available', async () => {
  wrapper(<App/>);
  fireEvent.click(screen.getByRole('button', { name: /React & Frontend/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select Fireship' }));
  fireEvent.click(screen.getByRole('button', { name: 'Build my homepage' }));
  expect(readPreferences(localStorage.getItem(preferenceKey))).toEqual({ completed: true, interests: ['Frontend'] });
  expect(readFollowing(localStorage.getItem('devflix-following-v1'))[0].title).toBe('Fireship');
  expect(screen.getByRole('heading', { name: 'Trending in your interests' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'From your channels' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Trending in Frontend' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Trending in Backend' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Discover$/ }));
  expect(screen.getByRole('heading', { name: 'Trending in Backend' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Trending in Frontend' })).toBeTruthy();
});
it('skip discards drafts, preserves follows, and does not repeat on a returning visit', () => {
  setFollowing([curatedChannels[1]]);
  const rendered = wrapper(<App/>);
  fireEvent.click(screen.getByRole('button', { name: /AI & Agents/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
  expect(readPreferences(localStorage.getItem(preferenceKey))).toEqual({ completed: true, interests: [] });
  expect(readFollowing(localStorage.getItem('devflix-following-v1'))).toEqual([curatedChannels[1]]);
  rendered.unmount();
  wrapper(<App/>);
  expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit interests' })).toBeTruthy();
});
it('allows empty completion and cancelling edits without changing persisted choices', () => {
  const done = vi.fn();
  const initial = wrapper(<Onboarding editing={false} onDone={done}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Build my homepage' }));
  expect(done).toHaveBeenCalledOnce();
  initial.unmount();
  wrapper(<Onboarding editing onDone={done}/>);
  fireEvent.click(screen.getByRole('button', { name: /Backend/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select ByteByteGo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(readPreferences(localStorage.getItem(preferenceKey)).interests).toEqual([]);
  expect(readFollowing(localStorage.getItem('devflix-following-v1'))).toEqual([]);
});
it('preserves hidden selections across search, back navigation and editing', () => {
  setFollowing([curatedChannels[1]]);
  wrapper(<Onboarding editing onDone={() => {}}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('button', { name: 'Select Theo - t3.gg' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.change(screen.getByRole('textbox', { name: 'Find a creator' }), { target: { value: 'Fireship' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select Fireship' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(screen.getByRole('button', { name: /DevOps/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save my interests' }));
  expect(readFollowing(localStorage.getItem('devflix-following-v1')).map(c => c.title)).toEqual(['Theo - t3.gg', 'Fireship']);
  expect(readPreferences(localStorage.getItem(preferenceKey)).interests).toEqual(['DevOps']);
});
