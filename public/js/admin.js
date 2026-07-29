'use strict';

const POLL_MS = 5000;
let pollTimer = null;

// ── Fetch + render ────────────────────────────────────────────────────────────

async function fetchAndRender() {
  try {
    const [logRes, statsRes] = await Promise.all([
      fetch('/api/admin/log'),
      fetch('/api/admin/stats'),
    ]);
    if (!logRes.ok || !statsRes.ok) throw new Error('fetch failed');
    const [entries, stats] = await Promise.all([logRes.json(), statsRes.json()]);
    renderStats(stats);
    renderTimeline(stats.buckets);
    renderReferers(stats.byReferer);
    renderTable(entries);
    setStatus('Updated ' + fmtTime(new Date()));
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
}

function setStatus(msg) {
  const el = document.getElementById('refresh-status');
  if (el) el.textContent = msg;
}

// ── Stat tiles ────────────────────────────────────────────────────────────────

function renderStats(stats) {
  const rl = stats.latestRateLimit;
  const remaining = rl ? parseInt(rl.remaining, 10) : null;
  const limit = rl ? parseInt(rl.limit, 10) : null;

  setText('stat-limit', limit != null ? limit : '—');
  setText('stat-total', stats.totalEntries);

  const remEl = document.getElementById('stat-remaining');
  if (remEl) {
    remEl.textContent = remaining != null ? remaining : '—';
    remEl.style.color =
      remaining === null ? '' :
      remaining === 0 ? '#B91C1C' :
      remaining <= 10 ? '#B45309' : '';
  }

  const resetEl = document.getElementById('stat-reset');
  if (resetEl) {
    if (rl?.resetAt) {
      const secsLeft = Math.max(0, Math.round((new Date(rl.resetAt) - Date.now()) / 1000));
      resetEl.textContent = secsLeft > 0 ? `resets in ${secsLeft}s` : 'resetting now';
    } else {
      resetEl.textContent = 'no data yet';
    }
  }
}

// ── Timeline SVG bar chart ────────────────────────────────────────────────────

function renderTimeline(buckets) {
  const svg = document.getElementById('timeline-svg');
  const labels = document.getElementById('timeline-labels');
  if (!svg || !buckets?.length) return;

  const N = buckets.length;
  const W = 300;
  const H = 60;
  const barW = W / N;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const bars = buckets.map((b, i) => {
    const h = b.count === 0 ? 1.5 : Math.max(2, (b.count / maxCount) * (H - 4));
    const y = H - h;
    const x = i * barW + 0.5;
    const fill = b.errors > 0 ? '#f85149' :
                 b.count > 0 ? 'var(--color-accent)' :
                 'var(--color-border)';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="1.5"/>`;
  }).join('');

  svg.innerHTML = bars;

  // Labels: 5m ago, 4m ago, 3m ago, 2m ago, 1m ago, now
  // Every 6 buckets = 1 minute. Label positions at bucket 0, 6, 12, 18, 24, 29.
  const labelTimes = ['−5m', '−4m', '−3m', '−2m', '−1m', 'now'];
  labels.innerHTML = labelTimes.map((l) => `<span>${l}</span>`).join('');
}

// ── By-referer bar chart ──────────────────────────────────────────────────────

function renderReferers(byReferer) {
  const body = document.getElementById('referer-body');
  const subtitle = document.getElementById('referer-subtitle');
  if (!body) return;

  const entries = Object.entries(byReferer || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!entries.length) {
    body.innerHTML = '<p class="admin-chart-empty">No data yet.</p>';
    if (subtitle) subtitle.textContent = '';
    return;
  }

  const max = entries[0][1];
  if (subtitle) subtitle.textContent = `${entries.length} source${entries.length !== 1 ? 's' : ''}`;

  body.innerHTML = entries.map(([ref, count]) => {
    const pct = ((count / max) * 100).toFixed(0);
    return `<div class="admin-referer-row">
      <div class="admin-referer-label" title="${esc(ref)}">${esc(ref)}</div>
      <div class="admin-referer-bar-wrap">
        <div class="admin-referer-bar" style="width:${pct}%"></div>
      </div>
      <div class="admin-referer-count">${count}</div>
    </div>`;
  }).join('');
}

// ── Request log table ─────────────────────────────────────────────────────────

function renderTable(entries) {
  const emptyEl = document.getElementById('log-empty');
  const wrapEl = document.getElementById('log-table-wrap');
  const subtitleEl = document.getElementById('log-subtitle');

  if (subtitleEl) subtitleEl.textContent = `${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`;

  if (!entries.length) {
    emptyEl?.classList.remove('hidden');
    wrapEl?.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  wrapEl?.classList.remove('hidden');

  const rows = entries.slice(0, 200).map((e) => {
    const ts = new Date(e.timestamp);
    const statusCls = e.status >= 500 ? 's-5xx' : e.status >= 400 ? 's-4xx' : 's-2xx';
    const method = (e.method || 'GET').toLowerCase();
    const path = esc(e.path + (e.query || ''));
    const ref = e.referer ? esc(localPath(e.referer)) : '—';
    const remaining = e.rateLimit?.remaining ?? '—';
    const remStyle = remaining === 0 || remaining === '0' ? 'color:#B91C1C' :
                     (parseInt(remaining, 10) <= 10 && remaining !== '—') ? 'color:#B45309' : '';

    return `<tr>
      <td title="${ts.toISOString()}" class="admin-td-time">${relTime(ts)}</td>
      <td><span class="method-badge method-badge--${method}">${esc(e.method)}</span></td>
      <td class="admin-td-path" title="${path}">${path}</td>
      <td class="admin-td-ref">${ref}</td>
      <td><span class="status-badge ${statusCls}">${e.status}</span></td>
      <td class="admin-td-dur">${e.durationMs}ms</td>
      <td class="admin-td-rem" style="${remStyle}">${remaining}</td>
    </tr>`;
  }).join('');

  const tbody = document.getElementById('log-tbody');
  if (tbody) tbody.innerHTML = rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function localPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || url;
  }
}

function relTime(date) {
  const diff = Date.now() - date.getTime();
  if (diff < 4000) return 'just now';
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  const m = Math.floor(diff / 60000);
  const s = Math.round((diff % 60000) / 1000);
  return `${m}m ${s}s ago`;
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  fetchAndRender();
  pollTimer = setInterval(fetchAndRender, POLL_MS);

  document.getElementById('auto-refresh')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      pollTimer = setInterval(fetchAndRender, POLL_MS);
      fetchAndRender();
    } else {
      clearInterval(pollTimer);
      setStatus('Auto-refresh paused');
    }
  });

  document.getElementById('clear-btn')?.addEventListener('click', async () => {
    await fetch('/api/admin/log', { method: 'DELETE' });
    fetchAndRender();
  });
});
