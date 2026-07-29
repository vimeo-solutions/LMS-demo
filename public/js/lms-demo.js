// ── SCORM 1.2 Runtime ────────────────────────────────────────────────────────
// Exposes window.API so the SCORM iframe content can call LMSSetValue() etc.
// Because we serve the SCORM content from our own domain, the iframe can access
// window.parent.API directly — no cross-origin postMessage needed.
// Learner identity values that the SCORM package (specifically Vimeo's RxD
// runtime) reads on launch via LMSGetValue('cmi.core.student_id').
// Without these, RxD halts with "empty learner id" before the video loads.
const LEARNER = {
  'cmi.core.student_id':   'aldous.chuxley.001',
  'cmi.core.student_name': 'Chuxley, Aldous',
};

// Set to true in the browser console to log every SCORM API call:
//   window.SCORM_DEBUG = true
window.SCORM_DEBUG = false;

window.API = {
  _data: { ...LEARNER },

  LMSInitialize() {
    this._data = { ...LEARNER, ...courseData, 'cmi.core.lesson_status': 'incomplete' };
    if (window.SCORM_DEBUG) console.log('[SCORM] LMSInitialize | data seeded:', { ...this._data });
    updateGradebook();
    return 'true';
  },

  LMSFinish() {
    if (window.SCORM_DEBUG) console.log('[SCORM] LMSFinish | final data:', { ...this._data });
    updateGradebook();
    return 'true';
  },

  LMSGetValue(el) {
    const val = this._data[el] !== undefined ? String(this._data[el]) : '';
    if (window.SCORM_DEBUG) console.log(`[SCORM] GET ${el} →`, JSON.stringify(val));
    return val;
  },

  LMSSetValue(el, val) {
    this._data[el] = val;
    if (window.SCORM_DEBUG) console.log(`[SCORM] SET ${el} =`, JSON.stringify(val));
    document.dispatchEvent(new CustomEvent('scorm:set', { detail: { el, val } }));
    return 'true';
  },

  LMSCommit() {
    if (window.SCORM_DEBUG) console.log('[SCORM] LMSCommit');
    return 'true';
  },
  LMSGetLastError() { return '0'; },
  LMSGetErrorString() { return ''; },
  LMSGetDiagnostic() { return ''; },
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentLaunchPath = null;
let courseData = {}; // LMS-seeded config (mastery_score etc.) — survives LMSInitialize resets

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone       = document.getElementById('lms-drop-zone');
const dropOverlay    = document.getElementById('lms-drop-overlay');
const iframe         = document.getElementById('lms-iframe');
const fileInputTop   = document.getElementById('lms-file-input');
const fileInputCenter = document.getElementById('lms-file-input-center');
const courseTitle    = document.getElementById('lms-course-title');
const noCourseEl     = document.getElementById('lms-no-course');
const courseItemEl   = document.getElementById('lms-course-item');
const courseItemTitle = document.getElementById('lms-course-item-title');
const courseItemStatus = document.getElementById('lms-course-item-status');
const statusChip     = document.getElementById('lms-status-chip');
const scoreEl        = document.getElementById('lms-score');
const resultEl       = document.getElementById('lms-result');
const timeEl         = document.getElementById('lms-time');
const noInteractions = document.getElementById('lms-no-interactions');
const interactionsTable = document.getElementById('lms-interactions-table');
const interactionsBody  = document.getElementById('lms-interactions-body');
const retakeArea     = document.getElementById('lms-retake-area');
const retakeBtn      = document.getElementById('lms-retake-btn');
const clearBtn       = document.getElementById('lms-clear-btn');
const toast          = document.getElementById('toast');

// ── Upload & course loading ───────────────────────────────────────────────────
fileInputTop.addEventListener('change', () => handleFileSelect(fileInputTop.files[0]));
fileInputCenter.addEventListener('change', () => handleFileSelect(fileInputCenter.files[0]));
retakeBtn.addEventListener('click', retakeCourse);
clearBtn.addEventListener('click', clearEntry);

// Drag-and-drop on the center drop zone
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('hidden');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropOverlay.classList.add('hidden');
  }
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('hidden');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

