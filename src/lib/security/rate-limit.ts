type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type BucketMap = Map<string, number[]>;

function getStore(): BucketMap {
  const key = '__hfj_rate_limit_store__';
  const globalWithStore = globalThis as typeof globalThis & { [key: string]: BucketMap | undefined };
  if (!globalWithStore[key]) {
    globalWithStore[key] = new Map<string, number[]>();
  }
  return globalWithStore[key] as BucketMap;
}

export function checkRateLimit(bucketKey: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - options.windowMs;
  const store = getStore();
  const existing = store.get(bucketKey) ?? [];
  const recent = existing.filter((timestamp) => timestamp > cutoff);

  if (recent.length >= options.max) {
    const oldest = recent[0] ?? now;
    const retryAfterMs = Math.max(0, options.windowMs - (now - oldest));
    store.set(bucketKey, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  recent.push(now);
  store.set(bucketKey, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitStore(): void {
  getStore().clear();
}
