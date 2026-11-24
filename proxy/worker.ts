export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  YT_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  ASSETS?: AssetsBinding;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface ProxyDeps {
  fetch?: typeof fetch;
  cache?: CacheLike | null;
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const ALLOWED_ENDPOINTS = new Set(['search', 'videos', 'channels', 'playlistItems', 'subscriptions']);
const ALLOWED_PARAMS = new Set([
  'part',
  'q',
  'type',
  'order',
  'videoEmbeddable',
  'videoDuration',
  'publishedAfter',
  'relevanceLanguage',
  'regionCode',
  'maxResults',
  'pageToken',
  'id',
  'playlistId',
  'mine',
]);

/** Edge cache TTLs in seconds for public (unauthenticated) endpoints. */
const CACHE_TTL_SECONDS: Record<string, number> = {
  search: 6 * 60 * 60,
  videos: 60 * 60,
  channels: 60 * 60,
  playlistItems: 60 * 60,
};

function parseAllowedOrigins(raw?: string): Set<string> {
  const list = raw
    ? raw.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return new Set(list);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function sanitizeParams(searchParams: URLSearchParams): URLSearchParams {
  const entries: [string, string][] = [];
  for (const [name, value] of searchParams.entries()) {
    if (!ALLOWED_PARAMS.has(name)) continue;
    if (name === 'maxResults') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) continue;
      entries.push([name, String(Math.min(50, Math.max(1, parsed)))]);
      continue;
    }
    entries.push([name, value]);
  }
  entries.sort(([aKey, aVal], [bKey, bVal]) => aKey.localeCompare(bKey) || aVal.localeCompare(bVal));
  return new URLSearchParams(entries);
}

function getDefaultCache(): CacheLike | undefined {
  const globalCaches = (globalThis as { caches?: { default?: CacheLike } }).caches;
  return globalCaches?.default;
}

/**
 * Checks whether the request comes from this app's own origin (same-origin browser fetch,
 * which typically sends Sec-Fetch-Site: same-origin or a matching Referer without an Origin header)
 * or an explicitly allowed cross-origin caller.
 */
function checkOrigin(request: Request, requestOrigin: string, allowedOrigins: Set<string>): { allowed: boolean; corsOrigin?: string } {
  const origin = request.headers.get('Origin')?.replace(/\/+$/, '') ?? '';
  if (origin) {
    if (origin === requestOrigin || allowedOrigins.has(origin)) {
      return { allowed: true, corsOrigin: origin };
    }
    return { allowed: false };
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site')?.toLowerCase();
  if (fetchSite === 'same-origin') {
    return { allowed: true };
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (refOrigin === requestOrigin || allowedOrigins.has(refOrigin)) {
        return { allowed: true };
      }
    } catch {
      return { allowed: false };
    }
  }

  return { allowed: false };
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  ctx?: ExecutionContextLike,
  deps: ProxyDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Non-API routes fall through to static SPA assets when deployed as a standalone Worker.
  if (!path.startsWith('/api/')) {
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return jsonResponse({ error: { message: 'Not found.' } }, 404);
  }

  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const { allowed, corsOrigin } = checkOrigin(request, url.origin, allowedOrigins);
  const responseCors: Record<string, string> = corsOrigin ? corsHeaders(corsOrigin) : { Vary: 'Origin' };

  if (path === '/api/health' && request.method === 'GET') {
    return jsonResponse({ ok: true }, 200, corsOrigin ? corsHeaders(corsOrigin) : {});
  }

  if (!allowed) {
    return jsonResponse({ error: { message: 'Origin not allowed.' } }, 403);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseCors });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: { message: 'Method not allowed.' } }, 405, responseCors);
  }

  const endpoint = path.startsWith('/api/youtube/') ? path.slice('/api/youtube/'.length) : '';
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonResponse({ error: { message: 'Endpoint not found.' } }, 404, responseCors);
  }

  if (!env.YT_API_KEY) {
    return jsonResponse({ error: { message: 'Proxy is not configured.' } }, 500, responseCors);
  }

  const rawAuth = request.headers.get('Authorization')?.trim() ?? '';
  const bearerAuth = /^Bearer\s+\S+$/i.test(rawAuth) ? rawAuth : '';

  if (endpoint === 'subscriptions' && !bearerAuth) {
    return jsonResponse({ error: { message: 'Authorization required.' } }, 401, responseCors);
  }

  const cleanParams = sanitizeParams(url.searchParams);
  const ttl = !bearerAuth ? CACHE_TTL_SECONDS[endpoint] : undefined;
  const cache = deps.cache === null ? undefined : (deps.cache ?? getDefaultCache());
  const cacheKeyUrl = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
  cacheKeyUrl.search = cleanParams.toString();
  const cacheRequest = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  if (ttl && cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      const headers = new Headers(cached.headers);
      for (const [k, v] of Object.entries(responseCors)) headers.set(k, v);
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  const upstreamParams = new URLSearchParams(cleanParams);
  upstreamParams.set('key', env.YT_API_KEY);
  const upstreamUrl = `${YOUTUBE_API_BASE}/${endpoint}?${upstreamParams.toString()}`;
  const fetcher = deps.fetch ?? fetch;
  const upstream = await fetcher(upstreamUrl, {
    headers: bearerAuth ? { Authorization: bearerAuth } : undefined,
  });

  const body = await upstream.text();
  const contentType = upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8';

  if (upstream.ok && ttl) {
    const cacheHeaders = {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${ttl}`,
    };
    if (cache) {
      const putPromise = cache.put(cacheRequest, new Response(body, { status: upstream.status, headers: cacheHeaders }));
      if (ctx) ctx.waitUntil(putPromise);
      else await putPromise;
    }
    return new Response(body, {
      status: upstream.status,
      headers: { ...cacheHeaders, ...responseCors, 'X-Cache': 'MISS' },
    });
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': bearerAuth ? 'private, no-store' : 'no-store',
      ...responseCors,
    },
  });
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