// Also accept drops anywhere on the page when a course is already loaded
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

function handleFileSelect(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showToast('Please select a .zip SCORM package.', 'error');
    return;
  }
  uploadScorm(file);
}

async function uploadScorm(file) {
  courseTitle.textContent = 'Loading…';
  showToast('Uploading SCORM package…', 'info');

  const formData = new FormData();
  formData.append('scorm', file);

  try {
    const res = await fetch('/api/lms-demo/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Upload failed.');

    loadCourse(data.launchPath, data.title, data.masteryScore);
    showToast(`"${data.title}" loaded successfully.`, 'success');
  } catch (err) {
    courseTitle.textContent = 'No course loaded';
    showToast(err.message, 'error');
  }

  // Reset file inputs so the same file can be re-selected
  fileInputTop.value = '';
  fileInputCenter.value = '';
}

function loadCourse(launchPath, title, masteryScore) {
  currentLaunchPath = launchPath;

  // Update topbar and sidebar
  courseTitle.textContent = title;
  courseItemTitle.textContent = title;
  courseItemStatus.textContent = 'Not Started';
  noCourseEl.classList.add('hidden');
  courseItemEl.classList.remove('hidden');

  // Build course-level config so it survives LMSInitialize() resets.
  courseData = {};
  if (masteryScore != null) {
    courseData['cmi.student_data.mastery_score'] = String(masteryScore);
  }
  window.API._data = { ...LEARNER, ...courseData };
  updateGradebook();

  // Show iframe, hide drop zone
  dropZone.classList.add('hidden');
  iframe.classList.remove('hidden');
  iframe.src = `/api/lms-demo/content/${launchPath}`;
}

function retakeCourse() {
  if (!currentLaunchPath) return;
  window.API._data = { ...LEARNER, ...courseData };
  updateGradebook();
  updateInteractions();
  iframe.src = `/api/lms-demo/content/${currentLaunchPath}`;
  showToast('Course restarted — good luck!', 'info');
}

// Reset the page to its just-loaded state so a new package can be demoed
// without a browser refresh. Points the iframe at about:blank first to stop
// video playback before hiding it.
function clearEntry() {
  currentLaunchPath = null;
  courseData = {};
  window.API._data = { ...LEARNER };

  iframe.src = 'about:blank';
  iframe.classList.add('hidden');
  dropZone.classList.remove('hidden');

  courseTitle.textContent = 'No course loaded';
  courseItemTitle.textContent = '—';
  courseItemEl.classList.add('hidden');
  noCourseEl.classList.remove('hidden');

  updateGradebook();
  updateInteractions();

  // Allow the same file to be picked again after clearing
  fileInputTop.value = '';
  fileInputCenter.value = '';

  showToast('Cleared — load another SCORM package to start over.', 'info');
}

// ── SCORM data → Gradebook ────────────────────────────────────────────────────
document.addEventListener('scorm:set', () => {
  updateGradebook();
  updateInteractions();
});

function updateGradebook() {
  const data = window.API._data;

  // Status
  const rawStatus = (data['cmi.core.lesson_status'] || 'not attempted').toLowerCase();
  const { label, cssClass } = statusInfo(rawStatus);
  statusChip.textContent = label;
  statusChip.className = `lms-status-chip lms-status-chip--${cssClass}`;
  if (courseItemStatus) courseItemStatus.textContent = label;

  // Score
  const raw = data['cmi.core.score.raw'];
  const max = data['cmi.core.score.max'] || '100';
  scoreEl.textContent = raw !== undefined ? `${raw} / ${max}` : '—';

  // Result (pass/fail derived from lesson_status)
  if (rawStatus === 'passed') {
    resultEl.innerHTML = '<span style="color:var(--color-live)">✓ Passed</span>';
  } else if (rawStatus === 'failed') {
    resultEl.innerHTML = '<span style="color:var(--color-archived)">✗ Failed</span>';
  } else {
    resultEl.textContent = '—';
  }

  // Session time (SCORM format: HH:MM:SS.SS)
  const sessionTime = data['cmi.core.session_time'];
  timeEl.textContent = sessionTime ? formatScormTime(sessionTime) : '—';

  // Show retake button only on failure
  retakeArea.classList.toggle('hidden', rawStatus !== 'failed');
}

