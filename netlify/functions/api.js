// Netlify entry point for the SCORM API.
//
// The page itself is static (public/index.html) and served by Netlify's CDN, so
// this function carries only the three endpoints that need to run server-side:
// upload, samples, and content. netlify.toml routes /api/lms-demo/* here.
//
// Uploaded packages are held in Netlify Blobs rather than on disk — see
// utils/scorm-store.js for why.

const express = require('express');
const serverless = require('serverless-http');

const lmsDemoRouter = require('../../routes/lms-demo');

const app = express();

app.use('/api/lms-demo', lmsDemoRouter);

module.exports.handler = serverless(app, {
  // Uploads arrive as multipart bodies, which Netlify delivers base64-encoded.
  // Without this the ZIP would reach multer corrupted.
  binary: ['multipart/form-data', 'application/zip', 'application/octet-stream'],
});
