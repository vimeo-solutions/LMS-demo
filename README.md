# Vimeo LMS Integration Demo

A simulated corporate LMS — the fictional **Meridian Learning** — that consumes a SCORM 1.2
package exported from Vimeo. It demonstrates Vimeo's SCORM export capability to a customer
without needing a real LMS (Workday, Cornerstone, SAP SuccessFactors) in the loop.

The page acts as the SCORM 1.2 API adapter, so quiz scores and completion status stream into
a live gradebook as the learner watches.

Runs on Node.js + Express + EJS. No build step. Deploy with git pull + PM2.

---

## Folder structure

```
vimeo-lms-demo/
  server.js              — Express app entry point; serves the demo at /
  ecosystem.config.js    — PM2 config
  .env.example           — Environment variable template
  CLAUDE.md              — Developer guide (architecture, CSS vocabulary)

  routes/
    lms-demo.js          — SCORM upload, sample listing, extracted-content serving

  views/
    layouts/main.ejs     — Outer HTML shell
    pages/lms-demo.ejs   — The demo UI
    pages/error.ejs      — 404 / 500 page

  public/
    css/                 — Six ordered layers: reset → tokens → base → layout → components → pages
    js/lms-demo.js       — SCORM API adapter + gradebook UI; no build step
    scorm-examples/      — Bundled sample SCORM packages (.zip)
```

---

## Local development

```bash
npm install
cp .env.example .env      # then fill in SESSION_SECRET
npm run dev
```

Then open http://localhost:3000

`npm run dev` uses `node --watch` (Node 18+) — no nodemon needed. It restarts on changes to
server-side JS (`server.js`, `routes/`) because those are in the module graph. Edits to `.ejs`
templates and files under `public/` do **not** restart it and don't need to — EJS re-reads
templates per request outside production, and `public/` is served statically. A hard refresh
is enough for those.

---

## Production deployment (EC2 + PM2)

OpenLiteSpeed is already configured to reverse-proxy public traffic (port 80/443) to the local
Node app on port 3000. You don't need to touch DNS, TLS, vhosts, or listeners — just keep Node
running on port 3000.

```bash
# On the server:
git pull
npm install --omit=dev

# First deploy:
pm2 start ecosystem.config.js --env production
pm2 save

# Subsequent deploys:
pm2 restart vimeo-lms-demo
```

Check status: `pm2 status` / `pm2 logs vimeo-lms-demo`

---

## Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | The demo page |
| `/api/lms-demo/upload` | POST | Accepts a SCORM `.zip`, extracts it, returns launch path + title + mastery score |
| `/api/lms-demo/samples` | GET | Lists the bundled sample packages in `public/scorm-examples/` |
| `/api/lms-demo/content/*` | GET | Serves the extracted SCORM content (same-origin, so `window.parent.API` works) |
| `/health` | GET | `{ "status": "ok", "app": "vimeo-lms-demo", "timestamp": "..." }` |

---

## Running the demo

1. Export a SCORM 1.2 package from a Vimeo interactive video.
2. Drag the `.zip` onto the drop zone (or use **Upload SCORM** in the topbar). To demo without
   an export handy, click one of the bundled sample courses.
3. Play through the video and answer the quiz — Status, Score, Result, Session Time, and the
   Quiz Responses table update live in the right-hand gradebook.
4. **Clear Entry** resets the gradebook; **Retake Course** appears when the learner fails.

---

## How to update the visual theme

All design tokens are in `public/css/tokens.css`. Change CSS variables there to retheme
everything. Key variables:

- `--color-bg` / `--color-surface` — background layers
- `--color-accent` — primary accent
- `--color-text` / `--color-text-muted` — typography
- `--radius-md` / `--radius-lg` — corner rounding
- `--font-sans` / `--font-mono` — typefaces

Shared components are in `components.css`. The LMS shell's own styles are in `pages.css`.

---

## Security notes

- Never commit `.env` to GitHub — it's in `.gitignore`
- Uploaded SCORM content is served publicly at `/api/lms-demo/content/*` — don't upload anything
  sensitive
- Uploads are capped at 50 MB and must be `.zip`

---

## Known issues, open items & ideas

There's no GitHub issue tracker in use for this repo — this section is the durable home for
follow-up work. Update it as things get done or superseded.

- **Single active course, server-wide.** Extracted content goes to `/tmp/lms-demo-content`, which
  is shared rather than session-scoped. Two people demoing at once will overwrite each other.
  Fine for a live demo; would need per-session storage for concurrent use.
- **Uploaded content is never cleaned up.** `/tmp/lms-demo-content` persists until the next upload
  or a reboot.
- **No automated tests.** `npm test` is a stub. Smoke-test by uploading a sample and playing
  through the quiz.
- **`express-session` is wired up but unused.** The demo is stateless; the middleware is there
  for future features, which is why `SESSION_SECRET` is required at startup.
