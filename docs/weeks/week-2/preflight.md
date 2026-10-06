# Week 2 preflight — 5 October 2026

The user explicitly selected Week 2. This review was completed before implementation.

Read README, PROJECT_SPEC, ROADMAP, ARCHITECTURE, API_CONTRACT, PROJECT_STATUS, the original specification, Week 1 preflight/handoff/verification/provider evidence, AGENTS, manifests and configuration examples. Inspected actual shared contracts/sample, server configuration/auth/app/startup/models/routes/course services/provider probes, client API/auth/routes/library/overview/lesson/renderer, and MongoDB/JWKS/browser fixtures and tests.

Traced signed-in sample creation: form → typed authenticated POST → strict request schema → verified JWT sub → transactional user quota/course/modules/lessons/progress write → validated response → stable UUID overview/lesson routes. Reads and deletes check the owned parent; reopening reads persisted content. Public sample and test login fixtures remain separate from production authentication. Existing renderer uses React text and has four explained MCQs, but code highlighting and generated video queries are absent.

Git is a standalone unborn main with untracked project files, no baseline commit and no remote. There is no tracked diff/history to review; preserve all existing files and do not stage or commit. Node 24 and the existing lockfile/dependencies are usable. No real server/client .env files or Auth0/MongoDB/Gemini environment configuration were found (presence checks only). Cached isolated MongoDB and Chromium binaries are available; subprocess checks require sandbox escalation.

Baseline on the unchanged Week 1 implementation: format, lint, typecheck and production build PASS; all 14 unit/API tests PASS; all 6 desktop/mobile browser journeys PASS. Actual Auth0 tenant, persistent application database, live Gemini and hosted checks remain BLOCKED by missing configuration. No prerequisite regression was found.

Implementation decisions: preserve sample POST and public routes; add topic/request UUID submission and durable owned jobs, atomic leases with fenced transactional publication, bounded attempts/deadlines and stale-job recovery. Poll persisted course/lesson states, explicitly retry failed jobs, reuse ready lessons, resolve resource IDs only through the server catalogue, and keep suggestions unresolved. Extend strict contracts to represent pending courses without presenting placeholder modules as ready. Add provider fixtures only through test dependency injection. Week 3 media, progress writes and export remain outside this phase.

Official Gemini structured-output documentation and installed @google/genai declarations were checked: interactions.create accepts text/application-json response_format with schema; application validation is still required. See https://ai.google.dev/gemini-api/docs/structured-output and https://ai.google.dev/gemini-api/docs/interactions-overview. Model selection stays in backend configuration.
