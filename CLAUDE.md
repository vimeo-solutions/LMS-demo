# LMS demo contributor guide

Node.js + Express site serving a single EJS-templated page: a simulated LMS ("Meridian Learning")
that consumes a SCORM 1.2 package exported from Vimeo, built for Vimeo Sales Engineering demos.

**Local dev:** `npm run dev` uses `node --watch` — just save a file and reload the browser, no restart needed.
**Production:** PM2 (`ecosystem.config.js`) runs with `watch: false` — after `git pull`, you must run
`pm2 restart vimeo-lms-demo` for changes to take effect. See `README.md`'s deploy section.

---

## Tech stack

| Layer | Tool |
|-------|------|
| Server | Node.js + Express |
| Templates | EJS via express-ejs-layouts |
| CSS | Custom BEM, no framework |
| Process manager | PM2 (production; `watch: false`, manual restart required) |
| Hosting | AWS EC2 behind OpenLiteSpeed |

---

## Key files

```
server.js                  Express entry point; renders the demo at / and mounts the API router
routes/lms-demo.js         SCORM 1.2 upload/runtime simulation (stores uploads in /tmp)
views/layouts/main.ejs     Outer HTML shell; uses <%- body %> from express-ejs-layouts
views/pages/lms-demo.ejs   The demo UI
views/pages/error.ejs      404 / 500 page
public/css/                CSS load order: reset → tokens → base → layout → components → pages
public/js/lms-demo.js      SCORM API adapter + gradebook UI (no build step)
public/scorm-examples/     Bundled sample SCORM packages (.zip)
.env                       See "Environment variables" below
```

**There is no Vimeo API integration.** This app makes no outbound Vimeo calls, has no OAuth flow,
and holds no Vimeo tokens. If you add a feature that needs the Vimeo API, you're adding that
plumbing from scratch — document it here when you do.

---

## LMS Integration Demo

The whole site. Simulates a customer's LMS consuming a SCORM 1.2 package exported from Vimeo,
demonstrating Vimeo's SCORM export capability without needing a real LMS.

- Upload a SCORM 1.2 ZIP (or pick one of the bundled samples in `public/scorm-examples/`)
- The server unzips it with `adm-zip`, parses `imsmanifest.xml` to find the launch file (regex-based,
  tries the `adlcp:scormType="sco"` attribute first, falls back to the first `.html` resource), and
  extracts to a **shared, non-session-scoped** directory: `path.join('/tmp', 'lms-demo-content')`
- The page acts as the SCORM 1.2 API adapter (`LMSInitialize`, `LMSGetValue`, `LMSSetValue`,
  `LMSFinish`, etc.), capturing quiz scores/completion status into a live gradebook UI
- Extracted content is served same-origin from `/api/lms-demo/content/*` so the SCO's
  `window.parent.API` lookup resolves
- The course name in the topbar and sidebar is the fixed `COURSE_TITLE` constant in
  `public/js/lms-demo.js`. The manifest `<title>` is never read — Vimeo wraps it in CDATA,
  and the demo doesn't need the real name

### Reading Vimeo's export settings

The "Export for LMS" settings are **not** in `imsmanifest.xml`. Vimeo attaches them as query
params on the `contentUrl` inside `rxd/configuration.js`:

```
scoring_algorithm=quiz&completion_threshold=90&passing_score=80
&skipping_forward=true&speed=true
```

`readExportSettings()` in `routes/lms-demo.js` parses that file and returns two things:

| Returned | Source | Used for |
|----------|--------|----------|
| `scoringMethod` | `scoring_algorithm` | The "Scoring Method" gradebook row |
| `passingScore` | `passing_score` | Mastery score fallback (below) |

`scoring_algorithm` takes three values — `quiz`, `percentage`, `passfail` — mapped to Vimeo's
own labels in `SCORING_LABELS`. Anything unrecognised is sentence-cased rather than dropped,
so a future fourth option still renders.

