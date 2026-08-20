require('dotenv').config();
const express = require('express');
const ejsLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const path = require('path');

const lmsDemoRouter = require('./routes/lms-demo');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Static files — CSS, JS, sample SCORM packages
app.use(express.static(path.join(__dirname, 'public')));

// EJS templating — pages/lms-demo.ejs is wrapped by views/layouts/main.ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

// The demo is the whole site — it lives at the root.
app.get('/', (req, res) => {
  res.render('pages/lms-demo', {
    title: 'LMS Integration Demo',
    extraScripts: '<script src="/js/lms-demo.js"></script>',
  });
});

// SCORM upload / sample listing / extracted-content serving
app.use('/api/lms-demo', lmsDemoRouter);

// Health check — returns JSON; useful for uptime monitors and confirming deploys
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'vimeo-lms-demo', timestamp: new Date().toISOString() });
});

// 404 — rendered as a styled page, not a plain-text error
app.use((req, res) => {
  res.status(404).render('pages/error', {
    title: 'Page Not Found',
    statusCode: 404,
    message: "The page you're looking for doesn't exist.",
  });
});

// 500 — four-argument signature is required by Express to recognize error handlers
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err.stack);
  res.status(500).render('pages/error', {
    title: 'Server Error',
    statusCode: 500,
    message: 'Something went wrong on the server.',
  });
});

app.listen(PORT, () => {
  console.log(`vimeo-lms-demo running at http://localhost:${PORT}`);
});
