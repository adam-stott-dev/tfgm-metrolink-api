import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * API keys come from the API_KEYS env var: a comma-separated list where each entry is
 * `key` or `key:requestsPerMinute`, e.g. "abc123,partner-xyz:600".
 */
export interface KeyConfig {
  key: string;
  perMinute: number;
}

export const DEFAULT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);

export function parseKeys(raw: string | undefined): Map<string, KeyConfig> {
  const keys = new Map<string, KeyConfig>();
  for (const entry of (raw ?? '').split(',')) {
    const [key, limit] = entry.trim().split(':');
    if (!key) continue;
    const perMinute = limit ? Number(limit) : DEFAULT_PER_MINUTE;
    keys.set(key, { key, perMinute: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : DEFAULT_PER_MINUTE });
  }
  return keys;
}

let keys: Map<string, KeyConfig> | undefined;
export function getKeys() {
  return (keys ??= parseKeys(process.env.API_KEYS));
}

// Works with both Upstash's own env names and the ones the Vercel Marketplace integration sets.
function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

const limiters = new Map<number, Ratelimit>();
let redis: Redis | null | undefined;

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms when the window resets */
  reset: number;
}

/** Returns null when no Redis is configured, in which case requests are not rate limited. */
export async function checkRateLimit(config: KeyConfig): Promise<LimitResult | null> {
  if (redis === undefined) redis = createRedis();
  if (!redis) return null;

  let limiter = limiters.get(config.perMinute);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.perMinute, '1 m'),
      prefix: 'metrolink-api',
      analytics: false,
    });
    limiters.set(config.perMinute, limiter);
  }
  const { success, limit, remaining, reset } = await limiter.limit(config.key);
  return { success, limit, remaining, reset };
}
