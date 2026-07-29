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

// Accept a SCORM ZIP, extract it, and return the launch path + course title.
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

    const titleMatch = manifestXml.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Sample Course";

    // Extract mastery score so the client can seed cmi.student_data.mastery_score.
    // Without this, quiz-based courses default to requiring 100% correct to "pass".
    const masteryMatch =
      manifestXml.match(/<adlcp:masteryscore>\s*([^<]+?)\s*<\/adlcp:masteryscore>/i) ||
      manifestXml.match(/adlcp:masteryscore=["']\s*([^"']+?)\s*["']/i);
    const masteryScore = masteryMatch ? masteryMatch[1].trim() : null;

    res.json({ launchPath, title, masteryScore });
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
