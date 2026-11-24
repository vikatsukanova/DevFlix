import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type CacheLike, type WorkerEnv } from './worker';

const APP_ORIGIN = 'https://devflix.workers.dev';
const LOCAL_ORIGIN = 'http://localhost:5173';
const ENV: WorkerEnv = { YT_API_KEY: 'server-secret-key' };

function memoryCache(): CacheLike {
  const store = new Map<string, { status: number; body: string; headers: [string, string][] }>();
  return {
    async match(request: Request) {
      const entry = store.get(request.url);
      if (!entry) return undefined;
      return new Response(entry.body, { status: entry.status, headers: entry.headers });
    },
    async put(request: Request, response: Response) {
      store.set(request.url, {
        status: response.status,
        body: await response.text(),
        headers: Array.from(response.headers.entries()),
      });
    },
  };
}

describe('YouTube proxy worker (standalone SPA + /api/youtube/*)', () => {
  it('serves non-API routes from env.ASSETS when bound', async () => {
    const assetsFetch = vi.fn().mockResolvedValue(new Response('<html>DevFlix</html>', { status: 200 }));
    const res = await handleRequest(
      new Request(`${APP_ORIGIN}/`),
      { ...ENV, ASSETS: { fetch: assetsFetch } },
      undefined,
      { cache: null },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<html>DevFlix</html>');
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });

  it('responds to /api/health without requiring Origin or touching YouTube', async () => {
    const fetcher = vi.fn();
    const res = await handleRequest(new Request(`${APP_ORIGIN}/api/health`), ENV, undefined, { fetch: fetcher, cache: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows same-origin browser fetches via Sec-Fetch-Site or Referer without an Origin header', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));

    const viaFetchSite = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search?part=snippet&q=react`, {
        headers: { 'Sec-Fetch-Site': 'same-origin' },
      }),
      ENV,
      undefined,
      { fetch: fetcher, cache: null },
    );
    expect(viaFetchSite.status).toBe(200);

    const viaReferer = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/videos?part=snippet&id=abc`, {
        headers: { Referer: `${APP_ORIGIN}/` },
      }),
      ENV,
      undefined,
      { fetch: fetcher, cache: null },
    );
    expect(viaReferer.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects requests with no origin metadata or a disallowed origin with 403', async () => {
    const fetcher = vi.fn();
    const bare = await handleRequest(new Request(`${APP_ORIGIN}/api/youtube/search?q=react`), ENV, undefined, { fetch: fetcher, cache: null });
    expect(bare.status).toBe(403);

    const badOrigin = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search?q=react`, { headers: { Origin: 'https://evil.example' } }),
      ENV,
      undefined,
      { fetch: fetcher, cache: null },
    );
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const badReferer = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search?q=react`, { headers: { Referer: 'https://evil.example/page' } }),
      ENV,
      undefined,
      { fetch: fetcher, cache: null },
    );
    expect(badReferer.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('handles CORS preflight for same-origin and allowed dev origins', async () => {
    const res = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search`, { method: 'OPTIONS', headers: { Origin: LOCAL_ORIGIN } }),
      ENV,
      undefined,
      { cache: null },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(LOCAL_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization');
  });

  it('rejects non-GET methods and unknown API endpoints', async () => {
    const post = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      ENV,
      undefined,
      { cache: null },
    );
    expect(post.status).toBe(405);

    const unknown = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/comments`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      ENV,
      undefined,
      { cache: null },
    );
    expect(unknown.status).toBe(404);
  });

  it('sanitizes query params, ignores caller key, clamps maxResults, and injects server YT_API_KEY', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const res = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search?part=snippet&q=react&key=attacker&evil=1&maxResults=999`, {
        headers: { 'Sec-Fetch-Site': 'same-origin' },
      }),
      ENV,
      undefined,
      { fetch: fetcher, cache: null },
    );

    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetcher.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(calledUrl.searchParams.get('key')).toBe('server-secret-key');
    expect(calledUrl.searchParams.get('q')).toBe('react');
    expect(calledUrl.searchParams.get('maxResults')).toBe('50');
    expect(calledUrl.searchParams.get('evil')).toBeNull();
  });

  it('caches public responses with canonicalized param order and sets CORS headers per caller', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: '1' }] }), { status: 200 }));

    const first = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search?q=react&part=snippet`, { headers: { Origin: LOCAL_ORIGIN } }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(first.status).toBe(200);
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=21600');
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe(LOCAL_ORIGIN);

    const second = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/search?part=snippet&q=react`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(second.status).toBe(200);
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(second.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await second.json()).toEqual({ items: [{ id: '1' }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('passes through upstream errors without caching them', async () => {
    const cache = memoryCache();
    const errorPayload = { error: { errors: [{ reason: 'quotaExceeded' }] } };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(errorPayload), { status: 403 }));

    const first = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/videos?part=snippet&id=abc`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(first.status).toBe(403);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(await first.json()).toEqual(errorPayload);

    await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/videos?part=snippet&id=abc`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('requires Bearer auth on /api/youtube/subscriptions, forwards Authorization, and never caches authenticated calls', async () => {
    const cache = memoryCache();
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));

    const unauth = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/subscriptions?part=snippet&mine=true`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(unauth.status).toBe(401);

    const authed = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/subscriptions?part=snippet&mine=true`, {
        headers: { 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer oauth-token-123' },
      }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(authed.status).toBe(200);
    expect(authed.headers.get('Cache-Control')).toBe('private, no-store');
    expect(fetcher.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer oauth-token-123' } });

    const authedChannels = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/channels?part=snippet&id=ch1`, {
        headers: { 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer oauth-token-123' },
      }),
      ENV,
      undefined,
      { fetch: fetcher, cache },
    );
    expect(authedChannels.headers.get('Cache-Control')).toBe('private, no-store');
    expect(authedChannels.headers.get('X-Cache')).toBeNull();
  });

  it('respects custom ALLOWED_ORIGINS', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const customEnv: WorkerEnv = { YT_API_KEY: 'k', ALLOWED_ORIGINS: 'https://devflix.example/' };
    const ok = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/videos?id=1`, { headers: { Origin: 'https://devflix.example' } }),
      customEnv,
      undefined,
      { fetch: fetcher, cache: null },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://devflix.example');

    const denied = await handleRequest(
      new Request(`${APP_ORIGIN}/api/youtube/videos?id=1`, { headers: { Origin: LOCAL_ORIGIN } }),
      customEnv,
      undefined,
      { fetch: fetcher, cache: null },
    );
    expect(denied.status).toBe(403);
  });
});
