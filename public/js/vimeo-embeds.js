// ── Debug ─────────────────────────────────────────────────────────────────────
// Set to true to re-enable verbose SDK event tracing in the console while debugging.
const DEBUG = false;
const dbg = (...args) => DEBUG && console.debug('[vimeo-embeds]', ...args);

dbg('script loaded — Vimeo SDK available:', typeof window.Vimeo !== 'undefined');

// If the SDK CDN script hasn't loaded yet it will be available by the time the
// user submits the form (it loads synchronously in <head>). Log if it's missing
// on DOMContentLoaded so we catch load failures early.
document.addEventListener('DOMContentLoaded', () => {
  dbg('DOM ready — Vimeo SDK available:', typeof window.Vimeo !== 'undefined');
  if (typeof window.Vimeo === 'undefined') {
    console.warn('[vimeo-embeds] Vimeo Player SDK not found on window. Check that player.vimeo.com/api/player.js loaded without error (Network tab).');
  }
});

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  videoId: null,
  player: null,
  lastTimeupdateLog: 0,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadForm        = document.getElementById('loadForm');
const videoInput      = document.getElementById('videoInput');
const loadBtn         = document.getElementById('loadBtn');
const inputError      = document.getElementById('inputError');
const contentSection  = document.getElementById('contentSection');
const playerContainer = document.getElementById('playerContainer');
const videoTitle      = document.getElementById('videoTitle');
const videoSubtitle   = document.getElementById('videoSubtitle');
const vimeoLink       = document.getElementById('vimeoLink');
const schemaTableBody = document.getElementById('schemaTableBody');
const ogTableBody     = document.getElementById('ogTableBody');
const jsonldOutput    = document.getElementById('jsonldOutput');
const jsonldDetails   = document.getElementById('jsonldDetails');
const jsonldPanel     = document.getElementById('jsonldPanel');
const jsonldToggle    = document.getElementById('jsonldToggle');
const ogPanel         = document.getElementById('ogPanel');
const ogToggle        = document.getElementById('ogToggle');
const eventsSection   = document.getElementById('eventsSection');
const eventsToggle    = document.getElementById('eventsToggle');
const eventLog        = document.getElementById('eventLog');
const eventLogEmpty   = document.getElementById('eventLogEmpty');
const toastContainer  = document.getElementById('toastContainer');
const pageEl          = document.querySelector('.page--vimeo-embeds');

