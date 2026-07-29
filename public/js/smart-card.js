// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  videoId: null,
  videoLanguage: null,
  tags: [],
  thumbFile: null,
  transcriptLoaded: false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const urlError = document.getElementById('urlError');
const loadBtn = document.getElementById('loadBtn');

const videoSection = document.getElementById('videoSection');
const embedIframe = document.getElementById('embedIframe');
const cardSubtitle = document.getElementById('cardSubtitle');
const cardDescription = document.getElementById('cardDescription');
const descExpandBtn = document.getElementById('descExpandBtn');
const cardLink = document.getElementById('cardLink');

//const cardTitleInput      = document.getElementById('cardTitleInput');
const videoTitleInput = document.getElementById('videoTitleInput');
const videoDescriptionInput = document.getElementById('videoDescriptionInput');
const saveMetadataBtn = document.getElementById('saveMetadataBtn');

const videoTagsInput = document.getElementById('videoTagsInput');
const addTagBtn = document.getElementById('addTagBtn');
const tagsContainer = document.getElementById('tagsContainer');

const thumbnailPreview = document.getElementById('thumbnailPreview');
const thumbnailFileInput = document.getElementById('thumbnailFileInput');
const selectThumbBtn = document.getElementById('selectThumbBtn');
const uploadThumbBtn = document.getElementById('uploadThumbBtn');
const thumbFilename = document.getElementById('thumbFilename');

const toastContainer = document.getElementById('toastContainer');

const transcriptPanel = document.getElementById('transcriptPanel');
const transcriptToggle = document.getElementById('transcriptToggle');
const transcriptBody = document.getElementById('transcriptBody');
const transcriptContent = document.getElementById('transcriptContent');

// ── URL parsing ───────────────────────────────────────────────────────────────
function extractVimeoId(url) {
  const p1 = /(?<=\/videos?\/)\d+(?=\/|\?|$)/;
  const p2 = /(?<=vimeo\.com\/)\d+(?=\/|\?|$)/;
  const match = p1.exec(url) || p2.exec(url);
  return match ? match[0] : null;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  return fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
  loadBtn.textContent = loading ? 'Loading...' : 'Load Video';
}

// ── Live preview sync (left panel updates as you type) ─────────────────────
// cardTitleInput.addEventListener('input', () => {
//   cardSubtitle.textContent = cardTitleInput.value;
// });

videoDescriptionInput.addEventListener('input', () => {
  cardDescription.textContent = videoDescriptionInput.value;
  autoResizeTextarea(videoDescriptionInput);
  updateDescExpand();
});

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── Description expand/collapse ───────────────────────────────────────────────
function updateDescExpand() {
  cardDescription.classList.add('panel__desc--clamped');
  descExpandBtn.textContent = 'Click to Expand »';
  const overflows = cardDescription.scrollHeight > cardDescription.clientHeight + 2;
  descExpandBtn.classList.toggle('hidden', !overflows);
}

descExpandBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const isExpanded = !cardDescription.classList.contains('panel__desc--clamped');
  cardDescription.classList.toggle('panel__desc--clamped', isExpanded);
  descExpandBtn.textContent = isExpanded ? 'Click to Expand »' : 'Show Less «';
});

// ── URL form submit ───────────────────────────────────────────────────────────
urlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  urlError.classList.add('hidden');

  const videoId = extractVimeoId(urlInput.value.trim());
  if (!videoId) {
    urlError.textContent = 'Could not find a Vimeo video ID in that URL. Try a URL like https://vimeo.com/123456789.';
    urlError.classList.remove('hidden');
    return;
  }

  state.videoId = videoId;
  setLoading(true);

  try {
    const res = await api('GET', `/api/smart-card/video/${videoId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Vimeo API returned ${res.status}`);
    }
    const data = await res.json();
    populateFields(data);
    videoSection.classList.remove('hidden');
    videoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(`Failed to load video: ${err.message}`, 'error', 6000);
  } finally {
    setLoading(false);
  }
});

// ── Populate all fields from Vimeo API response ───────────────────────────────
function extractEmbedSrc(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const iframe = doc.querySelector('iframe');
  return iframe ? iframe.getAttribute('src') : '';
}

function populateFields(data) {
  const title = data.name || '';
  const desc = data.description || '';
  const tags = (data.tags || []).map(t => t.name);
  const src = extractEmbedSrc(data.embed?.html);
  const thumb = data.pictures?.base_link || '';
  const link = data.link || '';

  state.videoLanguage = data.language || null;

  // Form fields
  //cardTitleInput.value = title;
  videoTitleInput.value = title;
  videoDescriptionInput.value = desc;
  autoResizeTextarea(videoDescriptionInput);

  // Card preview
  cardSubtitle.textContent = title;
  cardDescription.textContent = desc;
  updateDescExpand();
  cardLink.href = link;
  embedIframe.src = src;

  // Thumbnail
  if (thumb) {
    thumbnailPreview.src = thumb;
    thumbnailPreview.classList.remove('hidden');
  }

  // Tags
  state.tags = tags;
  renderTags();

  // Reset transcript state
  state.transcriptLoaded = false;
  transcriptPanel.classList.remove('collapsible--open');
  transcriptToggle.setAttribute('aria-expanded', 'false');
  transcriptContent.textContent = 'Loading transcript...';
  transcriptContent.classList.remove('collapsible__content--muted');

  // Reset thumbnail upload state
  state.thumbFile = null;
  thumbnailFileInput.value = '';
  uploadThumbBtn.disabled = true;
  thumbFilename.classList.add('hidden');
}

