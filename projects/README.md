# /projects

This directory holds self-contained static project files.

Each subdirectory here can be its own standalone HTML/CSS/JS tool or demo.
They are served under `/projects-static/` by Express:

  http://localhost:3000/projects-static/example-static-tool/

## How to add a project

1. Create a subdirectory here:  `/projects/my-tool/`
2. Add `index.html`, `style.css`, `script.js` as needed.
3. Optionally add an entry in `/data/projects.js` and set `externalUrl`
   to point visitors to `/projects-static/my-tool/`.

## Notes

- Do not commit API keys, customer data, or secrets here.
- Files here are publicly accessible — treat them accordingly.
