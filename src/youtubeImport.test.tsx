// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Onboarding from './Onboarding';
import { classifyByKeywords } from './classify';
import { importFromYouTube, sortSubscriptions, type ImportResult } from './youtubeImport';
import { loadGoogleSignIn } from './youtubeAuth';
import { curatedChannels, type Channel } from './channels';
import { readFollowing, setFollowing } from './channelStore';

const flags = vi.hoisted(() => ({ canImportYouTube: true }));

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), isDemo: true }));
vi.mock('./youtubeAuth', async importOriginal => ({
  ...await importOriginal<typeof import('./youtubeAuth')>(),
  get canImportYouTube() { return flags.canImportYouTube; },
  loadGoogleSignIn: vi.fn(() => Promise.resolve({})),
}));
vi.mock('./youtubeImport', async importOriginal => ({
  ...await importOriginal<typeof import('./youtubeImport')>(),
  importFromYouTube: vi.fn(),
}));

const matched: Channel = { id: 'UCa1B2c3D4e5F6g7H8i9J0k_', title: 'Dev Daily Python', description: 'Python programming and AI agents', topics: ['AI & Agents'] };
const other: Channel = { id: 'UCz9Y8x7W6v5U4t3S2r1Q0p-', title: 'Gardening Weekly', description: 'Tomatoes and compost', topics: [] };
const result: ImportResult = { matched: [matched], others: [other], total: 2 };

beforeEach(() => {
  flags.canImportYouTube = true;
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(importFromYouTube).mockReset();
  vi.mocked(importFromYouTube).mockResolvedValue(result);
  setFollowing([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem('devflix-following-v1');
});

function wrapper(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

it('classifies curated channels as curated with their own topics', () => {
  const classification = classifyByKeywords({ ...curatedChannels[0] });
  expect(classification).toEqual({ id: curatedChannels[0].id, dev: true, topics: curatedChannels[0].topics, source: 'curated' });
});

it('classifies AI channels by keyword and assigns the AI & Agents topic', () => {
  const classification = classifyByKeywords({ id: 'UCtestchannel', title: 'Daily LLM and AI agents tutorials', description: '' });
  expect(classification.dev).toBe(true);
  expect(classification.source).toBe('keywords');
  expect(classification.topics).toContain('AI & Agents');
});

it('treats generic programming channels as dev without assigning topics', () => {
  expect(classifyByKeywords({ id: 'UCtestchannel', title: 'Python programming tutorials', description: '' })).toEqual({ id: 'UCtestchannel', dev: true, topics: [], source: 'keywords' });
});

it('rejects unrelated channels', () => {
  expect(classifyByKeywords({ id: 'UCtestchannel', title: 'Easy weeknight dinners', description: 'Home cooking with fresh ingredients' })).toEqual({ id: 'UCtestchannel', dev: false, topics: [], source: 'none' });
});

it('assigns DevOps for Kubernetes and Docker channels', () => {
  expect(classifyByKeywords({ id: 'UCtestchannel', title: 'Kubernetes and Docker', description: '' }).topics).toContain('DevOps');
});

it('splits subscriptions into matched and others, sorted by title with topics set on matches', () => {
  const sorted = sortSubscriptions([
    { channel: { id: 'UCzeta000000000000000a', title: 'Zeta Cloud', description: 'Kubernetes and Docker', topics: [] } },
    { channel: { id: 'UCalpha00000000000000b', title: 'Alpha Cooking', description: 'Recipes for weeknights', topics: [] } },
    { channel: { id: 'UCbeta0000000000000000c', title: 'Beta Python', description: 'Python programming', topics: [] } },
    { channel: { id: 'UCalphaai000000000000d', title: 'Alpha AI', description: '', topics: [] }, keywords: 'machine learning' },
  ]);
  expect(sorted.matched.map(c => c.title)).toEqual(['Alpha AI', 'Beta Python', 'Zeta Cloud']);
  expect(sorted.others.map(c => c.title)).toEqual(['Alpha Cooking']);
  expect(sorted.matched.find(c => c.title === 'Alpha AI')?.topics).toEqual(['AI & Agents']);
  expect(sorted.matched.find(c => c.title === 'Zeta Cloud')?.topics).toEqual(['DevOps']);
  expect(sorted.total).toBe(4);
});

it('imports subscriptions, pre-selects matches for review, and saves them on finish', async () => {
  const done = vi.fn();
  wrapper(<Onboarding editing={false} onDone={done}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import from YouTube' }));

  const choice = await screen.findByRole('button', { name: 'Select Dev Daily Python' });
  expect(choice.getAttribute('aria-pressed')).toBe('true');
  expect(importFromYouTube).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Select Gardening Weekly' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Show 1 other subscription' }));
  expect(screen.getByRole('button', { name: 'Select Gardening Weekly' }).getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(screen.getByRole('button', { name: 'Build my homepage' }));
  expect(done).toHaveBeenCalledOnce();
  expect(readFollowing(localStorage.getItem('devflix-following-v1')).map(c => c.id)).toEqual([matched.id]);
});

it('shows import errors in an alert and retries the import', async () => {
  vi.mocked(importFromYouTube)
    .mockRejectedValueOnce(new Error('YouTube access wasn’t granted, so nothing was imported.'))
    .mockResolvedValueOnce(result);
  wrapper(<Onboarding editing={false} onDone={() => {}}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import from YouTube' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('YouTube access wasn’t granted, so nothing was imported.');

  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Select Dev Daily Python' })).toBeTruthy();
  expect(importFromYouTube).toHaveBeenCalledTimes(2);
});

it('hides the import panel when YouTube import is not configured', () => {
  flags.canImportYouTube = false;
  vi.mocked(loadGoogleSignIn).mockClear();
  wrapper(<Onboarding editing={false} onDone={() => {}}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.queryByRole('button', { name: 'Import from YouTube' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Find a creator' })).toBeTruthy();
  expect(loadGoogleSignIn).not.toHaveBeenCalled();
});
