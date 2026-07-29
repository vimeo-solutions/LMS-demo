const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 1000;         // sanity cap

let entries = [];

function evict() {
  const cutoff = Date.now() - WINDOW_MS;
  entries = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

function addEntry(entry) {
  evict();
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

function getEntries() {
  evict();
  return entries;
}

function getStats() {
  evict();

  const now = Date.now();
  const BUCKET_MS = 10_000;
  const NUM_BUCKETS = 30; // 30 × 10s = 5 min

  // Time-series: 30 buckets of 10 seconds each, oldest first
  const buckets = Array.from({ length: NUM_BUCKETS }, (_, i) => ({
    startMs: now - (NUM_BUCKETS - i) * BUCKET_MS,
    count: 0,
    errors: 0,
  }));

  const byReferer = {};
  const byIp = {};
  let latestRateLimit = null;

  for (const e of entries) {
    const ts = new Date(e.timestamp).getTime();

    // Bucket assignment
    const bucketIndex = Math.floor((now - ts) / BUCKET_MS);
    const idx = NUM_BUCKETS - 1 - bucketIndex;
    if (idx >= 0 && idx < NUM_BUCKETS) {
      buckets[idx].count++;
      if (e.status >= 400) buckets[idx].errors++;
    }

    // By referer
    const ref = e.referer ? extractPath(e.referer) : '(unknown)';
    byReferer[ref] = (byReferer[ref] || 0) + 1;

    // By IP
    const ip = e.client?.ip || '(unknown)';
    byIp[ip] = (byIp[ip] || 0) + 1;

    // Track most recent rate-limit snapshot (entries are newest-first)
    if (!latestRateLimit && e.rateLimit?.limit != null) {
      latestRateLimit = e.rateLimit;
    }
  }

  return {
    totalEntries: entries.length,
    buckets: buckets.map((b) => ({
      label: new Date(b.startMs).toISOString(),
      count: b.count,
      errors: b.errors,
    })),
    byReferer,
    byIp,
    latestRateLimit,
  };
}

// Keep only the path portion of a URL so internal referers are grouped cleanly.
function extractPath(url) {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    // url is already a path, or malformed — return as-is (trimmed)
    return url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || url;
  }
}

function clear() {
  entries = [];
}

// Shared helper: build and record one log entry from a fetch Response.
// Called by utils/vimeo.js so every vimeo() call is automatically captured.
function logCall(method, endpoint, response, startTime, meta = {}) {
  const qIdx = endpoint.indexOf('?');
  const resetRaw = response.headers.get('x-ratelimit-reset');
  addEntry({
    timestamp: new Date().toISOString(),
    method,
    path: qIdx >= 0 ? endpoint.slice(0, qIdx) : endpoint,
    query: qIdx >= 0 ? endpoint.slice(qIdx) : '',
    referer: meta.referer || null,
    status: response.status,
    durationMs: Date.now() - startTime,
    rateLimit: {
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
      resetAt: resetRaw ? new Date(parseInt(resetRaw, 10) * 1000).toISOString() : null,
    },
    client: {
      ip: meta.ip || null,
      userAgent: meta.userAgent || null,
    },
    vimeoUserUri: meta.vimeoUserUri || null,
  });
}

module.exports = { addEntry, getEntries, getStats, clear, logCall };