// ── Tags ──────────────────────────────────────────────────────────────────────
function renderTags() {
  tagsContainer.innerHTML = '';
  state.tags.forEach(tag => tagsContainer.appendChild(createTagChip(tag)));
}

function createTagChip(tag) {
  const chip = document.createElement('span');
  chip.className = 'chip';

  const label = document.createElement('span');
  label.textContent = tag;

  const btn = document.createElement('button');
  btn.className = 'chip__remove';
  btn.type = 'button';
  btn.setAttribute('aria-label', `Remove tag ${tag}`);
  btn.textContent = '×';
  btn.dataset.tag = tag;

  chip.appendChild(label);
  chip.appendChild(btn);
  return chip;
}

addTagBtn.addEventListener('click', addTag);
videoTagsInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addTag(); }
});

async function addTag() {
  const tag = videoTagsInput.value.trim();
  if (!tag || !state.videoId) return;

  if (state.tags.includes(tag)) {
    showToast(`Tag "${tag}" already exists`, 'warning');
    return;
  }

  addTagBtn.disabled = true;
  try {
    const res = await api('PUT', `/api/smart-card/video/${state.videoId}/tags/${encodeURIComponent(tag)}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    state.tags = [...state.tags, tag];
    renderTags();
    videoTagsInput.value = '';
    showToast(`Tag "${tag}" added`, 'success');
  } catch (err) {
    showToast(`Failed to add tag: ${err.message}`, 'error');
  } finally {
    addTagBtn.disabled = false;
    videoTagsInput.focus();
  }
}

tagsContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('.chip__remove');
  if (!btn || !state.videoId) return;

  const tag = btn.dataset.tag;
  btn.disabled = true;

  try {
    const res = await api('DELETE', `/api/smart-card/video/${state.videoId}/tags/${encodeURIComponent(tag)}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    state.tags = state.tags.filter(t => t !== tag);
    renderTags();
    showToast(`Tag "${tag}" removed`, 'success');
  } catch (err) {
    showToast(`Failed to remove tag: ${err.message}`, 'error');
    btn.disabled = false;
  }
});

// ── Save metadata ─────────────────────────────────────────────────────────────
saveMetadataBtn.addEventListener('click', async () => {
  if (!state.videoId) return;

  saveMetadataBtn.disabled = true;
  saveMetadataBtn.textContent = 'Saving...';

  try {
    const res = await api('PATCH', `/api/smart-card/video/${state.videoId}`, {
      name: videoTitleInput.value.trim(),
      description: videoDescriptionInput.value.trim(),
    });
    if (!res.ok) throw new Error(`Vimeo API returned ${res.status}`);
    showToast('Metadata saved', 'success');
  } catch (err) {
    showToast(`Failed to save: ${err.message}`, 'error');
  } finally {
    saveMetadataBtn.disabled = false;
    saveMetadataBtn.textContent = 'Save Changes';
  }
});

// ── Thumbnail upload ──────────────────────────────────────────────────────────
selectThumbBtn.addEventListener('click', () => thumbnailFileInput.click());

thumbnailFileInput.addEventListener('change', () => {
  const file = thumbnailFileInput.files[0];
  if (!file) return;

  state.thumbFile = file;
  uploadThumbBtn.disabled = false;
  thumbFilename.textContent = file.name;
  thumbFilename.classList.remove('hidden');

  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = e => {
    thumbnailPreview.src = e.target.result;
    thumbnailPreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

// ── Transcript ────────────────────────────────────────────────────────────────
transcriptToggle.addEventListener('click', handleTranscriptToggle);
transcriptToggle.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTranscriptToggle(); }
});

function handleTranscriptToggle() {
  const isOpen = transcriptPanel.classList.toggle('collapsible--open');
  transcriptToggle.setAttribute('aria-expanded', String(isOpen));

  if (isOpen && !state.transcriptLoaded && state.videoId) {
    state.transcriptLoaded = true; // prevent duplicate fetches
    loadTranscript(state.videoId, state.videoLanguage);
  }
}

