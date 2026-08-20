const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const CONTENT_DIR  = path.join('/tmp', 'lms-demo-content');
const SAMPLES_DIR  = path.join(__dirname, '../public/scorm-examples');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(req, file, cb) {
    cb(null, file.mimetype === 'application/zip' || file.originalname.endsWith('.zip'));
  },
});

// Find the SCO launch file inside an imsmanifest.xml string.
// Tries the adlcp:scormType="sco" attribute first; falls back to the first
// resource href that looks like an HTML file.
function findLaunchPath(xml) {
  const scoAttr =
    xml.match(/adlcp:scormType=["']sco["'][^>]*\shref=["']([^"'#?]+)["']/i) ||
    xml.match(/\shref=["']([^"'#?]+)["'][^>]*adlcp:scormType=["']sco["']/i);
  if (scoAttr) return scoAttr[1];

  const anyHref = xml.match(/<resource[^>]+\shref=["']([^"'#?]*\.html?)["']/i);
  return anyHref ? anyHref[1] : null;
}

// Vimeo's "Export for LMS" settings live as query params on the contentUrl inside
// the Rustici cross-domain config, not in imsmanifest.xml:
//   contentUrl: "https://vimeo.com/lms/content/.../?scoring_algorithm=percentage
//                &completion_threshold=15&passing_score=80&skipping_forward=false"
function findConfigJs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findConfigJs(full);
      if (hit) return hit;
    } else if (entry.name === 'configuration.js') {
      return full;
    }
  }
  return null;
}

// The three "Scoring method" options Vimeo's export dialog offers. Unrecognised
// values fall through to the sentence-case fallback in scoringLabel().
const SCORING_LABELS = {
  quiz: 'Quiz score',
  percentage: 'Percentage watched',
  passfail: 'Pass/fail',
};

function scoringLabel(algorithm) {
  if (!algorithm) return null;

  const key = algorithm.toLowerCase();
  if (SCORING_LABELS[key]) return SCORING_LABELS[key];

  // Sentence case, matching Vimeo's own labels ("Quiz score", not "Quiz Score").
  const words = key.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function readExportSettings(contentDir) {
  try {
    const configPath = findConfigJs(contentDir);
    if (!configPath) return {};

    const urlMatch = fs.readFileSync(configPath, 'utf-8').match(/contentUrl:\s*["']([^"']+)["']/);
    if (!urlMatch) return {};

    const params = new URL(urlMatch[1]).searchParams;
    return {
      scoringMethod: scoringLabel(params.get('scoring_algorithm')),
      passingScore: params.get('passing_score'),
    };
  } catch {
    return {}; // Not a Vimeo export, or an unreadable config — omit the extras.
  }
}

// Accept a SCORM ZIP, extract it, and return the launch path plus the export
// settings the gradebook needs.
router.post('/upload', upload.single('scorm'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please select a .zip file.' });
  }

  try {
    // Clear previous content and re-extract
    fs.rmSync(CONTENT_DIR, { recursive: true, force: true });
    fs.mkdirSync(CONTENT_DIR, { recursive: true });

    const zip = new AdmZip(req.file.buffer);
    zip.extractAllTo(CONTENT_DIR, true);

    const manifestPath = path.join(CONTENT_DIR, 'imsmanifest.xml');
    if (!fs.existsSync(manifestPath)) {
      return res.status(400).json({ error: 'No imsmanifest.xml found. This does not appear to be a valid SCORM package.' });
    }

    const manifestXml = fs.readFileSync(manifestPath, 'utf-8');
    const launchPath = findLaunchPath(manifestXml);

    if (!launchPath) {
      return res.status(400).json({ error: 'Could not locate the SCO launch file in the manifest. Try re-exporting from Vimeo.' });
    }

    // Mastery score, which the client seeds into cmi.student_data.mastery_score.
    // SCORM 1.2 content only reports passed/failed when it has a mastery score to
    // compare against; with none it settles for "completed". The manifest is the
    // standard location, but Vimeo puts its passing_score in the export config
    // instead, so that serves as the fallback.
    const masteryMatch =
      manifestXml.match(/<adlcp:masteryscore>\s*([^<]+?)\s*<\/adlcp:masteryscore>/i) ||
      manifestXml.match(/adlcp:masteryscore=["']\s*([^"']+?)\s*["']/i);

    const { scoringMethod = null, passingScore = null } = readExportSettings(CONTENT_DIR);
    const masteryScore = masteryMatch ? masteryMatch[1].trim() : passingScore;

    // No course title — the UI labels every package with a fixed name.
    res.json({ launchPath, masteryScore, scoringMethod });
  } catch (err) {
    console.error('[lms-demo] upload error:', err);
    res.status(500).json({ error: 'Failed to process the SCORM package.' });
  }
});

// List available sample SCORM packages from public/scorm-examples/.
router.get('/samples', (req, res) => {
  try {
    const files = fs.readdirSync(SAMPLES_DIR)
      .filter(f => f.toLowerCase().endsWith('.zip'))
      .map(f => ({
        name: f.replace(/\.zip$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        file: f,
      }));
    res.json(files);
  } catch {
    res.json([]);
  }
});

// Serve extracted SCORM content files (same-origin, so window.parent.API works directly).
router.use('/content', express.static(CONTENT_DIR));

module.exports = router;
