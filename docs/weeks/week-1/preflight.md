# Week 1 preflight — 5 October 2026

## Baseline

- The project directory contains only `text_to_learn_codex_master_prompt.md`; the pasted request selects Week 1.
- No applicable AGENTS.md, README, package manifests, lockfile, source, tests, deployment files, roadmap PDF, or earlier handoffs exist.
- Git currently resolves to the parent `C:/Everything/Algozenith` repository: unborn `main`, no commits, and this directory is untracked. `git status --short --branch -- .`, `git log -3 --oneline`, and `git diff --stat -- .` were executed. The log command fails because no commits exist. Unrelated parent files will be preserved; no parent history/staging changes are planned.
- Node v24.16.0 and npm 11.13.0 are installed. No local mongod is on PATH; Docker is installed but its daemon is unavailable.
- There is no existing UI/API/data journey to trace or reuse. Baseline install, lint, typecheck, build, tests and smoke journey: **NOT RUN** (no application exists).
- Environment presence checks found no Auth0, MongoDB, Gemini or YouTube configuration. Secret values were not printed.
- Initial npm metadata requests: **BLOCKED** by the environment's offline/cache mode. Package access will be retried with an explicit workspace-local cache.

## External dependencies

Live Auth0 login requires a tenant, SPA client, API audience, and callback/origin/logout configuration. Durable app data requires a MongoDB replica set (Atlas or local replica set), so multi-document course creation/deletion can be atomic. Gemini text/TTS and YouTube checks require backend keys and selected model identifiers. Hosted smoke checks require Vercel/Render projects and deployment access. These block live checks, not independent implementation or isolated local tests.

## Plan

1. Scaffold npm workspaces (`client`, `server`, `packages/contracts`), strict TypeScript, ESLint/Prettier, reproducible scripts and lockfile.
2. Define validated course/lesson/progress contracts, Mongoose records, and a clearly labelled authored sample with stable IDs. Persist course/child records transactionally and scope all reads/writes to verified Auth0 `sub`.
3. Implement actual Auth0 SDK routes and RS256 JWT verification, MongoDB startup/readiness, validated saved-course APIs and safe errors.
4. Build the responsive library, course overview, lesson renderer and navigation with accessible loading/empty/error states. Offer a clearly labelled read-only public sample; protected persistence always requires Auth0.
5. Verify API ownership, token validation and MongoDB persistence with isolated local fixtures; browser-test desktop/mobile navigation and failure states where tools permit.
6. Add GitHub Actions, Vercel/Render setup, provider smoke scripts, project memory and Week 1 evidence. Stop before AI generation and Week 3 enhancements.

## Documentation reviewed

Official Auth0 React and Express API guides, Vite requirements, Tailwind's Vite integration, Mongoose transactions, Google Gemini text/TTS guides, and YouTube search reference were consulted. URLs are recorded in `docs/ARCHITECTURE.md` and provider setup documentation when authored.

## Resolved implementation prerequisites

Registry access succeeded with authorized network access and Node's system certificate trust (`--use-system-ca`), keeping TLS verification enabled. The original specification was preserved. A standalone local Git repository was initialized inside this project after the baseline inspection, without modifying the unrelated parent repository, adding a remote, staging files or creating commits. Supported ESLint 10 replaced an initially selected unsupported ESLint 9. Test bootstrap permits a longer first-time MongoDB binary download; production database deadlines stay bounded.
