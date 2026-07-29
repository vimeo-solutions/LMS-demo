// example-static-tool/script.js
const input     = document.getElementById('input');
const output    = document.getElementById('output');
const formatBtn = document.getElementById('formatBtn');
const clearBtn  = document.getElementById('clearBtn');

formatBtn.addEventListener('click', () => {
  const raw = input.value.trim();
  if (!raw) { output.textContent = ''; return; }
  try {
    const parsed = JSON.parse(raw);
    output.textContent = JSON.stringify(parsed, null, 2);
    output.style.color = 'var(--accent)';
  } catch (e) {
    output.textContent = 'Invalid JSON: ' + e.message;
    output.style.color = '#f85149';
  }
});

clearBtn.addEventListener('click', () => {
  input.value = '';
  output.textContent = '';
});
