// Development-only Vimeo auth fallback.
//
// Why this exists: sessions are stored in memory (see the MemoryStore in
// server.js), so every server restart destroys them. Because `npm run dev` runs
// `node --watch`, any save to a server-side .js file restarts the process and
// silently logs you out — you'd have to redo the whole OAuth flow to get back to
// a gated page. This middleware synthesises a session from the VIMEO_TOKEN
// already in .env so the gated pages keep working across restarts.
//
// Guard rails:
//   • Inert unless NODE_ENV === 'development'. In production the only route to a
//     vimeoAuth session is the real /auth/vimeo/* OAuth flow.
//   • Inert unless VIMEO_TOKEN is set.
//   • A real OAuth session always wins — this never overwrites one.
//   • Respects an explicit Disconnect (see suppressDevToken below), so the
//     logout button doesn't appear to do nothing.
//
// Sessions created this way carry devFallback: true, which the auth widget uses
// to label the connection so it isn't mistaken for a real OAuth login.

const { vimeo } = require('../utils/vimeo');

let cachedUser = null; // resolved /me identity, fetched at most once per process
let lookupPromise = null; // in-flight lookup, shared by concurrent requests
let announced = false; // so the console notice prints once, not per request

// Resolves the token's real identity so userUri/userName match the account the
// requests actually run as. Falls back to a clearly-labelled placeholder rather
// than failing the request, since some pages only need the token itself.
async function resolveDevUser(token) {
  if (cachedUser) return cachedUser;
  if (lookupPromise) return lookupPromise;

  const p = (async () => {
    try {
      const r = await vimeo('GET', '/me', { token });
      if (!r.ok) throw new Error(`/me returned ${r.status}`);
      const me = await r.json();
      cachedUser = { uri: me.uri, name: me.name, link: me.link };
    } catch (err) {
      console.warn(`[dev-token] Could not resolve VIMEO_TOKEN identity: ${err.message}`);
      cachedUser = { uri: null, name: 'Dev token (.env)', link: null };
    }
    lookupPromise = null;
    return cachedUser;
  })();

  lookupPromise = p;
  return p;
}

module.exports = async function devTokenAuth(req, res, next) {
  if (process.env.NODE_ENV !== 'development') return next();

  const token = process.env.VIMEO_TOKEN;
  if (!token) return next();

  if (!req.session) return next();
  if (req.session.vimeoAuth) return next(); // real OAuth session takes precedence
  if (req.session.suppressDevToken) return next(); // user explicitly disconnected

  try {
    const user = await resolveDevUser(token);

    req.session.vimeoAuth = {
      accessToken: token,
      userUri: user.uri,
      userName: user.name,
      userProfileLink: user.link,
      devFallback: true,
    };

    if (!announced) {
      announced = true;
      console.log(
        `[dev-token] NODE_ENV=development — using VIMEO_TOKEN from .env as ${user.name}. ` +
          'This is not a real OAuth session.'
      );
    }
  } catch (err) {
    console.error('[dev-token] Fallback failed:', err.message);
  }

  next();
};
