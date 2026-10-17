import { NextRequest, NextResponse } from 'next/server';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { docsContentRoute, docsRoute } from '@/lib/shared';
import { checkRateLimit, getKeys } from '@/lib/api/auth';

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}/content.md`,
);

const API_PREFIX = '/api/v1/';
const PUBLIC_API_PATHS = new Set(['/api/v1/status']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
  'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
  'Access-Control-Max-Age': '86400',
};

function apiError(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { ...CORS_HEADERS, ...headers } });
}

async function handleApi(request: NextRequest): Promise<NextResponse> {
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: CORS_HEADERS });

  const pass = (headers: Record<string, string> = {}) => {
    const res = NextResponse.next();
    for (const [k, v] of Object.entries({ ...CORS_HEADERS, ...headers })) res.headers.set(k, v);
    return res;
  };

  if (PUBLIC_API_PATHS.has(request.nextUrl.pathname)) return pass();

  const keys = getKeys();
  if (keys.size === 0) {
    // Local development without keys configured: leave the API open.
    if (process.env.NODE_ENV !== 'production') return pass();
    return apiError(503, 'not_configured', 'The API has no keys configured yet.');
  }

  const provided = request.headers.get('x-api-key') ?? request.nextUrl.searchParams.get('api_key');
  if (!provided) return apiError(401, 'missing_api_key', 'Send your API key in the X-API-Key header.');
  const config = keys.get(provided);
  if (!config) return apiError(401, 'invalid_api_key', 'That API key is not recognised.');

  let limit;
  try {
    limit = await checkRateLimit(config);
  } catch (err) {
    // Fail open: a Redis outage should not take the API down.
    console.error('Rate limiter unavailable', err);
    return pass();
  }
  if (!limit) return pass();

  const headers = {
    'X-RateLimit-Limit': String(limit.limit),
    'X-RateLimit-Remaining': String(Math.max(0, limit.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(limit.reset / 1000)),
  };
  if (!limit.success) {
    const retryAfter = Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000));
    return apiError(429, 'rate_limited', `Rate limit of ${limit.limit} requests per minute exceeded.`, {
      ...headers,
      'Retry-After': String(retryAfter),
    });
  }
  return pass(headers);
}

export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(API_PREFIX)) return handleApi(request);

  const result = rewriteSuffix(request.nextUrl.pathname);
  if (result) {
    return NextResponse.rewrite(new URL(result, request.nextUrl));
  }

  if (isMarkdownPreferred(request)) {
    const result = rewriteDocs(request.nextUrl.pathname);

    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl), {
        // this URL has two representations, selected by `Accept`
        headers: { Vary: 'Accept' },
      });
    }
  }

  return NextResponse.next();
}
