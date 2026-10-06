# Week 1 handoff — 5 October 2026

Week 1 engineering and available local verification are complete. **14 unit/API tests and 6 desktop/mobile browser journeys pass**, along with formatting, lint, typecheck and production build. Actual Auth0/provider/hosted acceptance remains externally blocked; consult `verification.md` and PROJECT_STATUS. No Week 2 work was started.

## Delivered behavior

- npm workspaces, Node 24/strict TypeScript, supported ESLint, Prettier, lockfile and build/dev commands.
- Public labelled authored sample (3 modules/9 lessons), safe renderer, practice quiz, curated MDN links, responsive library/overview/lesson navigation and stable UUID routes.
- Actual Auth0 login/logout with API audience and in-memory SDK access tokens; protected library/course routes; backend RS256 JWT middleware and parent ownership checks.
- MongoDB User/Course/Module/Lesson/Progress models and indexes; strict saved-sample create/list/get/delete APIs; atomic creation/deletion and bounded per-user library.
- Startup validation and replica-set checks, health/readiness, request bounds/CORS/rate limiting, safe errors/request IDs.
- GitHub CI and Vercel/Render configuration, local Docker replica-set setup, backend provider-access probes and durable project docs.

## Review and preservation

Preflight found only the supplied specification, no application or earlier phase. No prior code was available to reuse. The original specification is preserved. A local standalone Git repository was initialized in this project to prevent unrelated parent files from entering project operations. No remote/history/staging changes or commits were made.

## Important files

- `packages/contracts/src/index.ts` and `sample.ts`: strict shapes and authored catalogue.
- `server/src/auth.ts`, `app.ts`, `config.ts`, `index.ts`: security/runtime boundaries.
- `server/src/models.ts`, `services/courses.ts`, `routes/courses.ts`: owned persistence, transaction cleanup and serialization.
- `client/src/auth.tsx`, `api.ts`, `App.tsx`, `pages/`, `components/`: Auth0 integration, typed requests and user screens.
- `tests/fixtures/harness.ts`, `api.test.ts`, `e2e/learning.spec.ts`, `tests/vite.config.ts`: isolated real MongoDB/JWKS and explicit browser login fixtures. Never import these into production.
- `.github/workflows/ci.yml`, `vercel.json`, `render.yaml`, `compose.yaml` and `.env.example` files: reviewable environment/delivery setup.

## Run and verify

Follow README for private `.env` setup, Auth0 settings and a MongoDB replica set. `npm ci`; `docker compose up -d --wait` if using local Docker; `npm run dev`. Client: 5173, API: 3001. For a public-only sample, build contracts and run just the client workspace.

Checks: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`, `npm run format:check`. First-run test dependencies download MongoDB and Chromium. See verification for actual results and environment-specific commands.

The normal client was also inspected without the Auth0 test alias at 1440×1000 and 390×844, including public sample navigation, protected routes, deep-link refresh, overflow and runtime errors. Screenshots of the welcome, library, overview and lessons were inspected. The local read-only preview is running at `http://127.0.0.1:5173` for this session. It is not a hosted deployment. Tests shut down their isolated databases/services.

## External blockers and phase boundary

Actual Auth0 tenant flow, user-owned configured application database, provider access and hosted smoke are externally blocked by missing configuration/access. The provider checker records missing names without values. Exact setup actions are in README. No live keys, deployed URL or audio playback evidence exists.

**Stop at Week 1.** Week 2 starts only when requested, with a fresh review of this source, preceding checks and handoff. Reuse shared types, safe renderer, token/ownership checks, UUID routing and transactional persistence. Add a real Gemini generation adapter and persisted job model with atomic leases, bounded retries/stale recovery before exposing topic generation. Recovery can replay an upstream call; do not promise exactly-once execution. Extend authored sample semantics carefully; do not label AI output as authored or publish invalid/partial content. Week 3 owns completion writes, media and export.
