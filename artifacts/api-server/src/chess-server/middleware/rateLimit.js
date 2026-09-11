const buckets = new Map();

function cleanup(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function createRateLimiter({ windowMs, max, keyGenerator, message = 'Too many requests. Please try again later.' }) {
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10000) cleanup(now);
    const key = String(keyGenerator(req) || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: { message } });
    }
    next();
  };
}

export function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function normalizedEmail(req) {
  return typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'missing-email';
}
