const express = require('express');
const router = express.Router();
const requestLog = require('../utils/request-log');
const requireVimeoAuth = require('../middleware/require-vimeo-auth');

router.use(requireVimeoAuth);

router.get('/log', (req, res) => {
  res.json(requestLog.getEntries());
});

router.get('/stats', (req, res) => {
  res.json(requestLog.getStats());
});

router.delete('/log', (req, res) => {
  requestLog.clear();
  res.json({ ok: true });
});

module.exports = router;