// ── Input parsing ─────────────────────────────────────────────────────────────
// Returns { id: string } or { error: string }.
// id is always "NUMERIC" for standard videos or "NUMERIC:HASH" for unlisted.
function parseVimeoInput(input) {
  const raw = input.trim();

  // Bare numeric ID: "1197587769"
  if (/^\d+$/.test(raw)) return { id: raw };

  // Bare ID with hash, colon or slash: "1197587769:ea8bef44e4" / "1197587769/ea8bef44e4"
  const bareHash = /^(\d+)[:/]([a-zA-Z0-9]+)$/.exec(raw);
  if (bareHash) return { id: `${bareHash[1]}:${bareHash[2]}` };

  // URL-based: extract pathname, stripping query string and fragment
  let pathname = raw;
  const isVimeoUrl = raw.includes('vimeo.com');
  if (isVimeoUrl) {
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      pathname = url.pathname;
    } catch (_) {
      pathname = raw.replace(/[?#].*$/, '').replace(/.*vimeo\.com/, '');
    }
  }

  const segs = pathname.replace(/^\//, '').split('/').filter(Boolean);
  if (segs.length === 0) {
    return { error: 'Could not find a Vimeo video ID in that input. Try a URL like https://vimeo.com/123456789.' };
  }

  // /manage/videos/ID[/HASH]
  if (segs[0] === 'manage' && segs[1] === 'videos' && segs[2]) {
    if (/^\d+$/.test(segs[2])) {
      return segs[3] ? { id: `${segs[2]}:${segs[3]}` } : { id: segs[2] };
    }
  }

  // /video/ID or /videos/ID (API-style paths)
  if ((segs[0] === 'video' || segs[0] === 'videos') && segs[1] && /^\d+$/.test(segs[1])) {
    return segs[2] ? { id: `${segs[1]}:${segs[2]}` } : { id: segs[1] };
  }

  // /ID[/HASH] — standard vimeo.com URL
  if (/^\d+$/.test(segs[0])) {
    return segs[1] ? { id: `${segs[0]}:${segs[1]}` } : { id: segs[0] };
  }

  // Non-numeric first segment + second segment on vimeo.com → custom URL
  if (segs.length >= 2 && isVimeoUrl) {
    return { error: 'Videos with Custom URLs cannot be embedded. Please use a direct link (e.g. vimeo.com/123456789) or the numeric video ID.' };
  }

  return { error: 'Could not find a Vimeo video ID in that input. Try a URL like https://vimeo.com/123456789 or just the numeric ID.' };
}

function isoDuration(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  let iso = 'PT';
  if (h) iso += `${h}H`;
  if (m) iso += `${m}M`;
  if (sec || (!h && !m)) iso += `${sec}S`;
  return iso;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractIframeSrc(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const iframe = doc.querySelector('iframe');
  return iframe ? iframe.getAttribute('src') : '';
}

function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Toasts ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Loading state ─────────────────────────────────────────────────────────────
function setLoading(loading) {
  loadBtn.disabled = loading;
  loadBtn.textContent = loading ? 'Loading…' : 'Load Video';
}

// ── Event log ─────────────────────────────────────────────────────────────────
function logEvent(icon, text) {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'event-log__entry';

  const timeEl = document.createElement('span');
  timeEl.className = 'event-log__time';
  timeEl.textContent = time;

  const iconEl = document.createElement('span');
  iconEl.className = 'event-log__icon';
  iconEl.textContent = icon;

  const textNode = document.createTextNode(' ' + text);

  entry.appendChild(timeEl);
  entry.appendChild(iconEl);
  entry.appendChild(textNode);

  // Newest at top
  eventLog.insertBefore(entry, eventLog.firstChild || null);

  // Cap at 100 entries
  while (eventLog.children.length > 100) {
    eventLog.removeChild(eventLog.lastChild);
  }

  eventLogEmpty.classList.add('hidden');
}

function clearEventLog() {
  eventLog.innerHTML = '';
  eventLogEmpty.classList.remove('hidden');
}

// ── Player event definitions ──────────────────────────────────────────────────
// Event names are from the Vimeo Player SDK reference:
// https://developer.vimeo.com/player/sdk/reference#events
//
// NOTE: The 'loaded' SDK event fires only when player.loadVideo() is called on
// an already-initialized player — NOT on initial creation. Initial readiness
// is handled via player.ready() below.
const EVENT_DEFS = [
  { name: 'play',               icon: '▶',  fmt: (d) => `Play at ${formatTime(d.seconds)}` },
  { name: 'pause',              icon: '⏸',  fmt: (d) => `Pause at ${formatTime(d.seconds)}` },
  { name: 'ended',              icon: '⏹',  fmt: () => 'Ended' },
  { name: 'seeking',            icon: '⤳',  fmt: (d) => `Seeking to ${formatTime(d.seconds)}` },
  { name: 'seeked',             icon: '↩',  fmt: (d) => `Seeked to ${formatTime(d.seconds)}` },
  { name: 'bufferstart',        icon: '⏳',  fmt: () => 'Buffering…' },
  { name: 'bufferend',          icon: '✓',  fmt: () => 'Buffer ready' },
  { name: 'volumechange',       icon: '🔊',  fmt: (d) => `Volume: ${Math.round((d.volume ?? 0) * 100)}%` },
  { name: 'playbackratechange', icon: '⚡',  fmt: (d) => `Playback rate: ${d.playbackRate}×` },
  { name: 'fullscreenchange',   icon: '⛶',  fmt: (d) => `Fullscreen: ${d.fullscreen ? 'on' : 'off'}` },
  { name: 'qualitychange',      icon: '◉',  fmt: (d) => `Quality: ${d.quality}` },
  { name: 'error',              icon: '✗',  fmt: (d) => `Error: ${d.message || JSON.stringify(d)}` },
];

// Debug: monitor every raw postMessage from the Vimeo iframe so we can see
// what the player is actually emitting, independent of the SDK's dispatch layer.
// Remove or guard with DEBUG once events are confirmed working.
if (DEBUG) {
  window.addEventListener('message', (e) => {
    if (!e.origin.includes('vimeo.com')) return;
    try {
      const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (msg && (msg.event || msg.method)) {
        dbg('raw postMessage from player iframe:', msg);
      }
    } catch (_) {}
  });
  dbg('raw postMessage debug listener installed');
}

function attachPlayerEvents(player) {
  dbg(
    "attachPlayerEvents called — attaching",
    EVENT_DEFS.length + 1,
    "listeners",
  );

  EVENT_DEFS.forEach(({ name, icon, fmt }) => {
    dbg("  attaching:", name);
    player.on(name, (data) => {
      dbg(`event fired: "${name}"`, data);
      try {
        logEvent(icon, fmt(data));
      } catch (err) {
        console.error("[vimeo-embeds] handler error for event", name, err);
      }
    });
  });

  // timeupdate fires multiple times per second — throttle to one log per 5s
  player.on('timeupdate', (data) => {
    const now = Date.now();
    if (now - state.lastTimeupdateLog < 5000) return;
    state.lastTimeupdateLog = now;
    dbg('event fired: "timeupdate" (throttled)', data);
    logEvent('⏱', `${formatTime(data.seconds)} / ${formatTime(data.duration)}`);
  });

  dbg('all listeners attached');
}

// ── Load player ───────────────────────────────────────────────────────────────
async function loadPlayer(videoId) {
  dbg("loadPlayer called with videoId:", videoId);

  if (state.player) {
    dbg("destroying previous player");
    try {
      await state.player.destroy();
    } catch (e) {
      dbg("destroy error (ignored):", e);
    }
    state.player = null;
  }
  playerContainer.innerHTML = "";
  state.lastTimeupdateLog = 0;

  // For unlisted videos the SDK requires the `url` option (with hash in the
  // path) instead of a bare numeric `id`, which would resolve to the public
  // video and fail the privacy check.
  const [numericId, hashToken] = videoId.split(':');
  const playerOptions = hashToken
    ? { url: `https://vimeo.com/${numericId}/${hashToken}`, responsive: true }
    : { id: parseInt(numericId, 10), responsive: true };

  dbg('creating new Vimeo.Player with options:', playerOptions);
  const player = new Vimeo.Player(playerContainer, playerOptions);
  state.player = player;
  dbg("Vimeo.Player instance created:", player);

  // player.ready() resolves when the iframe has fully initialized and the
  // two-way postMessage channel is open. Event listeners MUST be attached
  // after this point — calling player.on() before ready() sends addEventListener
  // commands to the iframe before it can receive them; the SDK's internal
  // .catch(() => {}) silently swallows those failures and the events are never
  // registered.
  dbg("awaiting player.ready()");
  try {
    await player.ready();
    dbg("player.ready() resolved — attaching event listeners now");
  } catch (err) {
    dbg("player.ready() rejected:", err);
    console.error("[vimeo-embeds] player.ready() failed:", err);
    logEvent("✗", `Player failed to initialize: ${err.message}`);
    throw err;
  }

  attachPlayerEvents(player);
  logEvent("✓", `Player ready — video ID ${videoId}`);
}

// ── JSON-LD generation + head injection ───────────────────────────────────────
function buildJsonLd(data) {
  const embedSrc = extractIframeSrc(data.embed?.html);
  const thumb = data.pictures?.base_link || '';
  const plays = data.stats?.plays;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: data.name || '',
    description: data.description || '',
    thumbnailUrl: thumb,
    uploadDate: data.created_time || '',
    duration: isoDuration(data.duration || 0),
    contentUrl: data.link || '',
    embedUrl: embedSrc,
    author: {
      '@type': 'Person',
      name: data.user?.name || '',
    },
  };

  if (plays != null) {
    jsonld.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'WatchAction' },
      userInteractionCount: plays,
    };
  }

  return jsonld;
}

