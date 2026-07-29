/* Vimeo API Reference — client-side spec browser and documentation renderer */

const state = {
  spec: null,
  ops: [],
  groups: {},
  activeOp: null,
  searchQuery: '',
  hidePrivate: false,
};

const dom = {
  nav: document.getElementById('api-nav'),
  doc: document.getElementById('api-doc'),
  empty: document.getElementById('api-empty'),
  search: document.getElementById('api-search'),
  hidePrivateToggle: document.getElementById('api-hide-private'),
  toast: document.getElementById('toast'),
};

// ── Spec helpers ──────────────────────────────────────────────────────────────

function resolveRef(schemaOrRef, spec) {
  if (!schemaOrRef || !schemaOrRef.$ref) return schemaOrRef;
  const name = schemaOrRef.$ref.split('/').pop();
  return spec.components?.schemas?.[name] ?? schemaOrRef;
}

function flattenSpec(spec) {
  const ops = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
      const op = pathItem[method];
      if (!op) continue;
      const scopes = op.security?.[0]?.oauth2 ?? [];
      const isPrivate = op['x-mill-visibility-private'] === true;
      const capabilities = (op['x-mill-vendor-tags'] || [])
        .filter(t => t.startsWith('capability:'))
        .map(t => t.slice('capability:'.length));
      const parameters = (op.parameters || []).map(p => ({
        ...p,
        isPrivate: p['x-mill-visibility-private'] === true,
      }));
      ops.push({
        method,
        path,
        operationId: op.operationId || `${method}_${path}`,
        summary: op.summary || '',
        description: op.description || '',
        tags: op.tags || [],
        parameters,
        requestBody: op.requestBody || null,
        responses: op.responses || {},
        scopes,
        isPrivate,
        capabilities,
      });
    }
  }
  return ops;
}

function groupByTag(ops) {
  const groups = {};
  for (const op of ops) {
    const tag = op.tags[0] || 'Other';
    const backslash = tag.indexOf('\\');
    const cat = backslash > -1 ? tag.slice(0, backslash) : tag;
    const sub = backslash > -1 ? tag.slice(backslash + 1) : '';
    if (!groups[cat]) groups[cat] = {};
    if (!groups[cat][sub]) groups[cat][sub] = [];
    groups[cat][sub].push(op);
  }
  return groups;
}

function visibleOps() {
  const q = state.searchQuery.toLowerCase().trim();
  let filtered = q ? state.ops.filter(op =>
    op.path.toLowerCase().includes(q) ||
    op.summary.toLowerCase().includes(q) ||
    prettifyId(op.operationId).toLowerCase().includes(q) ||
    op.tags.some(t => t.toLowerCase().includes(q))
  ) : state.ops;
  if (state.hidePrivate) filtered = filtered.filter(op => !op.isPrivate);
  return filtered;
}

