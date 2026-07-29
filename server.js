require('dotenv').config();
const express = require('express');
const ejsLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const path = require('path');

const { formatDate, statusClass } = require('./utils/helpers');
const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');
const smartCardRouter = require('./routes/smart-card');
const vimeoProxyRouter = require('./routes/vimeo-proxy');
const vimeoReferenceRouter = require('./routes/vimeo-reference');
const adminRouter = require('./routes/admin');
const lmsDemoRouter = require('./routes/lms-demo');
const vimeoAuthRouter = require('./routes/auth-vimeo');
const devTokenAuth = require('./middleware/dev-token-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (OpenLiteSpeed) so req.secure is correct and
// the secure cookie flag works in production.
app.set('trust proxy', 1);

// Security headers
// referrerPolicy: same-origin sends the Referer header on same-origin requests
// (needed for API request logging) while suppressing it for cross-origin ones.
app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'same-origin' } }));

// Session middleware — must come after trust proxy, before routes.
// memorystore prunes expired entries daily; avoids the MemoryStore leak warning.
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

// Static files — CSS, JS, images
app.use(express.static(path.join(__dirname, 'public')));

// Self-contained project pages (each lives in /projects/<name>/index.html)
app.use('/projects-static', express.static(path.join(__dirname, 'projects')));

// EJS templating — pages/home.ejs etc. are wrapped by views/layouts/main.ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

// Make helper functions available in every EJS template without importing them.
// To add a new helper: define it in utils/helpers.js, import it here, add it below.
app.locals.formatDate = formatDate;
app.locals.statusClass = statusClass;

// Development-only: rebuild a Vimeo session from VIMEO_TOKEN after a restart so
// `node --watch` doesn't force a re-auth on every save. No-op in production.
// Must run before the res.locals middleware below so templates see it.
app.use(devTokenAuth);

// Expose safe session auth info and current path to all EJS templates via res.locals.
// Templates read vimeoAuth.userName etc. — never contains the access token.
// currentPath is used by the auth widget to set the returnTo URL.
app.use((req, res, next) => {
  res.locals.vimeoAuth = req.session?.vimeoAuth || null;
  res.locals.currentPath = req.path;
  next();
});

// Auth routes — before page routes so /auth/* is never intercepted by the catch-all.
app.use('/auth', vimeoAuthRouter);

// Page routes (HTML)
app.use('/', pagesRouter);

// Vimeo API proxy + reference — mounted before the generic /api router to
// prevent the /api prefix-match from intercepting these more-specific paths.
app.use('/api/vimeo', vimeoProxyRouter);
app.use('/api/vimeo-reference', vimeoReferenceRouter);
app.use('/api/admin', adminRouter);

// Data routes (JSON) — hub project metadata
app.use('/api', apiRouter);

// Tool-specific API routes — each tool gets its own sub-path
app.use('/api/smart-card', smartCardRouter);
app.use('/api/lms-demo', lmsDemoRouter);

// Health check — returns JSON; useful for uptime monitors and confirming deploys
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'vimeo-home', timestamp: new Date().toISOString() });
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
  console.log(`vimeo-home running at http://localhost:${PORT}`);
});
