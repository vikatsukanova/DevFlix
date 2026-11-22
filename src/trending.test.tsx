// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import Onboarding from './Onboarding';
import { classifyByTitles, topicsForText } from './classify';
import { sortSubscriptions } from './youtubeImport';
import { readSubscriptions, saveSubscriptions } from './subscriptionStore';
import { savePreferences } from './preferences';
import { setFollowing } from './channelStore';
import { curatedChannels, type Channel } from './channels';

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), isDemo: true }));

const subscriptionKey = 'devflix-youtube-subscriptions-v1';
const uploadsChannelId = 'UCuploads0000000000000a';

/** Reports every observed element as visible right away, so rows and sentinels load in tests. */
class AlwaysVisible {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  setFollowing([]);
  saveSubscriptions([]);
  savePreferences([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function wrapper(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

describe('upload-title classification', () => {
  it('judges a channel as dev when enough recent titles match, and keeps topics that recur', () => {
    expect(classifyByTitles(uploadsChannelId, [
      'React tutorial for beginners',
      'TypeScript generics explained',
      'Docker basics in 10 minutes',
      'My weekend cooking vlog',
    ])).toEqual({ id: uploadsChannelId, dev: true, topics: ['Frontend'], source: 'uploads' });
  });

  it('does not judge a channel as dev from a single matching title', () => {
    const titles = ['React tips', 'Garden tour', 'Cat video', 'Baking bread', 'Lunch ideas', 'Knitting', 'Roof repair', 'Piano practice', 'Morning run', 'Tea review'];
    expect(classifyByTitles(uploadsChannelId, titles)).toEqual({ id: uploadsChannelId, dev: false, topics: [], source: 'none' });
  });

  it('rejects channels whose titles do not match, and channels with no titles', () => {
    expect(classifyByTitles(uploadsChannelId, ['My weekend cooking vlog', 'Garden tour', 'Cat video', 'Baking bread'])).toEqual({ id: uploadsChannelId, dev: false, topics: [], source: 'none' });
    expect(classifyByTitles(uploadsChannelId, [])).toEqual({ id: uploadsChannelId, dev: false, topics: [], source: 'none' });
  });

  it('maps free text to every matching topic in catalog order', () => {
    expect(topicsForText('Kubernetes and Docker')).toEqual(['DevOps']);
    expect(topicsForText('Building AI agents')).toEqual(['AI & Agents']);
    expect(topicsForText('React and PostgreSQL')).toEqual(['Frontend', 'Backend']);
    expect(topicsForText('Easy weeknight dinners')).toEqual([]);
  });

  it('moves a keyword-unmatched channel to matched when its uploads look like dev content', () => {
    const subscriptions = [
      { channel: { id: uploadsChannelId, title: 'Mystery Channel', description: 'Weekly videos', topics: [] } as Channel },
      { channel: { id: 'UCcooking00000000000000b', title: 'Cooking Club', description: 'Recipes', topics: [] } as Channel },
    ];
    expect(sortSubscriptions(subscriptions).matched).toEqual([]);

    const uploadTitles = new Map([
      [uploadsChannelId, ['Learn Python in 10 minutes', 'Python decorators explained', 'Async Python deep dive', 'Garden tour']],
      ['UCcooking00000000000000b', ['Weeknight pasta', 'Sourdough basics', 'Garden tour', 'Cat video']],
    ]);
    const sorted = sortSubscriptions(subscriptions, uploadTitles);
    expect(sorted.matched.map(c => c.id)).toEqual([uploadsChannelId]);
    expect(sorted.others.map(c => c.id)).toEqual(['UCcooking00000000000000b']);
    expect(sorted.total).toBe(2);
  });
});

describe('stored subscription IDs', () => {
  const id = curatedChannels[0].id;

  it('keeps only valid, unique channel IDs from storage', () => {
    expect(readSubscriptions(null)).toEqual([]);
    expect(readSubscriptions('{broken')).toEqual([]);
    expect(readSubscriptions(JSON.stringify({ ids: [id] }))).toEqual([]);
    expect(readSubscriptions(JSON.stringify([id, id, 'not-a-channel', 42, null]))).toEqual([id]);
  });

  it('persists saved IDs under the subscriptions key', () => {
    saveSubscriptions([id, 'not-a-channel']);
    expect(localStorage.getItem(subscriptionKey)).toBe(JSON.stringify([id]));
  });

  it('shows the subscribed badge on an onboarding creator card once its ID is saved', () => {
    wrapper(<Onboarding editing={false} onDone={() => {}}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(within(screen.getByRole('button', { name: 'Select Fireship' })).queryByText('Subscribed on YouTube')).toBeNull();

    act(() => saveSubscriptions([id]));

    expect(within(screen.getByRole('button', { name: 'Select Fireship' })).getByText('Subscribed on YouTube')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: 'Select Theo - t3.gg' })).queryByText('Subscribed on YouTube')).toBeNull();
  });
});

describe('For you rows from followed channels', () => {
  it('shows a followed channel\'s demo upload in the single "New from your channels" row', () => {
    vi.stubGlobal('IntersectionObserver', AlwaysVisible);
    savePreferences(['Frontend']);
    setFollowing([curatedChannels[0]]);
    wrapper(<App/>);

    const row = screen.getByRole('heading', { name: 'New from your channels' }).closest('section');
    expect(row).not.toBeNull();
    expect(within(row!).getByRole('heading', { name: 'React in 100 Seconds' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Frontend from your channels' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'More from your channels' })).toBeNull();
  });

  it('narrows the row to one creator when their avatar is selected', () => {
    vi.stubGlobal('IntersectionObserver', AlwaysVisible);
    savePreferences(['Frontend']);
    setFollowing([curatedChannels[0]]);
    wrapper(<App/>);

    fireEvent.click(screen.getByRole('button', { name: 'Show videos from Fireship' }));

    expect(screen.getByRole('button', { name: 'Show videos from Fireship' }).getAttribute('aria-pressed')).toBe('true');
    const row = screen.getByRole('heading', { name: 'New from Fireship' }).closest('section');
    expect(row).not.toBeNull();
    expect(within(row!).getByRole('heading', { name: 'React in 100 Seconds' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'New from your channels' })).toBeNull();
  });
});