function prettifyId(id) {
  return id.replace(/_alt\d+$/, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// ── Sidebar rendering ─────────────────────────────────────────────────────────

function renderSidebar(groups, activeOp) {
  dom.nav.innerHTML = '';
  const cats = Object.keys(groups).sort();
  for (const cat of cats) {
    const subs = groups[cat];
    const allOps = Object.values(subs).flat();
    if (allOps.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'collapsible';

    const toggle = document.createElement('button');
    toggle.className = 'collapsible__toggle api-nav__group-toggle';
    toggle.innerHTML = `
      <svg class="collapsible__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m9 18 6-6-6-6"/>
      </svg>
      <span>${escHtml(cat)}</span>
      <span class="api-nav__count">${allOps.length}</span>
    `;
    toggle.addEventListener('click', () => group.classList.toggle('collapsible--open'));

    const body = document.createElement('div');
    body.className = 'collapsible__body';
    const inner = document.createElement('div');
    inner.className = 'collapsible__content';

    const subKeys = Object.keys(subs).sort((a, b) => {
      if (a === 'Essentials') return -1;
      if (b === 'Essentials') return 1;
      return a.localeCompare(b);
    });
    for (const sub of subKeys) {
      if (sub) {
        const label = document.createElement('div');
        label.className = 'api-nav__subtag';
        label.textContent = sub;
        inner.appendChild(label);
      }
      for (const op of subs[sub]) {
        const row = document.createElement('div');
        const isActive = activeOp && activeOp.operationId === op.operationId;
        row.className = 'api-nav__row' + (isActive ? ' is-active' : '');
        row.dataset.opId = op.operationId;
        row.innerHTML = `
          <span class="method-badge method-badge--${op.method}">${op.method.toUpperCase()}</span>
          <span class="api-nav__name">${escHtml(prettifyId(op.operationId))}</span>
          ${op.isPrivate ? '<span class="api-nav__priv-dot" title="Private endpoint"></span>' : ''}
        `;
        row.addEventListener('click', () => selectEndpoint(op));
        inner.appendChild(row);
      }
    }

    body.appendChild(inner);
    group.appendChild(toggle);
    group.appendChild(body);

    if (activeOp && allOps.some(o => o.operationId === activeOp.operationId)) {
      group.classList.add('collapsible--open');
    }

    dom.nav.appendChild(group);
  }
}

// ── Minimal Markdown renderer (for param descriptions) ───────────────────────
// Handles: `code`, **bold**, [text](url), \n\n paragraphs, \n * bullets

function renderDesc(raw) {
  if (!raw) return '';

  // Process inline tokens character-by-character to avoid regex order issues
  function inline(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '`') {
        const end = text.indexOf('`', i + 1);
        if (end !== -1) { out += `<code>${escHtml(text.slice(i + 1, end))}</code>`; i = end + 1; continue; }
      }
      if (ch === '*' && text[i + 1] === '*') {
        const end = text.indexOf('**', i + 2);
        if (end !== -1) { out += `<strong>${escHtml(text.slice(i + 2, end))}</strong>`; i = end + 2; continue; }
      }
      if (ch === '[') {
        const cb = text.indexOf(']', i + 1);
        if (cb !== -1 && text[cb + 1] === '(') {
          const cp = text.indexOf(')', cb + 2);
          if (cp !== -1) {
            const linkText = text.slice(i + 1, cb);
            const url = text.slice(cb + 2, cp);
            if (/^https?:\/\//.test(url)) {
              out += `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(linkText)}</a>`;
            } else {
              out += escHtml(text.slice(i, cp + 1));
            }
            i = cp + 1; continue;
          }
        }
      }
      out += escHtml(ch); i++;
    }
    return out;
  }

  const parts = [];
  for (const block of raw.split(/\n\n+/)) {
    if (!block.trim()) continue;
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.some(l => /^ *\* /.test(l))) {
      let html = '';
      let inList = false;
      for (const line of lines) {
        if (/^ *\* /.test(line)) {
          if (!inList) { html += '<ul class="param-md-list">'; inList = true; }
          html += `<li>${inline(line.replace(/^ *\* /, ''))}</li>`;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          html += inline(line);
        }
      }
      if (inList) html += '</ul>';
      parts.push(html);
    } else {
      parts.push(inline(lines.join(' ')));
    }
  }
  return parts.join('<br>');
}

// ── Documentation panel rendering ─────────────────────────────────────────────

function buildPathHtml(path) {
  return escHtml(path).replace(/\{([^}]+)\}/g, '<span class="url-block__param">{$1}</span>');
}

