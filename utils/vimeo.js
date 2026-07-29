// Shared Vimeo API client.
// Import this in any route file that needs to talk to the Vimeo API.
//
// Usage:
//   const { vimeo, handleVimeoError } = require('./utils/vimeo');
//
// Always pass a token explicitly — every call requires a user OAuth session token
// obtained via the /auth/vimeo/* flow. In production that flow is the only source
// of tokens; in development middleware/dev-token-auth.js may seed the session from
// VIMEO_TOKEN so restarts don't force a re-auth.

const requestLog = require('./request-log');

const VIMEO_API = 'https://api.vimeo.com';
const VIMEO_VERSION = '3.4';

// Builds the standard Vimeo auth + version headers.
// Pass extra = { 'Content-Type': 'application/json' } etc. when needed.
// token is required — callers must supply it explicitly from req.session.vimeoAuth.accessToken.
function vimeoHeaders(extra = {}, token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: `application/vnd.vimeo.*+json;version=${VIMEO_VERSION}`,
    ...extra,
  };
}

// Authenticated fetch to the Vimeo API.
//
//   method   — 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
//   endpoint — path starting with '/', e.g. '/videos/123456'
//   options  — {
//     headers  — extra request headers (optional)
//     body     — request body (optional)
//     token    — user OAuth session token (required)
//     _meta    — { referer, ip, userAgent, vimeoUserUri } for request logging (optional)
//   }
//
// Returns the raw fetch Response so callers can inspect status and parse JSON
// however they need to. Does not throw on non-2xx — callers handle that.
// Every call is automatically logged to utils/request-log.js.
async function vimeo(method, endpoint, { headers = {}, body, token, _meta = {} } = {}) {
  const startTime = Date.now();
  const r = await fetch(`${VIMEO_API}${endpoint}`, {
    method,
    headers: vimeoHeaders(headers, token),
    body,
  });
  requestLog.logCall(method, endpoint, r, startTime, _meta);
  return r;
}

// Standard error handler for route catch blocks.
// Logs to the server console and sends a JSON error to the client.
function handleVimeoError(res, err) {
  console.error('[vimeo]', err.message);
  res.status(500).json({ error: err.message });
}

module.exports = { vimeo, handleVimeoError, VIMEO_API };
