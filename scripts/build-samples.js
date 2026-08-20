// Writes public/scorm-examples/samples.json, the list the drop zone reads to
// build its sample buttons.
//
// It is a static file rather than an API call so the browser can fetch it
// straight off the CDN on Netlify, where the function bundle cannot see the
// sample directory. Run by `npm start`, `npm run dev`, and the Netlify build;
// drop a .zip into public/scorm-examples/ and it appears on the next run.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'scorm-examples');
const OUT = path.join(DIR, 'samples.json');

const samples = fs.readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith('.zip'))
  .sort()
  .map((f) => ({
    name: f.replace(/\.zip$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    file: f,
  }));

fs.writeFileSync(OUT, `${JSON.stringify(samples, null, 2)}\n`);
console.log(`[build-samples] ${samples.length} sample(s) -> ${path.relative(process.cwd(), OUT)}`);