function buildParamTable(params, spec, path) {
  if (params.length === 0) return '';
  const rows = params.map(p => {
    const schema = resolveRef(p.schema, spec) || {};
    const typeStr = schema.type || (schema.$ref ? schema.$ref.split('/').pop() : '—');
    const enumVals = schema.enum
      ? `<div class="param-enum">Values: ${schema.enum.map(v => `<code>${escHtml(String(v))}</code>`).join(' ')}</div>`
      : '';
    const privBadge = p.isPrivate ? ' <span class="priv-tag">PRIVATE</span>' : '';
    const reqDot = p.required ? '<span class="req-dot" title="Required"></span>' : '';
    return `<tr>
      <td><div class="param-name">${reqDot}<span>${escHtml(p.name)}</span>${privBadge}</div></td>
      <td><span class="param-type">${escHtml(typeStr)}</span></td>
      <td class="param-desc">${renderDesc(p.description || '')}${enumVals}</td>
    </tr>`;
  }).join('');
  return `<table class="param-table">
    <thead><tr><th style="width:160px">Parameter</th><th style="width:90px">Type</th><th>Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildBodyTable(requestBody, spec) {
  if (!requestBody) return '';
  const content = requestBody.content || {};
  const contentType = Object.keys(content)[0] || 'application/json';
  const schema = resolveRef(content[contentType]?.schema, spec) || {};
  const props = schema.properties || {};
  const required = schema.required || [];

  if (Object.keys(props).length === 0) return `<div class="content-type-label">${escHtml(contentType)}</div>`;

  const rows = Object.entries(props).map(([name, rawSchema]) => {
    const propSchema = resolveRef(rawSchema, spec) || {};
    const typeStr = propSchema.type || (propSchema.$ref ? propSchema.$ref.split('/').pop() : '—');
    const enumVals = propSchema.enum
      ? `<div class="param-enum">Values: ${propSchema.enum.map(v => `<code>${escHtml(String(v))}</code>`).join(' ')}</div>`
      : '';
    const reqDot = required.includes(name) ? '<span class="req-dot" title="Required"></span>' : '';
    return `<tr>
      <td><div class="param-name">${reqDot}<span>${escHtml(name)}</span></div></td>
      <td><span class="param-type">${escHtml(typeStr)}</span></td>
      <td class="param-desc">${renderDesc(propSchema.description || '')}${enumVals}</td>
    </tr>`;
  }).join('');

  return `<div class="content-type-label">${escHtml(contentType)}</div>
  <table class="param-table">
    <thead><tr><th style="width:160px">Parameter</th><th style="width:90px">Type</th><th>Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildResponseSection(responses, spec) {
  const statusRows = Object.entries(responses).map(([code, resp]) => {
    const cls = code.startsWith('2') ? 's-2xx' : code.startsWith('5') ? 's-5xx' : 's-4xx';
    return `<tr>
      <td><span class="status-badge ${cls}">${escHtml(code)}</span></td>
      <td class="param-desc">${escHtml(resp.description || '')}</td>
    </tr>`;
  }).join('');

  let exampleHtml = '';
  for (const [code, resp] of Object.entries(responses)) {
    if (!code.startsWith('2')) continue;
    const content = resp.content || {};
    const ct = Object.keys(content)[0];
    if (!ct) break;
    const schema = resolveRef(content[ct]?.schema, spec);
    if (!schema) break;
    const example = content[ct]?.example || schema.example || buildExampleFromSchema(schema, spec, 0);
    if (example) {
      exampleHtml = `<pre class="ex-json">${escHtml(JSON.stringify(example, null, 2))}</pre>`;
    }
    break;
  }

  return `
    <div class="resp-section">
      <div class="resp-tabs" role="tablist">
        <button class="resp-tab is-active" onclick="switchRespTab(this,'resp-status')">Status codes</button>
        ${exampleHtml ? '<button class="resp-tab" onclick="switchRespTab(this,\'resp-example\')">Example response</button>' : ''}
      </div>
      <div id="resp-status" class="resp-pane is-active">
        <table class="param-table">
          <thead><tr><th style="width:72px">Status</th><th>Description</th></tr></thead>
          <tbody>${statusRows}</tbody>
        </table>
      </div>
      ${exampleHtml ? `<div id="resp-example" class="resp-pane">${exampleHtml}</div>` : ''}
    </div>`;
}

function buildExampleFromSchema(schema, spec, depth) {
  if (depth > 2) return null;
  const resolved = resolveRef(schema, spec) || {};
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.type === 'object' && resolved.properties) {
    const obj = {};
    for (const [k, v] of Object.entries(resolved.properties).slice(0, 6)) {
      const child = resolveRef(v, spec) || {};
      obj[k] = child.example !== undefined ? child.example :
                child.type === 'string' ? '' :
                child.type === 'number' || child.type === 'integer' ? 0 :
                child.type === 'boolean' ? false :
                child.type === 'array' ? [] : null;
    }
    return obj;
  }
  if (resolved.type === 'array') return [];
  return null;
}

