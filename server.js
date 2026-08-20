require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const path = require('path');

const lmsDemoRouter = require('./routes/lms-demo');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Trust the first proxy hop (OpenLiteSpeed) so req.secure is correct and
// the secure cookie flag works in production.
app.set('trust proxy', 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'same-origin' } }));

// Session middleware — must come after trust proxy, before routes.
// The demo itself is stateless; this serves future features that need
// per-visitor state. memorystore prunes expired entries daily.
app.use(session({
  secret: process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET is required'); })(),
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86400000 }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// Parse request bodies (conservative size limit)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// The demo page, CSS, JS, wordmark and sample packages. index.html is served at
// / automatically — the same file Netlify publishes.
app.use(express.static(PUBLIC_DIR));

// SCORM upload / sample listing / stored-content serving
app.use('/api/lms-demo', lmsDemoRouter);

// Health check — returns JSON; useful for uptime monitors and confirming deploys
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'vimeo-lms-demo', timestamp: new Date().toISOString() });
});

// 404 — the same static page Netlify serves for unmatched paths
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// 500 — four-argument signature is required by Express to recognize error handlers
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err.stack);
  res.status(500).type('text/plain').send('Something went wrong on the server.');
});

app.listen(PORT, () => {
  console.log(`vimeo-lms-demo running at http://localhost:${PORT}`);
});
