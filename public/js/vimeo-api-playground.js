/* Vimeo API Playground — request builder and live response panel */

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

// ── Spec helpers (keep in sync with vimeo-api-reference.js) ──────────────────

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

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

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

// ── Request builder ───────────────────────────────────────────────────────────

function buildBodySkeleton(requestBody, spec) {
  if (!requestBody) return null;
  const content = requestBody.content || {};
  const contentType = Object.keys(content)[0] || 'application/json';
  const schema = resolveRef(content[contentType]?.schema, spec) || {};
  const props = schema.properties || {};
  const skeleton = {};
  for (const [name, rawSchema] of Object.entries(props)) {
    const propSchema = resolveRef(rawSchema, spec) || {};
    skeleton[name] = propSchema.example !== undefined ? propSchema.example :
                     propSchema.type === 'string' ? '' :
                     propSchema.type === 'boolean' ? false :
                     propSchema.type === 'number' || propSchema.type === 'integer' ? 0 :
                     propSchema.type === 'array' ? [] :
                     propSchema.type === 'object' ? {} : null;
  }
  return { contentType, skeleton };
}

function selectEndpoint(op) {
  state.activeOp = op;

  document.querySelectorAll(".api-nav__row").forEach((r) => {
    r.classList.toggle("is-active", r.dataset.opId === op.operationId);
  });

  const pathParams = op.parameters.filter((p) => p.in === "path");
  const queryParams = op.parameters.filter((p) => p.in === "query");
  const bodyInfo = buildBodySkeleton(op.requestBody, state.spec);
  const hasBody = !!bodyInfo;

  const privBanner = op.isPrivate
    ? `
    <div class="api-priv-banner">
      <span class="priv-tag">PRIVATE</span>
      <span>Not available to external API applications. Visible here because your account has staff access.</span>
    </div>`
    : "";

  const capBanner =
    op.capabilities.length > 0
      ? `
    <div class="cap-banner">
      <svg class="cap-banner__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div>
        <div class="cap-banner__label">Required capability</div>
        <div class="scope-tags">${op.capabilities.map((c) => `<span class="cap-badge cap-badge--internal">${escHtml(c)}</span>`).join("")}</div>
        <div class="cap-banner__note">This endpoint requires a capability assigned to your API app by Vimeo Support.</div>
      </div>
    </div>`
      : "";

  const scopeHtml =
    op.scopes.length > 0
      ? `<div class="scope-tags" style="margin-bottom:1rem">${op.scopes.map((s) => `<span class="scope-badge">${escHtml(s)}</span>`).join("")}</div>`
      : "";

  const pathParamFields = pathParams
    .map(
      (p) => `
    <div class="form-group">
      <label class="form-group__label" for="pp-${escHtml(p.name)}">{${escHtml(p.name)}} <span class="form-group__optional">path · required</span></label>
      <input class="form-group__input" id="pp-${escHtml(p.name)}" data-param="${escHtml(p.name)}" data-param-in="path" placeholder="${escHtml(p.description || p.name)}" />
    </div>`,
    )
    .join("");

  const queryParamFields = queryParams
    .map((p) => {
      const schema = resolveRef(p.schema, state.spec) || {};
      const privNote = p.isPrivate
        ? ' <span class="form-group__optional" style="color:#f85149">private</span>'
        : "";
      if (schema.enum) {
        const opts = ["", ...schema.enum]
          .map(
            (v) =>
              `<option value="${escHtml(String(v))}">${escHtml(String(v)) || "(none)"}</option>`,
          )
          .join("");
        return `<div class="form-group">
        <label class="form-group__label" for="qp-${escHtml(p.name)}">${escHtml(p.name)}${p.required ? "" : ' <span class="form-group__optional">optional</span>'}${privNote}</label>
        <select class="form-group__input" id="qp-${escHtml(p.name)}" data-param="${escHtml(p.name)}" data-param-in="query">${opts}</select>
      </div>`;
      }
      return `<div class="form-group">
      <label class="form-group__label" for="qp-${escHtml(p.name)}">${escHtml(p.name)}${p.required ? "" : ' <span class="form-group__optional">optional</span>'}${privNote}</label>
      <input class="form-group__input" id="qp-${escHtml(p.name)}" data-param="${escHtml(p.name)}" data-param-in="query" placeholder="${escHtml(p.description || "")}" />
    </div>`;
    })
    .join("");

  const bodyField = hasBody
    ? `
    <div class="form-group">
      <label class="form-group__label">Request body <span class="form-group__optional">${escHtml(bodyInfo.contentType)}</span></label>
      <textarea class="form-group__textarea" id="pg-body" rows="10" spellcheck="false">${escHtml(JSON.stringify(bodyInfo.skeleton, null, 2))}</textarea>
    </div>`
    : "";

  dom.doc.innerHTML = `
    <h1 class="api-ep-title">${escHtml(prettifyId(op.operationId))}</h1>
    <p class="api-ep-summary">${escHtml(op.summary)}</p>

    ${privBanner}
    ${capBanner}
    ${scopeHtml}

    <div class="url-block" style="margin:1rem 0 1.5rem">
      <span class="method-badge method-badge--${op.method} url-block__method">${op.method.toUpperCase()}</span>
      <span class="url-block__base">https://api.vimeo.com</span>
      <span class="url-block__path" id="pg-resolved-path">${escHtml(op.path)}</span>
    </div>

    <a href="/vimeo-api-reference?op=${encodeURIComponent(op.operationId)}" class="btn btn--ghost" style="font-size:0.8125rem;margin-bottom:1.5rem;display:inline-flex;align-items:center;gap:0.3rem">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      View documentation
    </a>

    ${pathParamFields ? `<h3 class="api-section-heading">Path parameters</h3>${pathParamFields}` : ""}
    ${queryParamFields ? `<h3 class="api-section-heading">Query parameters</h3>${queryParamFields}` : ""}
    ${bodyField ? `<h3 class="api-section-heading">Body</h3>${bodyField}` : ""}

    <button class="btn btn--primary" id="pg-send" style="margin-top:0.5rem">Send request</button>

    <div id="pg-response" hidden style="margin-top:1.5rem">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
        <span id="pg-status-badge" class="status-badge"></span>
        <span id="pg-response-time" class="param-type"></span>
      </div>
      <pre id="pg-response-body" class="ex-json" style="white-space:pre-wrap;word-break:break-all"></pre>
    </div>
  `;

  dom.empty.classList.add("hidden");
  dom.doc.classList.remove("hidden");
  dom.doc.parentElement.scrollTop = 0;

  // Don't allow destructive operations until I can hook up the OAuth bit, so users can play with their own data

  if (["post", "put", "get"].includes(op.method)) {
    document
      .getElementById("pg-send")
      .addEventListener("click", () =>
        sendRequest(op, hasBody ? bodyInfo.contentType : null),
      );
  } else document.getElementById("pg-send").disabled = true;
}

