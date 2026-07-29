// Utility functions available in every EJS template via app.locals (set in server.js).

// Converts a YYYY-MM-DD string to a readable date like "May 1, 2026".
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Returns the CSS class for a status pill based on the project's status string.
// Add new statuses here if you introduce them in projects.js.
function statusClass(status) {
  const map = {
    'Live':        'pill--live',
    'In Progress': 'pill--progress',
    'Planned':     'pill--planned',
    'Archived':    'pill--archived',
  };
  return map[status] || 'pill--default';
}

module.exports = { formatDate, statusClass };
