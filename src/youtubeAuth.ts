import { isDemo } from './api';
const scope = 'https://www.googleapis.com/auth/youtube.readonly';
const clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
/** Import needs both the OAuth client (to read subscriptions) and the API key (to load feeds afterwards). */
export const canImportYouTube = !!clientId && !isDemo;
interface TokenResponse { access_token?: string; error?: string; scope?: string }
interface GoogleOAuth {
  initTokenClient(config: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): { requestAccessToken(): void };
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}
declare global { interface Window { google?: { accounts?: { oauth2?: GoogleOAuth } } } }
let loading: Promise<GoogleOAuth> | undefined;
/** Load Google Identity Services early so the consent popup opens directly from the click. */
export function loadGoogleSignIn(): Promise<GoogleOAuth> {
  loading ??= new Promise((resolve, reject) => {
    const ready = () => window.google?.accounts?.oauth2;
    if (ready()) return resolve(ready()!);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => ready() ? resolve(ready()!) : reject(new Error('Google sign-in did not load.'));
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error('Couldn’t load Google sign-in. Check your connection and try again.')); };
    document.head.append(script);
  });
  return loading;
}
/** Asks for read-only YouTube access. The token lives only in memory for this one import. */
export async function requestYouTubeAccess(): Promise<string> {
  if (!clientId) throw new Error('Add VITE_GOOGLE_CLIENT_ID to .env.local to import from YouTube.');
  const oauth = await loadGoogleSignIn();
  return new Promise((resolve, reject) => {
    oauth.initTokenClient({
      client_id: clientId,
      scope,
      callback: response => {
        if (response.error || !response.access_token) return reject(new Error(response.error === 'access_denied' ? 'YouTube access wasn’t granted, so nothing was imported.' : 'Google sign-in failed. Please try again.'));
        if (!oauth.hasGrantedAllScopes(response, scope)) { oauth.revoke(response.access_token); return reject(new Error('DevFlix needs read-only access to your subscriptions to import them.')); }
        resolve(response.access_token);
      },
      error_callback: error => reject(new Error(error.type === 'popup_failed_to_open' ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' : error.type === 'popup_closed' ? 'The Google window closed before access was granted.' : 'Google sign-in failed. Please try again.')),
    }).requestAccessToken();
  });
}
export function revokeYouTubeAccess(token: string) { window.google?.accounts?.oauth2?.revoke(token); }