// ── Request execution ─────────────────────────────────────────────────────────

async function sendRequest(op, contentType) {
  const sendBtn = document.getElementById('pg-send');
  const responseEl = document.getElementById('pg-response');
  const statusBadge = document.getElementById('pg-status-badge');
  const responseTime = document.getElementById('pg-response-time');
  const responseBody = document.getElementById('pg-response-body');

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  responseEl.hidden = true;

  let resolvedPath = op.path;
  document.querySelectorAll('[data-param-in="path"]').forEach(input => {
    resolvedPath = resolvedPath.replace(`{${input.dataset.param}}`, encodeURIComponent(input.value));
  });

  const qs = new URLSearchParams();
  document.querySelectorAll('[data-param-in="query"]').forEach(input => {
    if (input.value) qs.set(input.dataset.param, input.value);
  });
  const queryStr = qs.toString() ? `?${qs.toString()}` : '';

  const fetchOpts = { method: op.method.toUpperCase() };
  if (contentType) {
    const bodyEl = document.getElementById('pg-body');
    fetchOpts.headers = { 'Content-Type': contentType };
    fetchOpts.body = bodyEl ? bodyEl.value : '';
  }

  const t0 = performance.now();
  try {
    const r = await fetch(`/api/vimeo${resolvedPath}${queryStr}`, fetchOpts);
    const elapsed = Math.round(performance.now() - t0);
    const text = await r.text();

    const code = r.status;
    const codeCls = code < 300 ? 's-2xx' : code < 500 ? 's-4xx' : 's-5xx';
    statusBadge.className = `status-badge ${codeCls}`;
    statusBadge.textContent = code;
    responseTime.textContent = `${elapsed} ms`;

    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    responseBody.textContent = pretty;
    responseEl.hidden = false;

    const pathDisplay = document.getElementById('pg-resolved-path');
    if (pathDisplay) pathDisplay.textContent = resolvedPath;
  } catch (e) {
    showToast(`Request failed: ${e.message}`, 'error');
    console.error(e);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send request';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'error') {
  dom.toast.textContent = msg;
  dom.toast.className = `toast toast--${type} toast--visible`;
  setTimeout(() => dom.toast.classList.remove('toast--visible'), 4000);
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
    if (state.hidePrivate && state.activeOp?.isPrivate) {
      state.activeOp = null;
      dom.doc.classList.add('hidden');
      dom.doc.innerHTML = '';
      dom.empty.classList.remove('hidden');
    }
    renderSidebar(groupByTag(visibleOps()), state.activeOp);
  });

  // Support incoming link from reference: /vimeo-api-playground?op=<operationId>
  const params = new URLSearchParams(window.location.search);
  const opId = params.get('op');
  if (opId) {
    const op = state.ops.find(o => o.operationId === opId);
    if (op) selectEndpoint(op);
  }
}

init();
