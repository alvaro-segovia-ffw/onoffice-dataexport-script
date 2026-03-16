'use strict';

function defaultMessageBuilder({ maxRequests, windowSec }) {
  return `Rate limit exceeded. Max ${maxRequests} requests per ${windowSec}s.`;
}

function createInMemoryRateLimit(options = {}) {
  const {
    enabled = true,
    windowSec = 60,
    maxRequests = 60,
    keyBuilder = () => 'global',
    errorCode = 'TooManyRequests',
    messageBuilder = defaultMessageBuilder,
  } = options;

  const state = new Map();
  let cleanupCounter = 0;

  function prune(nowMs, windowMs) {
    cleanupCounter += 1;
    if (cleanupCounter % 100 !== 0) return;

    for (const [key, entry] of state.entries()) {
      if (entry.windowStart + windowMs <= nowMs - windowMs) {
        state.delete(key);
      }
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    if (!enabled) return next();

    const nowMs = Date.now();
    const windowMs = windowSec * 1000;
    const windowStart = Math.floor(nowMs / windowMs) * windowMs;
    const key = String(keyBuilder(req) || 'unknown');
    const current = state.get(key);

    const entry =
      current && current.windowStart === windowStart
        ? current
        : { windowStart, count: 0 };

    entry.count += 1;
    state.set(key, entry);
    prune(nowMs, windowMs);

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSec = Math.ceil((windowStart + windowMs - nowMs) / 1000);

    res.setHeader('x-ratelimit-limit', String(maxRequests));
    res.setHeader('x-ratelimit-remaining', String(remaining));
    res.setHeader('x-ratelimit-reset', String(resetSec));

    if (entry.count > maxRequests) {
      res.setHeader('retry-after', String(resetSec));
      return res.status(429).json({
        error: errorCode,
        message:
          typeof messageBuilder === 'function'
            ? messageBuilder({ req, maxRequests, windowSec })
            : String(messageBuilder || defaultMessageBuilder({ maxRequests, windowSec })),
      });
    }

    return next();
  };
}

module.exports = {
  createInMemoryRateLimit,
};
