const express = require('express');
const router = express.Router();
const projects = require('../data/projects');

// Home
router.get('/', (req, res) => {
  const featured = projects.filter((p) => p.featured);
  res.render('pages/home', { title: 'Project Hub', featured, projects });
});

// Demos index
router.get('/demos', (req, res) => {
  res.render('pages/demos', {
    title: 'Demos',
    projects: projects.filter((p) => p.category === 'Demos'),
  });
});

// API Docs index
router.get('/api-docs', (req, res) => {
  res.render('pages/api-docs', {
    title: 'API Docs',
    projects: projects.filter((p) => p.category === 'API Docs'),
  });
});

// Testing index
router.get('/testing', (req, res) => {
  res.render('pages/testing', {
    title: 'Testing',
    projects: projects.filter((p) => p.category === 'Testing'),
  });
});

// Smart Card tool
router.get('/smart-card', (req, res) => {
  res.render('pages/smart-card', {
    title: 'Smart Card Preview',
    extraScripts: '<script src="/js/smart-card.js"></script>',
  });
});

// Vimeo API Reference — documentation browser
router.get('/vimeo-api-reference', (req, res) => {
  res.render('pages/vimeo-api-reference', {
    title: 'Vimeo API Reference',
    extraScripts: '<script src="/js/vimeo-api-reference.js"></script>',
  });
});

// Vimeo API Playground — live request sandbox (requires connected Vimeo account)
router.get('/vimeo-api-playground', (req, res) => {
  if (!req.session?.vimeoAuth?.accessToken) {
    return res.redirect(`/auth/vimeo/start?returnTo=${encodeURIComponent('/vimeo-api-playground')}`);
  }
  res.render('pages/vimeo-api-playground', {
    title: 'Vimeo API Playground',
    extraScripts: '<script src="/js/vimeo-api-playground.js"></script>',
  });
});

// LMS Integration Demo — SCORM runtime simulation
router.get('/lms-demo', (req, res) => {
  res.render('pages/lms-demo', {
    title: 'LMS Integration Demo',
    extraScripts: '<script src="/js/lms-demo.js"></script>',
  });
});

// Vimeo Embeds — structured metadata + Player SDK event demo
router.get('/vimeo-embeds', (req, res) => {
  res.render('pages/vimeo-embeds', {
    title: 'The Power of Vimeo Embeds',
    extraScripts: `
      <script src="https://player.vimeo.com/api/player.js"></script>
      <script src="/js/vimeo-embeds.js"></script>
    `,
  });
});

// Admin — API request monitor (requires connected Vimeo account)
router.get('/admin', (req, res) => {
  if (!req.session?.vimeoAuth?.accessToken) {
    return res.redirect(`/auth/vimeo/start?returnTo=${encodeURIComponent('/admin')}`);
  }
  res.render('pages/admin', {
    title: 'API Request Monitor',
    extraScripts: '<script src="/js/admin.js"></script>',
  });
});

// Project detail — driven entirely by data/projects.js
router.get('/projects/:slug', (req, res, next) => {
  const project = projects.find((p) => p.slug === req.params.slug);
  if (!project) return next(); // passes to the 404 handler in server.js
  res.render('pages/project-detail', { title: project.title, project });
});

module.exports = router;
