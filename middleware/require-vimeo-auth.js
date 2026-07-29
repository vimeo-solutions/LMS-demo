// Middleware for routes that explicitly require the visitor to have connected
// their own Vimeo account via OAuth. Returns 401 JSON — no fallback to the
// server admin token.
//
// Usage:
//   const requireVimeoAuth = require('../middleware/require-vimeo-auth');
//   router.get('/some-user-route', requireVimeoAuth, handler);

module.exports = function requireVimeoAuth(req, res, next) {
  if (req.session?.vimeoAuth?.accessToken) return next();
  res.status(401).json({
    error: 'Vimeo account not connected.',
    authUrl: '/auth/vimeo/start',
  });
};