function updateInteractions() {
  const data = window.API._data;
  const indices = new Set();

  for (const key of Object.keys(data)) {
    const m = key.match(/^cmi\.interactions\.(\d+)\./);
    if (m) indices.add(Number(m[1]));
  }

  if (indices.size === 0) {
    noInteractions.classList.remove('hidden');
    interactionsTable.classList.add('hidden');
    return;
  }

  noInteractions.classList.add('hidden');
  interactionsTable.classList.remove('hidden');
  interactionsBody.innerHTML = '';

  for (const i of [...indices].sort((a, b) => a - b)) {
    const id       = data[`cmi.interactions.${i}.id`] || `Q${i + 1}`;
    const response = data[`cmi.interactions.${i}.student_response`] || '—';
    const result   = (data[`cmi.interactions.${i}.result`] || 'unknown').toLowerCase();

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(id)}</td>
      <td>${escapeHtml(response)}</td>
      <td>${resultCell(result)}</td>
    `;
    interactionsBody.appendChild(tr);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusInfo(status) {
  switch (status) {
    case 'passed':     return { label: 'Passed',       cssClass: 'success' };
    case 'failed':     return { label: 'Failed',       cssClass: 'error' };
    case 'completed':  return { label: 'Completed',    cssClass: 'success' };
    case 'incomplete': return { label: 'In Progress',  cssClass: 'progress' };
    case 'browsed':    return { label: 'Browsed',      cssClass: 'neutral' };
    default:           return { label: 'Not Started',  cssClass: 'neutral' };
  }
}

function resultCell(result) {
  if (result === 'correct')   return '<span style="color:var(--color-live)">✓ Correct</span>';
  if (result === 'incorrect') return '<span style="color:var(--color-archived)">✗ Incorrect</span>';
  return `<span style="color:var(--color-text-muted)">${escapeHtml(result)}</span>`;
}

// Parse SCORM HH:MM:SS.SS duration into a human-readable string
function formatScormTime(t) {
  const parts = String(t).split(':');
  if (parts.length < 3) return t;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = Math.floor(parseFloat(parts[2]));
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Sample courses ────────────────────────────────────────────────────────────
async function loadSamples() {
  try {
    const res = await fetch('/api/lms-demo/samples');
    const samples = await res.json();
    if (!samples.length) return;

    const container = document.getElementById('lms-samples');
    if (!container) return;

    container.innerHTML = `
      <div class="lms-samples__divider">— or load a sample —</div>
      <div class="lms-samples__list">
        ${samples.map(s => `<button class="btn btn--sm lms-samples__btn" data-file="${escapeHtml(s.file)}">${escapeHtml(s.name)}</button>`).join('')}
      </div>
    `;

    container.querySelectorAll('.lms-samples__btn').forEach(btn => {
      btn.addEventListener('click', () => loadSampleCourse(btn.dataset.file));
    });
  } catch {
    // samples are optional — silently skip if unavailable
  }
}

async function loadSampleCourse(filename) {
  showToast(`Loading "${filename.replace(/\.zip$/i, '')}"…`, 'info');
  try {
    const res = await fetch(`/scorm-examples/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error('Sample file not found.');
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'application/zip' });
    uploadScorm(file);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

loadSamples();

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 4000);
}
