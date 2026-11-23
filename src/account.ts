import { useSyncExternalStore } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { clearLocalData, onLocalWrite, readLocalData, writeLocalData, type SyncedData } from './localData';

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL || undefined;
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || undefined;
/** Sign-in only appears when Supabase is configured. Without it the app works as before, saving to this browser. */
export const accountsEnabled = !!url && !!key;

export interface Account {
  status: 'off' | 'loading' | 'signed-out' | 'signed-in';
  email?: string;
  name?: string;
  avatarUrl?: string;
  /** Set when the account couldn't be read or written. Changes still save in this browser. */
  syncError?: string;
}
let account: Account = { status: accountsEnabled ? 'loading' : 'off' };
const listeners = new Set<() => void>();
function setAccount(next: Account) { account = next; listeners.forEach(fn => fn()); }
export const getAccount = () => account;
export const useAccount = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => account);

let clientPromise: Promise<SupabaseClient> | undefined;
function getClient() {
  // Loaded on demand, so people who never sign in don't download it.
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url!, key!, { auth: { flowType: 'pkce' } }));
  return clientPromise;
}

/** Where each person's data lives. One row per user, readable and writable only by them (see supabase/schema.sql). */
export interface ProfileStore { load(): Promise<SyncedData | null>; save(data: SyncedData): Promise<void> }
function supabaseProfiles(client: SupabaseClient, userId: string): ProfileStore {
  return {
    async load() {
      const { data, error } = await client.from('profiles').select('data').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data?.data as SyncedData | undefined) ?? null;
    },
    async save(data) {
      const { error } = await client.from('profiles').upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}

/**
 * Brings this browser in line with the account. If the account already has data, it wins for every key it has.
 * Anything only this browser has (or a brand-new account) is uploaded.
 */
export async function pullOrSeed(store: ProfileStore): Promise<void> {
  const remote = await store.load();
  const local = readLocalData();
  if (remote) writeLocalData(remote);
  const merged = { ...local, ...remote };
  if (!remote || Object.keys(merged).length > Object.keys(remote).length) await store.save(merged);
}

/** Uploads local changes at most once per `delay` ms, and right away when the tab is hidden. */
export function startPushing(store: ProfileStore, onResult: (error?: unknown) => void, delay = 3000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    try { await store.save(readLocalData()); onResult(); } catch (error) { onResult(error); }
  };
  const stopWrites = onLocalWrite(() => { timer ??= setTimeout(() => void flush(), delay); });
  const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
  document.addEventListener('visibilitychange', onHide);
  return { flush, stop() { stopWrites(); document.removeEventListener('visibilitychange', onHide); clearTimeout(timer); timer = undefined; } };
}

function hasStoredSession() {
  try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); } catch { return false; }
}
const returningFromSignIn = () => new URLSearchParams(location.search).has('code');
function cleanUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return;
  ['code', 'error', 'error_code', 'error_description'].forEach(p => params.delete(p));
  history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
}
function profileOf(session: Session): Pick<Account, 'email' | 'name' | 'avatarUrl'> {
  const meta = session.user.user_metadata ?? {};
  return { email: session.user.email, name: meta.full_name ?? meta.name, avatarUrl: meta.avatar_url ?? meta.picture };
}
const syncMessage = 'Couldn’t reach your account. Changes are saved in this browser for now.';

let pusher: ReturnType<typeof startPushing> | undefined;
async function connect() {
  const client = await getClient();
  const { data: { session } } = await client.auth.getSession();
  cleanUrl();
  if (!session) return setAccount({ status: 'signed-out' });
  const profile = profileOf(session);
  setAccount({ status: 'signed-in', ...profile });
  client.auth.onAuthStateChange(event => {
    // Signed out in another tab, or the session was revoked: leave nothing personal behind.
    if (event === 'SIGNED_OUT') { pusher?.stop(); clearLocalData(); location.reload(); }
  });
  const store = supabaseProfiles(client, session.user.id);
  try { await pullOrSeed(store); } catch {
    // Without a successful read, uploading could overwrite newer data from another device, so don't sync this visit.
    return setAccount({ ...getAccount(), syncError: syncMessage });
  }
  pusher = startPushing(store, error => setAccount({ ...getAccount(), syncError: error ? syncMessage : undefined }));
}

/**
 * Runs before the app renders. Signed-out visitors skip it instantly. Signed-in people get their account's data first,
 * so the app opens with it; after `timeoutMs` the app renders anyway and updates when the account loads.
 */
export async function startAccount(timeoutMs = 3000): Promise<void> {
  if (!accountsEnabled) return;
  if (!hasStoredSession() && !returningFromSignIn()) return setAccount({ status: 'signed-out' });
  const work = connect().catch(() => setAccount({ status: 'signed-out', syncError: 'Couldn’t sign you in. Please try again.' }));
  await Promise.race([work, new Promise(resolve => setTimeout(resolve, timeoutMs))]);
}

export async function signIn() {
  const client = await getClient();
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: new URL(import.meta.env.BASE_URL, location.origin).href } });
  if (error) throw error;
}

/** Saves anything pending, signs out, and clears this browser's copy, like signing out of YouTube on a shared computer. */
export async function signOut() {
  await pusher?.flush();
  pusher?.stop();
  const client = await getClient();
  await client.auth.signOut();
  clearLocalData();
  location.reload();
}
