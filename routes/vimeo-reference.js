const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SPEC_PATH = path.join(__dirname, '../data/vimeo-spec.json');
const PRIVATE_PATH = path.join(__dirname, '../data/vimeo-private-endpoints.json');

// Serves the cached OpenAPI spec from disk.
// Drop the updated spec file into data/vimeo-spec.json to refresh it.
// Spec refresh via API is disabled until full OAuth auth is implemented.
router.get('/spec', (req, res) => {
  if (fs.existsSync(SPEC_PATH)) return res.sendFile(SPEC_PATH);
  res.status(503).json({ error: 'Spec not cached. Drop vimeo-spec.json into data/ to proceed.' });
});

// Returns the private-endpoints annotation list (supplement to spec flags).
// Currently used as a fallback; x-mill-visibility-private in the spec is the primary source.
router.get('/private', (req, res) => {
  if (fs.existsSync(PRIVATE_PATH)) return res.sendFile(PRIVATE_PATH);
  res.json([]);
});

module.exports = router;
