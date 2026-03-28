# Project Guidelines

## Project Overview
- Build application features in `src/`.
- Primary app entry points:
  - `src/pages/index.astro`
  - `src/pages/api/contributions/[username].ts`
- Treat `workshop/` as learning material and `docs/` as workshop site assets. Ignore both for normal app feature work unless the task explicitly asks for them.
- For project context and setup details, use `README.md`.

## Build And Dev
- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build production output: `npm run build`
- Preview production build: `npm run preview`
- There are currently no configured test or lint scripts in `package.json`.

## Astro Best Practices
- Follow Astro file-based routing under `src/pages/`.
- Keep API endpoints in `src/pages/api/**` and type handlers with `APIRoute`.
- Use dynamic route segments with square-bracket naming (example: `[username].ts`).
- Return explicit status codes and JSON content types from API handlers.
- This project uses server output (`output: 'server'`) with the Node standalone adapter in `astro.config.mjs`; do not assume a static-only deployment model.
- Prefer server-rendered Astro pages by default and add client-side JavaScript only when needed.

## Conventions
- Keep changes focused and minimal; avoid unrelated refactors.
- Preserve existing project structure and naming patterns.