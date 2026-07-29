---
name: project-onboarding
description: Assists with creating or adding new projects/pages/demos to the current Project Hub website, including setting up project structure, templates, routes, and documentation. Includes references to CSS guidelines, design mockups, and more examples to ensure consistency.  Use when creating a new project page or demo, adding a new tool to an existing project, or making changes that could impact the user interface or introduce new design elements.
---

When adding a new project or tool in the Project Hub, use this skill to set the context regarding templates, reusable CSS components, design patterns, and code standards that should be followed to ensure consistency across the project. Unless the task is purely design-focused, this skill should be used in conjunction with the `code-standards` skill, which provides more detailed guidance on code quality and maintainability.

## Maintain Consistent Look and Feel

When needed, refer to design references to maintain consistent colors, layouts, components, proportions, and typography across the project. This includes adhering to any established design systems or style guides that the project follows. When adding new features or components, if there is any question of design language (and the uncertainty justifies loading additional data into the context window), see the following resources for guidance:

- [Original Design Mockup](assets/design_mock_02.png)
- [Original CSS Color Scheme](references/chatgpt-color-scheme.css)
- [Example Project Landing Page](assets/project-landing-page.png) (header and footer are templates used for every page of the site)
- [Project Page Example 1](assets/project-example-1.png)
- [Project Page Example 2](assets/project-example-2.png)

## Basic Project Structure & Templates

The home page and navigation header provide links to all project pages, which are organized by category or purpose. You can find references to the overall file structure, data schemas, and naming conventions in the site's CLAUDE.md file. The EJS templating system and BEM hierarchy are discussed there, and should be used for all new pages and components to ensure consistency and maintainability. When adding a new project or tool, use the existing templates and components as much as possible, and refer to the CLAUDE.md and README.md files for step-by-step instructions on how to add new routes, pages, and project entries.

When adding a new project or tool page, add the appropriate entry to to the projects.js file.
