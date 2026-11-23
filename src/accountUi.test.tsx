// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Account } from './account';

// Preview mode, so nothing calls YouTube. Accounts are switched on with a fake account state.
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), isDemo: true }));
const state = vi.hoisted(() => ({ account: { status: 'signed-out' } as Account, signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}) }));
vi.mock('./account', () => ({ useAccount: () => state.account, signIn: state.signIn, signOut: state.signOut }));

import App from './App';
import { savePreferences } from './preferences';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  savePreferences([]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); state.signIn.mockClear(); state.signOut.mockClear(); });

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><App/></QueryClientProvider>);
}

it('offers optional Google sign-in from the header when signed out', () => {
  state.account = { status: 'signed-out' };
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByText(/everything works without an account/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  expect(state.signIn).toHaveBeenCalledOnce();
});

it('shows who is signed in and lets them sign out', () => {
  state.account = { status: 'signed-in', name: 'Ada Lovelace', email: 'ada@example.com' };
  renderApp();
  expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Settings and account (Ada Lovelace)' }));
  expect(screen.getByText('ada@example.com')).toBeTruthy();
  expect(screen.getByText('Saved to your account.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(state.signOut).toHaveBeenCalledOnce();
});

it('tells people when syncing failed', () => {
  state.account = { status: 'signed-in', email: 'ada@example.com', syncError: 'Couldn’t reach your account. Changes are saved in this browser for now.' };
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: /Settings and account/ }));
  expect(screen.getByRole('alert').textContent).toMatch(/Couldn’t reach your account/);
});

it('hides accounts entirely when they are not configured', () => {
  state.account = { status: 'off' };
  renderApp();
  expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.queryByText('Account')).toBeNull();
});