function injectJsonLd(jsonld) {
  const existing = document.getElementById('vimeo-jsonld');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'vimeo-jsonld';
  script.textContent = JSON.stringify(jsonld, null, 2);
  document.head.appendChild(script);
  dbg('JSON-LD injected into <head>');
}

// ── Metadata tables ───────────────────────────────────────────────────────────
const SCHEMA_NOTES = {
  name:                   'Primary title indexed by search engines; appears in video rich results',
  description:            'Helps engines understand context; used for snippet generation and AEO answers',
  thumbnailUrl:           'Required for rich result eligibility in Google Search',
  uploadDate:             'Required for rich results; affects content freshness scoring',
  duration:               'ISO 8601 format (e.g. PT4M30S); surfaced in Google video rich results',
  contentUrl:             'Canonical URL of the video; used for deduplication across syndication',
  embedUrl:               'Confirms this page hosts an embed, not just a link',
  'author.name':          'Associates content with a creator; supports E-E-A-T signals',
  interactionStatistic:   'Play count helps engines gauge popularity and engagement',
};

const OG_PURPOSES = {
  'og:type':         'Tells platforms this is a video page, enabling video-specific features',
  'og:title':        'Title shown in rich link previews',
  'og:description':  'Description shown in rich link previews and shares',
  'og:image':        'Thumbnail image for social share cards',
  'og:url':          'Canonical URL; prevents duplicate content issues across shares',
  'og:video':        'Enables inline video playback on Facebook and some other platforms',
  'og:video:type':   'MIME type of the embed',
  'og:video:width':  'Player dimensions for embed rendering',
  'og:video:height': 'Player dimensions for embed rendering',
};

