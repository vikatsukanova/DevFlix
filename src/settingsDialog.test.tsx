// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { savePreferences } from './preferences';
import { defaultSettings, saveSettings } from './settings';

const settingsKey = 'devflix-settings-v1';
// Preview mode, so the home rows use the sample catalogue and nothing calls YouTube.
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), isDemo: true }));

// jsdom has no <dialog> methods; the component only needs the open attribute to change.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.removeItem(settingsKey);
  // Onboarding is complete, so the header with the Settings button is shown.
  savePreferences([]);
  saveSettings(defaultSettings('US'));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); saveSettings(defaultSettings('US')); localStorage.removeItem(settingsKey); });

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><App/></QueryClientProvider>);
}
const openSettings = () => fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
const stored = () => JSON.parse(localStorage.getItem(settingsKey) ?? 'null');

it('saves a new language and creator mode from the Settings panel', () => {
  renderApp();
  openSettings();
  fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'es' } });
  fireEvent.click(screen.getByRole('radio', { name: /Only my region/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(stored()).toMatchObject({ language: 'es', creatorRegion: 'only' });
  expect(stored().countries).toEqual(['US', 'CA']);
  expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
});

it('Cancel discards the draft and leaves saved settings unchanged', () => {
  const before = localStorage.getItem(settingsKey);
  renderApp();
  openSettings();
  fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'fr' } });
  fireEvent.click(screen.getByRole('radio', { name: /Anywhere/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  expect(localStorage.getItem(settingsKey)).toBe(before);
  openSettings();
  expect((screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement).value).toBe('en');
  expect((screen.getByRole('radio', { name: /Prefer my region/ }) as HTMLInputElement).checked).toBe(true);
});

it('keeps the last country chip non-removable and tells the user why', () => {
  renderApp();
  openSettings();
  const removeCanada = screen.getByRole('button', { name: 'Remove Canada' });
  fireEvent.click(removeCanada);
  expect(screen.queryByRole('button', { name: 'Remove Canada' })).toBeNull();
  const lastChip = screen.getByRole('button', { name: 'Remove United States' }) as HTMLButtonElement;
  expect(lastChip.disabled).toBe(true);
  expect(screen.getByText('Keep at least one country.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
});
