const express = require('express');
const router = express.Router();
const projects = require('../data/projects');

// GET /api/projects — full project list as JSON
router.get('/projects', (req, res) => {
  res.json(projects);
});

// GET /api/projects/:slug — single project as JSON
router.get('/projects/:slug', (req, res) => {
  const project = projects.find((p) => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// ── Add future server-side API routes below ───────────────────────────────────
// Any route that uses a Vimeo API token or other secret must live here.
// Read credentials from process.env (set in .env), never hard-code them,
// and never return raw secrets in the JSON response.

module.exports = router;
