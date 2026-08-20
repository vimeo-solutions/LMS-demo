// Storage for the currently loaded SCORM package.
//
// Two backends, chosen at require time:
//
//   Netlify   Netlify Blobs. Each request runs in its own container with its own
//             /tmp, so a package extracted during an upload would not be there
//             when the browser asks for its files. Blobs are shared across
//             invocations, which is what makes the extract-then-serve flow work.
//   Elsewhere The filesystem under /tmp, for `npm start` and the PM2 deploy.
//
// Both expose the same three calls: reset(), put(), get().

const path = require('path');

const onNetlify = Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV);

// Content types for everything a SCORM package contains. Anything else is served
// as a download rather than guessed at.
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.xsd':  'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.vtt':  'text/vtt; charset=utf-8',
};

function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

// Normalise to forward-slash relative keys so both backends agree, and refuse
// anything trying to climb out of the package.
function safeKey(key) {
  const normalised = path.posix
    .normalize(String(key).replace(/\\/g, '/'))
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!normalised || normalised === '.' || normalised.startsWith('../')) return null;
  return normalised;
}

// ── Netlify Blobs ─────────────────────────────────────────────────────────────
function blobBackend() {
  const { getStore } = require('@netlify/blobs');
  const store = () => getStore('scorm-content');

  return {
    // Throws MissingBlobsEnvironmentError when there is no site context, which
    // is how resolve() decides whether Blobs is usable.
    probe() {
      store();
    },
    async reset() {
      const s = store();
      const { blobs } = await s.list();
      await Promise.all(blobs.map((b) => s.delete(b.key)));
    },
    async put(key, buffer) {
      await store().set(key, buffer);
    },
    async get(key) {
      const data = await store().get(key, { type: 'arrayBuffer' });
      return data ? Buffer.from(data) : null;
    },
  };
}

// ── Filesystem ────────────────────────────────────────────────────────────────
function fileBackend() {
  const fs = require('fs');
  const ROOT = path.join('/tmp', 'lms-demo-content');

  return {
    async reset() {
      fs.rmSync(ROOT, { recursive: true, force: true });
      fs.mkdirSync(ROOT, { recursive: true });
    },
    async put(key, buffer) {
      const dest = path.join(ROOT, key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buffer);
    },
    async get(key) {
      const src = path.join(ROOT, key);
      return fs.existsSync(src) ? fs.readFileSync(src) : null;
    },
  };
}

// Resolved on first use rather than at require time. Blobs needs a site context,
// which a deployed function always has but an unlinked `netlify dev` does not —
// falling back keeps local development working without a Netlify login.
let backend = null;

function resolve() {
  if (backend) return backend;

  if (onNetlify) {
    try {
      backend = blobBackend();
      backend.probe();
      return backend;
    } catch (err) {
      console.warn(`[scorm-store] Netlify Blobs unavailable (${err.message}); using the filesystem instead.`);
    }
  }

  backend = fileBackend();
  return backend;
}

module.exports = {
  reset: (...args) => resolve().reset(...args),
  put: (...args) => resolve().put(...args),
  get: (...args) => resolve().get(...args),
  contentTypeFor,
  safeKey,
};