function selectEndpoint(op) {
  state.activeOp = op;

  document.querySelectorAll('.api-nav__row').forEach(r => {
    r.classList.toggle('is-active', r.dataset.opId === op.operationId);
  });

  const [cat, sub] = (op.tags[0] || 'Other').split('\\');
  const breadcrumb = [cat, sub, prettifyId(op.operationId)].filter(Boolean)
    .map((s, i, arr) => i < arr.length - 1
      ? `<span>${escHtml(s)}</span><span class="api-breadcrumb__sep">›</span>`
      : `<span>${escHtml(s)}</span>`)
    .join('');

  const privBanner = op.isPrivate ? `
    <div class="api-priv-banner">
      <span class="priv-tag">PRIVATE</span>
      <span>Not available to external API applications. Visible here because your account has staff access.</span>
    </div>` : '';

  const capBanner = op.capabilities.length > 0 ? `
    <div class="cap-banner">
      <svg class="cap-banner__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div>
        <div class="cap-banner__label">Required capability</div>
        <div class="scope-tags">${op.capabilities.map(c => `<span class="cap-badge cap-badge--internal">${escHtml(c)}</span>`).join('')}</div>
        <div class="cap-banner__note">This endpoint requires a capability assigned to your API app by Vimeo Support.</div>
      </div>
    </div>` : '';

  const scopeSection = op.scopes.length > 0 ? `
    <div class="scope-banner">
      <svg class="scope-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <div class="scope-banner__label">Required scope${op.scopes.length > 1 ? 's' : ''}</div>
        <div class="scope-tags">${op.scopes.map(s => `<span class="scope-badge">${escHtml(s)}</span>`).join('')}</div>
        <div class="scope-banner__note">Your access token must include ${op.scopes.length > 1 ? 'these scopes' : 'this scope'}.</div>
      </div>
    </div>` : '';

  const pathParams = op.parameters.filter(p => p.in === 'path');
  const queryParams = op.parameters.filter(p => p.in === 'query');
  const hasBody = !!op.requestBody;

  dom.doc.innerHTML = `
    <nav class="api-breadcrumb">${breadcrumb}</nav>

    <div class="api-ep-header">
      <div>
        <h1 class="api-ep-title">${escHtml(prettifyId(op.operationId))}</h1>
        <p class="api-ep-summary">${escHtml(op.summary)}</p>
      </div>
      ${window.VIMEO_CONNECTED
        ? `<a href="/vimeo-api-playground?op=${encodeURIComponent(op.operationId)}" class="btn btn--primary api-try-btn">
             Try it out
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
               <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
             </svg>
           </a>`
        : `<a href="/auth/vimeo/start?returnTo=${encodeURIComponent('/vimeo-api-playground?op=' + op.operationId)}" class="btn btn--secondary api-try-btn" title="Connect your Vimeo account to use the Playground">
             Connect to try it out
           </a>`
      }
    </div>

    <hr class="api-divider">

    <div class="url-block">
      <span class="method-badge method-badge--${op.method} url-block__method">${op.method.toUpperCase()}</span>
      <span class="url-block__base">https://api.vimeo.com</span>
      <span class="url-block__path">${buildPathHtml(op.path)}</span>
    </div>

    ${privBanner}
    ${capBanner}
    ${scopeSection}

    ${pathParams.length > 0 ? `<h3 class="api-section-heading">Path parameters</h3>${buildParamTable(pathParams, state.spec, op.path)}` : ''}
    ${queryParams.length > 0 ? `<h3 class="api-section-heading">Query parameters</h3>${buildParamTable(queryParams, state.spec, op.path)}` : ''}
    ${hasBody ? `<h3 class="api-section-heading">Body parameters</h3>${buildBodyTable(op.requestBody, state.spec)}` : ''}

    <hr class="api-divider">
    <h3 class="api-section-heading">Responses</h3>
    ${buildResponseSection(op.responses, state.spec)}
  `;

  dom.empty.classList.add('hidden');
  dom.doc.classList.remove('hidden');
  dom.doc.scrollTop = 0;
  dom.doc.parentElement.scrollTop = 0;
}

// ── Tab switching (for response section) ─────────────────────────────────────

window.switchRespTab = function(btn, paneId) {
  const section = btn.closest('.resp-section');
  section.querySelectorAll('.resp-tab').forEach(t => t.classList.remove('is-active'));
  section.querySelectorAll('.resp-pane').forEach(p => p.classList.remove('is-active'));
  btn.classList.add('is-active');
  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('is-active');
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'error') {
  dom.toast.textContent = msg;
  dom.toast.className = `toast toast--${type} toast--visible`;
  setTimeout(() => dom.toast.classList.remove('toast--visible'), 4000);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const specRes = await fetch('/api/vimeo-reference/spec');
    if (!specRes.ok) throw new Error(`Spec fetch failed: ${specRes.status}`);
    state.spec = await specRes.json();
    state.ops = flattenSpec(state.spec);
    renderSidebar(groupByTag(visibleOps()), null);
  } catch (e) {
    showToast('Failed to load API spec. Check the server logs.', 'error');
    console.error(e);
  }

  dom.search.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderSidebar(groupByTag(visibleOps()), state.activeOp);
  });

  dom.hidePrivateToggle.addEventListener('change', e => {
    state.hidePrivate = e.target.checked;
    // If the active op is now hidden, clear the doc panel
    if (state.hidePrivate && state.activeOp?.isPrivate) {
      state.activeOp = null;
      dom.doc.classList.add('hidden');
      dom.doc.innerHTML = '';
      dom.empty.classList.remove('hidden');
    }
    renderSidebar(groupByTag(visibleOps()), state.activeOp);
  });

  // Support deep-linking: /vimeo-api-reference?op=<operationId>
  const params = new URLSearchParams(window.location.search);
  const opId = params.get('op');
  if (opId) {
    const op = state.ops.find(o => o.operationId === opId);
    if (op) selectEndpoint(op);
  }
}

init();