function renderSchemaTable(jsonld) {
  const rows = [
    ['name',               jsonld.name],
    ['description',        jsonld.description],
    ['thumbnailUrl',       jsonld.thumbnailUrl],
    ['uploadDate',         jsonld.uploadDate],
    ['duration',           jsonld.duration],
    ['contentUrl',         jsonld.contentUrl],
    ['embedUrl',           jsonld.embedUrl],
    ['author.name',        jsonld.author?.name],
  ];

  if (jsonld.interactionStatistic) {
    rows.push(['interactionStatistic', jsonld.interactionStatistic.userInteractionCount.toLocaleString() + ' plays']);
  }

  schemaTableBody.innerHTML = rows.map(([field, value]) => `
    <tr>
      <td><code>${escHtml(field)}</code></td>
      <td class="metadata-value" title="${escHtml(value || '')}">${escHtml(value || '—')}</td>
      <td class="metadata-note">${escHtml(SCHEMA_NOTES[field] || '')}</td>
    </tr>
  `).join('');
}

function renderOgTable(data, jsonld) {
  const tags = [
    ['og:type',          'video.other'],
    ['og:title',         jsonld.name],
    ['og:description',   jsonld.description],
    ['og:image',         jsonld.thumbnailUrl],
    ['og:url',           jsonld.contentUrl],
    ['og:video',         jsonld.embedUrl],
    ['og:video:type',    'text/html'],
    ['og:video:width',   data.width  ? String(data.width)  : '—'],
    ['og:video:height',  data.height ? String(data.height) : '—'],
  ];

  ogTableBody.innerHTML = tags.map(([prop, content]) => `
    <tr>
      <td><code>${escHtml(prop)}</code></td>
      <td class="metadata-value" title="${escHtml(content || '')}">${escHtml(content || '—')}</td>
      <td class="metadata-note">${escHtml(OG_PURPOSES[prop] || '')}</td>
    </tr>
  `).join('');
}

