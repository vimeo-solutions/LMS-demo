# Vimeo LMS Integration Demo

A simulated corporate LMS — the fictional **Meridian Learning** — that consumes a SCORM 1.2
package exported from Vimeo. It demonstrates Vimeo's SCORM export capability to a customer
without needing a real LMS (Workday, Cornerstone, SAP SuccessFactors) in the loop.

The page acts as the SCORM 1.2 API adapter, so quiz scores and completion status stream into
a live gradebook as the learner watches.

The page is plain static HTML; only the SCORM API needs a server. It runs either as a small
Express app (EC2 + PM2) or on Netlify, where the page is served from the CDN and the API runs
as a function. No build step beyond generating the sample list.

---

## Folder structure

```
vimeo-lms-demo/
  server.js              — Express entry point (local + EC2/PM2)
  netlify.toml           — Netlify build, function and redirect config
  ecosystem.config.js    — PM2 config
  .env.example           — Environment variable template
  CLAUDE.md              — Developer guide (architecture, CSS vocabulary)

  routes/
    lms-demo.js          — SCORM upload + stored-content serving; shared by both hosts

  utils/
    scorm-store.js       — Where an uploaded package is kept: Netlify Blobs or the filesystem

  netlify/functions/
    api.js               — Wraps the router with serverless-http

  scripts/
    build-samples.js     — Regenerates public/scorm-examples/samples.json

  public/                — Published as-is by Netlify; served statically by Express
    index.html           — The demo page
    404.html             — Not-found page
    css/                 — Six ordered layers: reset → tokens → base → layout → components → pages
    js/lms-demo.js       — SCORM API adapter + gradebook UI; no build step
    img/                 — Vimeo wordmark shown in the topbar
    scorm-examples/      — Sample packages, one per scoring method, plus samples.json
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
server-side JS (`server.js`, `routes/`, `utils/`) because those are in the module graph. Files
under `public/` are served statically, so a hard refresh picks them up without a restart.

Both `npm start` and `npm run dev` regenerate `public/scorm-examples/samples.json` first, so a
`.zip` dropped into that folder shows up as a sample button on the next run.

To exercise the Netlify path locally instead:

```bash
npx netlify dev
```

Unlinked, that falls back to filesystem storage and logs a line saying so. Run `netlify link`
first to use real Netlify Blobs.

---

## Deploying to Netlify

`netlify.toml` has the whole configuration — publish `public/`, bundle `netlify/functions/`,
and route `/api/lms-demo/*` to the function. In the Netlify UI, connect the repo and accept the
detected settings; there are no environment variables to set.

Netlify Blobs is enabled per-site with no setup. It holds the uploaded package, because each
function invocation gets its own `/tmp` — a package written during upload would be gone by the
time the browser asked for its files.

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
| `/api/lms-demo/upload` | POST | Accepts a SCORM `.zip`, stores its files, returns the launch path, mastery score and scoring method |
| `/api/lms-demo/content/*` | GET | Serves the stored SCORM content (same-origin, so `window.parent.API` works) |
| `/scorm-examples/samples.json` | GET | Static list of bundled samples — a file, not an endpoint |
| `/health` | GET | `{ "status": "ok", "app": "vimeo-lms-demo", "timestamp": "..." }` |

---

## Running the demo

1. Export a SCORM 1.2 package from a Vimeo video, picking a **Scoring method** in the export
   dialog.
2. Drag the `.zip` onto the drop zone (or use **Upload SCORM** in the topbar). To demo without
   an export handy, click one of the bundled samples — there is one per scoring method.
3. Play through the video and answer the quiz. The right-hand gradebook updates live.
4. **Clear Entry** resets the gradebook; **Retake Course** appears when the learner fails.

### What the gradebook shows

| Row | Source |
|-----|--------|
| Status | `cmi.core.lesson_status` |
| Score | `cmi.core.score.raw` / `.max` |
| Scoring Method | `scoring_algorithm` from the package's export settings |
| Result | Derived from `lesson_status` — Passed, Failed, or Complete |
| Session Time Reported to Gradebook | `cmi.core.session_time`, as last reported by the content |

Session time is a value the content reports, not a clock the page runs, so it stops advancing
once the course reports completion — the same as a real LMS.

Vimeo's exports send score and completion but no per-question data, so the **Quiz Responses**
table appears only for packages that report `cmi.interactions.*`.

Vimeo keeps its export settings as query params on the `contentUrl` inside
`rxd/configuration.js`, not in `imsmanifest.xml`. The server reads the scoring method from
there, and uses `passing_score` as the mastery score when the manifest carries no
`<adlcp:masteryscore>` — without one, SCORM content reports `completed` instead of
passed/failed. `CLAUDE.md` covers this in detail.

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
