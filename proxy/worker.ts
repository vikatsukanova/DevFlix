export interface WorkerEnv {
  YT_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
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
  'https://vikatsukanova.github.io',
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

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  ctx?: ExecutionContextLike,
  deps: ProxyDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const endpoint = url.pathname.replace(/^\/+|\/+$/g, '');
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.get('Origin')?.replace(/\/+$/, '') ?? '';
  const originAllowed = origin !== '' && allowedOrigins.has(origin);

  if (endpoint === 'health' && request.method === 'GET') {
    return jsonResponse({ ok: true }, 200, originAllowed ? corsHeaders(origin) : {});
  }

  if (!originAllowed) {
    return jsonResponse({ error: { message: 'Origin not allowed.' } }, 403);
  }

  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: { message: 'Method not allowed.' } }, 405, cors);
  }

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonResponse({ error: { message: 'Endpoint not found.' } }, 404, cors);
  }

  if (!env.YT_API_KEY) {
    return jsonResponse({ error: { message: 'Proxy is not configured.' } }, 500, cors);
  }

  const rawAuth = request.headers.get('Authorization')?.trim() ?? '';
  const bearerAuth = /^Bearer\s+\S+$/i.test(rawAuth) ? rawAuth : '';

  if (endpoint === 'subscriptions' && !bearerAuth) {
    return jsonResponse({ error: { message: 'Authorization required.' } }, 401, cors);
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
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
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
      headers: { ...cacheHeaders, ...cors, 'X-Cache': 'MISS' },
    });
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': bearerAuth ? 'private, no-store' : 'no-store',
      ...cors,
    },
  });
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