function applyAccentBackground(embedColor) {
  // embedColor arrives as a 6-char hex without '#' (e.g. "1ab7ea"); may be absent
  if (!embedColor) return;
  const hex = `#${embedColor.replace(/^#/, '')}`;
  pageEl.style.background = `linear-gradient(to bottom, ${hex} 0%, var(--color-bg) 60%)`;
  dbg('accent background applied:', hex);
}

function populateMetadata(data) {
  dbg('populateMetadata called');
  const jsonld = buildJsonLd(data);

  videoTitle.textContent = data.name || 'Video';
  videoSubtitle.textContent = data.user?.name ? `by ${data.user.name}` : '';
  vimeoLink.href = data.link || '#';

  renderSchemaTable(jsonld);
  renderOgTable(data, jsonld);

  jsonldOutput.textContent = JSON.stringify(jsonld, null, 2);
  jsonldDetails.removeAttribute('open');

  injectJsonLd(jsonld);
  applyAccentBackground(data.embed?.color);
}

// ── Collapsible helpers ───────────────────────────────────────────────────────
function makeToggle(panel, toggle) {
  function doToggle() {
    const isOpen = panel.classList.toggle('collapsible--open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  }
  toggle.addEventListener('click', doToggle);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(); }
  });
  return {
    open()  { panel.classList.add('collapsible--open');    toggle.setAttribute('aria-expanded', 'true'); },
    close() { panel.classList.remove('collapsible--open'); toggle.setAttribute('aria-expanded', 'false'); },
  };
}

const jsonldCollapsible  = makeToggle(jsonldPanel,   jsonldToggle);
const ogCollapsible      = makeToggle(ogPanel,       ogToggle);
const eventsCollapsible  = makeToggle(eventsSection, eventsToggle);

// ── Reset between loads ───────────────────────────────────────────────────────
function resetContent() {
  schemaTableBody.innerHTML = '';
  ogTableBody.innerHTML = '';
  jsonldOutput.textContent = '';
  clearEventLog();

  pageEl.style.background = '';

  const existing = document.getElementById('vimeo-jsonld');
  if (existing) existing.remove();

  jsonldCollapsible.close();
  ogCollapsible.close();
  eventsCollapsible.close();
}

// ── Form submit ───────────────────────────────────────────────────────────────
loadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  inputError.classList.add('hidden');

  const raw = videoInput.value;
  const parsed = parseVimeoInput(raw);
  dbg('form submitted — raw:', raw, '— parsed:', parsed);

  if (parsed.error) {
    inputError.textContent = parsed.error;
    inputError.classList.remove('hidden');
    return;
  }

  const videoId = parsed.id;                  // "ID" or "ID:HASH"
  const numericId = videoId.split(':')[0];     // just the numeric part for API calls

  state.videoId = videoId;
  setLoading(true);
  resetContent();

  try {
    dbg('fetching video metadata for', numericId);
    const res = await fetch(`/api/vimeo/videos/${numericId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Vimeo API returned ${res.status}`);
    }
    const data = await res.json();
    dbg("metadata fetched successfully:", data.name);

    await loadPlayer(videoId);
    populateMetadata(data);

    // Auto-open the metadata panels so the structured data is immediately visible
    // jsonldCollapsible.open();
    // ogCollapsible.open();

    contentSection.classList.remove("hidden");
    contentSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    dbg('load failed:', err);
    showToast(`Failed to load video: ${err.message}`, 'error', 6000);
  } finally {
    setLoading(false);
  }
});
