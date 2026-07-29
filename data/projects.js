// ─────────────────────────────────────────────────────────────────────────────
// THIS IS THE MAIN FILE TO EDIT when adding or updating a project.
//
// Each object in the array below becomes:
//   • A card on the matching category index page (/demos, /testing, etc.)
//   • A detail page at /projects/<slug>
//   • An entry in the JSON API at /api/projects
//
// You do not need to touch any other file just to add a project.
// ─────────────────────────────────────────────────────────────────────────────
//
// Field reference:
//   title       — Display name shown on cards and detail pages
//   slug        — URL-safe ID, no spaces (becomes /projects/<slug>)
//   category    — Must be one of: "Demos" | "API Docs" | "Testing"
//   status      — Must be one of: "Live" | "In Progress" | "Planned" | "Archived"
//   description — One or two sentences shown on the card
//   tags        — Short labels, e.g. ["Node", "API", "Vimeo"]
//   externalUrl — Optional: link to a live demo. Leave "" if none.
//   repoUrl     — Optional: GitHub link. Leave "" if none.
//   featured    — true = shown in the Featured section on the home page
//   visibility  — "Internal" | "Customer" | "Public"
//   updatedAt   — Date in YYYY-MM-DD format
//   notes       — Optional longer text shown on the detail page


const projects = [
  {
    title: "Vimeo API Reference",
    slug: "vimeo-api-reference",
    category: "API Docs",
    status: "Live",
    description:
      "Browse and search all 380 Vimeo API endpoints organized by category, with full parameter tables, required scopes, and example responses.",
    tags: ["API", "Developer", "Documentation"],
    externalUrl: "/vimeo-api-reference",
    repoUrl: "",
    featured: true,
    visibility: "Internal",
    updatedAt: "2026-05-06",
    notes:
      "Procedurally generated from the cached Vimeo OpenAPI spec (data/vimeo-spec.json). To refresh it when Vimeo releases API updates, drop a new spec file into data/ (see CLAUDE.md — the in-app refresh-spec endpoint is disabled until OAuth-based spec fetching is implemented). Private endpoint annotations can be added to data/vimeo-private-endpoints.json after reviewing Vimeo's internal documentation.",
  },
  {
    title: "Vimeo API Playground",
    slug: "vimeo-api-playground",
    category: "API Docs",
    status: "Live",
    description:
      "A sandbox for sending authenticated Vimeo API requests and inspecting responses in real time.",
    tags: ["API", "Developer"],
    externalUrl: "/vimeo-api-playground",
    repoUrl: "",
    featured: true,
    visibility: "Internal",
    updatedAt: "2026-05-06",
    notes:
      "Select any endpoint from the sidebar, fill in path/query/body parameters, and send a real request. Auth is handled server-side — the Vimeo token never reaches the browser. Links to the API Reference for documentation on each endpoint.",
  },
  {
    title: "SmartCard CMS Embed", // displayed on the card and detail page
    slug: "smart-card", // used in /projects/my-new-tool URL
    category: "Demos", // Demos | API Docs | Testing
    status: "Live", // Live | In Progress | Planned | Archived
    description:
      "Demonstrating dynamic player embed plus CMS/DAM functionality using the Vimeo API.", // short text shown on the card
    tags: ["Player", "Metadata", "Videos", "API"], // short labels shown on the card
    externalUrl: "/smart-card", // optional: link to a live version
    repoUrl: "", // optional: GitHub link
    featured: true,
    visibility: "Customer", // Internal | Customer | Public
    updatedAt: "2026-05-01",
    notes:
      "Enter a Vimeo video link (really, any Vimeo video URL that has an ID in it), and we display an embedded player preview and fetch metadata to display alongside the player.  To simulate a custom integration with CMS or DAM type tools, an interface is also provided for viewing and updating video metadata, with the ability to sync changes back to Vimeo via standard API endpoints. <br><br> Future updates will include support for providing your own access token to test with different Vimeo accounts.  I also need to add support for standalone video IDs and links with a custom alias (i.e., no vimeo ID in the URL).",
  },

  {
    title: "LMS Integration Demo",
    slug: "lms-demo",
    category: "Demos",
    status: "Live",
    description:
      "Simulate a corporate LMS experience powered by a Vimeo SCORM export. Upload a SCORM package, watch an interactive video with quiz questions, and see the live gradebook update in real time.",
    tags: ["SCORM", "LMS", "Interactive", "E-Learning"],
    externalUrl: "/lms-demo",
    repoUrl: "",
    featured: true,
    visibility: "Customer",
    updatedAt: "2026-06-04",
    notes:
      "Demonstrates Vimeo's SCORM export capability in a simulated LMS shell (fictional company: Meridian Learning). Upload any Vimeo-generated SCORM 1.2 ZIP to load a course. The page acts as the LMS runtime — exposes the SCORM API, captures quiz scores and completion data, and displays them in a live gradebook. Requires Enterprise plan + New Interactive tool to export SCORM from Vimeo.",
  },

  {
    title: "The Power of Vimeo Embeds",
    slug: "vimeo-embeds",
    category: "Demos",
    status: "Live",
    description:
      "Explore the SEO and AEO value of Vimeo embeds. Load any video via the Player SDK and see the structured metadata and live player events that help search engines and AI answer engines understand your content.",
    tags: ["Vimeo", "SEO", "Schema", "Player SDK"],
    externalUrl: "/vimeo-embeds",
    repoUrl: "",
    featured: true,
    visibility: "Internal",
    updatedAt: "2026-06-01",
    notes:
      "Demonstrates how embedding a Vimeo video generates rich VideoObject JSON-LD schema and Open Graph metadata that search engines and generative answer engines can index. Also shows live Player SDK events as they fire during playback.",
  },

];

// Maps each category to its index page URL.
// Used by the breadcrumb on detail pages — no need to edit this.
const categoryUrls = {
  "Demos": "/demos",
  "API Docs": "/api-docs",
  "Testing": "/testing",
};

// Auto-derive href and categoryUrl so templates don't have to construct them.
projects.forEach((p) => {
  p.href = `/projects/${p.slug}`;
  p.categoryUrl = categoryUrls[p.category] || "/";
});

module.exports = projects;
