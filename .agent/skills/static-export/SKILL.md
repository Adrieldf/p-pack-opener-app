---
name: Next.js Static Export Specialist
description: Expert guidance on configuring and debugging Next.js static exports for GitHub Pages.
---

# Next.js Static Export Specialist

This skill focuses on the specific deployment requirements for hosting this Next.js app on GitHub Pages.

## Configuration Requirements
- **Output**: Must be set to `export` in `next.config.ts`.
- **Images**: Use standard `<img>` tags or a custom loader for `next/image` since standard optimization isn't available with static export.
- **Base Path**: Ensure `basePath` is correctly set in `next.config.ts` if the site is not hosted at the domain root.

## CI/CD (GitHub Actions)
- Always use the `actions/upload-pages-artifact` and `actions/deploy-pages` actions.
- Ensure the build script runs `npm run build` which triggers the static export.

## Common Fixes
- **White Page/No CSS**: Verify that asset paths in `index.html` account for the `basePath`.
- **404 on Refresh**: Static exports require proper handling of sub-pages (not applicable to this single-page app, but important for future expansion).
