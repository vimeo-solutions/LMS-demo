const express = require('express');
const router = express.Router();
const { vimeo, handleVimeoError } = require('../utils/vimeo');

// Capture raw body for all content types, including application/vnd.vimeo.*+json.
// express.json() (mounted globally) only parses application/json, so Vimeo-specific
// content types would arrive with an empty req.body without this middleware.
router.use(express.raw({ type: '*/*', limit: '100kb' }));

// Forwards any METHOD /api/vimeo/<path>?<qs> → METHOD https://api.vimeo.com/<path>?<qs>
// req.url inside this router is already relative to the mount point and includes the query string.
//
// Requires an active user OAuth session — no fallback to the server admin token.
router.all('*', async (req, res) => {
  const token = req.session?.vimeoAuth?.accessToken;
  if (!token) {
    return res.status(401).json({
      error: 'Vimeo account not connected. Connect your Vimeo account to use this feature.',
      authUrl: '/auth/vimeo/start',
    });
  }
  try {
    const opts = {
      token,
      _meta: {
        referer: req.headers.referer || req.headers.origin || null,
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || null,
        vimeoUserUri: req.session?.vimeoAuth?.userUri || null,
      },
    };
    if (req.body && req.body.length) {
      opts.body = req.body;
      if (req.headers['content-type']) {
        opts.headers = { 'Content-Type': req.headers['content-type'] };
      }
    }
    const r = await vimeo(req.method, req.url, opts);
    res.status(r.status);
    const text = await r.text();
    if (text) {
      try { res.json(JSON.parse(text)); } catch { res.send(text); }
    } else {
      res.end();
    }
  } catch (e) {
    handleVimeoError(res, e);
  }
});

module.exports = router;
