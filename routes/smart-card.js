// Smart Card — Vimeo API proxy routes.
// Mounted at /api/smart-card in server.js.
//
// These are intentionally narrow endpoints: each one validates a specific
// operation and forwards it to Vimeo. The browser never sees the access token.

const express = require('express');
const router = express.Router();
const { vimeo, handleVimeoError } = require('../utils/vimeo');
const requireVimeoAuth = require('../middleware/require-vimeo-auth');

router.use(requireVimeoAuth);

// Pull request context for logging from the incoming browser request.
function meta(req) {
  return {
    referer: req.headers.referer || null,
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || null,
    vimeoUserUri: req.session.vimeoAuth.userUri || null,
  };
}

// GET video data
router.get('/video/:id', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const fields = 'uri,name,description,type,tags,link,embed.html,pictures.base_link,metadata.connections.pictures.uri,language';
    const r = await vimeo('GET', `/videos/${req.params.id}?fields=${encodeURIComponent(fields)}`, { token, _meta: meta(req) });
    res.status(r.status).json(await r.json());
  } catch (e) { handleVimeoError(res, e); }
});

// PATCH video metadata (title + description)
router.patch('/video/:id', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const r = await vimeo('PATCH', `/videos/${req.params.id}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      token,
      _meta: meta(req),
    });
    res.status(r.status).json(await r.json());
  } catch (e) { handleVimeoError(res, e); }
});

// PUT add tag
router.put('/video/:id/tags/:tag', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const r = await vimeo('PUT', `/videos/${req.params.id}/tags/${encodeURIComponent(req.params.tag)}`, { token, _meta: meta(req) });
    res.status(r.status).end();
  } catch (e) { handleVimeoError(res, e); }
});

// DELETE remove tag
router.delete('/video/:id/tags/:tag', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const r = await vimeo('DELETE', `/videos/${req.params.id}/tags/${encodeURIComponent(req.params.tag)}`, { token, _meta: meta(req) });
    res.status(r.status).end();
  } catch (e) { handleVimeoError(res, e); }
});

// POST create picture resource → returns upload link + picture URI
router.post('/video/:id/pictures', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const r = await vimeo('POST', `/videos/${req.params.id}/pictures`, { token, _meta: meta(req) });
    res.status(r.status).json(await r.json());
  } catch (e) { handleVimeoError(res, e); }
});

// PATCH activate uploaded picture
router.patch('/video/:id/pictures/:picId', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const r = await vimeo('PATCH', `/videos/${req.params.id}/pictures/${req.params.picId}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      token,
      _meta: meta(req),
    });
    res.status(r.status).json(await r.json());
  } catch (e) { handleVimeoError(res, e); }
});

// GET AI transcribe status
router.get('/video/:id/transcribe', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const r = await vimeo('GET', `/videos/${req.params.id}/ai/transcribe`, { token, _meta: meta(req) });
    if (r.status === 404) return res.status(404).json({ error: 'not_found' });
    if (r.status === 403) return res.status(403).json({ error: 'forbidden' });
    res.status(r.status).json(await r.json());
  } catch (e) { handleVimeoError(res, e); }
});

// GET transcript segments
router.get('/video/:id/transcript/:texttrackId', async (req, res) => {
  const token = req.session.vimeoAuth.accessToken;
  try {
    const fields = 'cue_start,cue_end,lines.text,speaker';
    const r = await vimeo('GET', `/videos/${req.params.id}/transcripts/${req.params.texttrackId}?fields=${encodeURIComponent(fields)}`, { token, _meta: meta(req) });
    res.status(r.status).json(await r.json());
  } catch (e) { handleVimeoError(res, e); }
});

module.exports = router;