**Mastery score.** SCORM 1.2 content only reports `passed`/`failed` when it has a mastery score
to compare against; with none it settles for `completed`. Vimeo never emits
`<adlcp:masteryscore>`, so the manifest is checked first (the standard location) and Vimeo's
`passing_score` is the fallback. Without this the gradebook Result row stays empty even on
success.

**Quiz Responses.** Vimeo's exports report score and `lesson_status` but no per-question
`cmi.interactions.*` data, so `updateInteractions()` hides that whole gradebook section unless
a package actually sends interactions.
- Since `/tmp` storage isn't session-scoped, this only really supports one active demo course at a
  time per server — fine for a live demo, would need real per-session storage for concurrent use

---

## CSS architecture

Custom BEM across six ordered layers. **Check components.css before writing any new CSS.**
The shared layers carry only what this demo uses — if you add a pattern used in more than one
place, it belongs in components.css, not pages.css.

### Layer responsibilities

| File | Purpose |
|------|---------|
| `tokens.css` | CSS custom properties only |
| `reset.css` | Browser normalization |
| `base.css` | Element defaults (h1–h4, p, a, code) + `.main-content` |
| `layout.css` | `.container` (used only by the error page) |
| `components.css` | Reusable UI with BEM naming (see vocabulary below) |
| `pages.css` | The error page block and the `.lms-*` shell |

### BEM naming convention

```
Block:     .btn  .toast  .empty-state
Element:   .empty-state__heading  .lms-topbar__brand
Modifier:  .btn--primary  .lms-avatar--lg
State:     .toast--visible  (JS-toggled)
Utilities: .hidden  (in components.css — not BEM, small and documented)
```

### Component vocabulary (components.css)

```
.btn  .btn--primary  .btn--sm
.table
.hidden
.toast-container  .toast  .toast--visible
.toast--success  .toast--error  .toast--warning  .toast--info
.empty-state  .empty-state__icon  .empty-state__heading  .empty-state__body
```

In JS:
```js
toast.className = `toast toast--${type}`;   // type: success | error | warning | info
toast.classList.add('toast--visible');       // show
toast.classList.remove('toast--visible');    // dismiss
```

### LMS shell vocabulary (pages.css)

```
.page--lms-demo  .lms-shell
.lms-topbar  .lms-topbar__brand  __course  __actions  __btn  __user  __user-name
.lms-avatar  .lms-avatar--lg
.lms-workspace
.lms-sidebar  .lms-sidebar__label  __label--top  __empty  __about
.lms-learner-card  .lms-learner-card__name  __role
.lms-course-item  .lms-course-item__icon  __title  __status
.lms-content  .lms-drop-zone  .lms-drop-zone__overlay  __btn  .lms-iframe
.lms-gradebook  .lms-gradebook__header  __section-label  __footer
.lms-stat-group  .lms-stat  .lms-stat__label  __value  __value--mono
.lms-status-chip  --neutral  --progress  --success  --error
.lms-interactions-empty  .lms-interactions-table
.lms-samples  .lms-samples__divider  __list
.lms-retake-area  .lms-retake-btn
```

The shell is `height: 100vh` — there is no site nav or footer above it.

---

## Environment variables (`.env`)

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Required — long random string. `express-session` is wired up in `server.js` and throws at startup without it, even though the demo itself is stateless. |
| `PORT` | Express listen port |
| `NODE_ENV` | `development` locally, `production` under PM2 |

Env vars are read at startup. In local dev `node --watch` picks up `.env` changes on the next
restart; in production a PM2 restart is needed since `watch: false` (see the top of this file).

## Operational Details

Before initiating a new planning session or, if no planning was requested by the user and the skill
hasn't yet been applied to the task at hand, implementing or proposing any significant code changes,
assess the available Claude skills for potential relevance or guidance. Specifically, consider the
code-standards skill for maintaining a clean, concise codebase.