async function loadTranscript(videoId, language) {
  try {
    // Step 1: Get transcript status
    const statusRes = await fetch(`/api/smart-card/video/${videoId}/transcribe`);

    if (statusRes.status === 404) {
      return setTranscriptText('No transcript available.', true);
    }
    if (statusRes.status === 403 || !statusRes.ok) {
      return setTranscriptText('Failed to retrieve transcript.', true);
    }

    const statusData = await statusRes.json();

    // Normalize to array (Vimeo may return a single object or a data array)
    const entries = Array.isArray(statusData) ? statusData
      : Array.isArray(statusData.data) ? statusData.data
        : [statusData];

    const completed = entries.filter(t => t.status === 'completed');

    if (completed.length === 0) {
      return setTranscriptText('Transcription in progress.', true);
    }

    // Prefer language match, fall back to first completed
    const chosen = completed.find(t => language && t.language === language) || completed[0];
    const texttrackId = chosen.texttrack_id;

    if (!texttrackId) {
      return setTranscriptText('Failed to retrieve transcript.', true);
    }

    // Step 2: Get transcript segments
    const segRes = await fetch(`/api/smart-card/video/${videoId}/transcript/${texttrackId}`);
    if (!segRes.ok) {
      return setTranscriptText('Failed to retrieve transcript.', true);
    }

    const segData = await segRes.json();
    const segments = Array.isArray(segData) ? segData
      : Array.isArray(segData.data) ? segData.data
        : [];

    if (segments.length === 0) {
      return setTranscriptText('No transcript content found.', true);
    }

    setTranscriptText(formatTranscript(segments), false);

  } catch (err) {
    setTranscriptText('Failed to retrieve transcript.', true);
  }
}

function setTranscriptText(text, muted) {
  transcriptContent.textContent = text;
  transcriptContent.classList.toggle('collapsible__content--muted', muted);
}

function formatTranscript(segments) {
  const PAUSE_THRESHOLD_MS = 1500;
  const SENTENCES_PER_PARA = 3;
  const NON_SPEECH = /^\[.*\]$/;

  const paragraphs = [];
  let current = [];
  let sentenceCount = 0;
  let currentSpeaker = undefined;

  function flush() {
    if (current.length > 0) {
      paragraphs.push(current.join(' '));
      current = [];
      sentenceCount = 0;
    }
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = (seg.lines || []).map(l => (l.text || '').trim()).filter(Boolean).join(' ');
    if (!text) continue;

    // Non-speech descriptors get their own paragraph
    if (NON_SPEECH.test(text)) {
      flush();
      paragraphs.push(text);
      currentSpeaker = undefined;
      continue;
    }

    // Speaker change (only when speaker is identified) → new paragraph
    const speaker = seg.speaker ?? null;
    if (speaker !== null && speaker !== currentSpeaker) {
      flush();
    }
    currentSpeaker = speaker;

    current.push(text);

    // Count sentence-ending punctuation
    sentenceCount += (text.match(/[.!?]+(?:\s|$)/g) || []).length;

    const next = segments[i + 1];
    const pause = next ? (next.cue_start - seg.cue_end) : 0;

    if (pause >= PAUSE_THRESHOLD_MS || sentenceCount >= SENTENCES_PER_PARA) {
      flush();
    }
  }

  flush();
  return paragraphs.join('\n\n');
}

// ── Thumbnail upload ──────────────────────────────────────────────────────────
uploadThumbBtn.addEventListener('click', async () => {
  if (!state.thumbFile || !state.videoId) return;

  uploadThumbBtn.disabled = true;
  uploadThumbBtn.textContent = 'Uploading...';

  try {
    // Step 1: Create a picture resource on Vimeo → get the upload link + picture URI
    const createRes = await api('POST', `/api/smart-card/video/${state.videoId}/pictures`);
    if (!createRes.ok) throw new Error('Could not create picture resource');
    const picData = await createRes.json();

    const uploadLink = picData.link;
    const picId = picData.uri.split('/').pop();

    if (!uploadLink || !picId) throw new Error('Unexpected response from Vimeo pictures API');

    // Step 2: PUT the image binary directly to Vimeo's pre-signed upload URL
    const uploadRes = await fetch(uploadLink, {
      method: 'PUT',
      body: state.thumbFile,
      headers: { 'Content-Type': state.thumbFile.type },
    });
    if (!uploadRes.ok) throw new Error('Image upload failed');

    // Step 3: Activate the new thumbnail
    const activateRes = await api('PATCH', `/api/smart-card/video/${state.videoId}/pictures/${picId}`, { active: true });
    if (!activateRes.ok) throw new Error('Could not activate thumbnail');

    showToast('Thumbnail updated', 'success');
    state.thumbFile = null;
    thumbnailFileInput.value = '';
    thumbFilename.classList.add('hidden');
    // Keep the local preview — the Vimeo CDN URL takes time to propagate
  } catch (err) {
    showToast(`Thumbnail upload failed: ${err.message}`, 'error', 6000);
    uploadThumbBtn.disabled = false;
  } finally {
    uploadThumbBtn.textContent = 'Upload Thumbnail';
  }
});
