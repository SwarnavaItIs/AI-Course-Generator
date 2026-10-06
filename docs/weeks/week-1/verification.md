# Week 1 verification — 5 October 2026

**Available local checks pass.** Week 1 engineering is complete; actual Auth0/provider/hosted acceptance remains externally blocked. No Week 2 implementation or production deployment is claimed.

## Executed checks

| Check/command                                    | Final status | Evidence                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline previous app checks                     | NOT RUN      | Only the supplied specification existed; no baseline application/manifests/tests. See preflight                                                                                                                     |
| `npm install` + `npm ls --depth=0`               | PASS         | Workspaces installed; lockfile produced; resolved dependency tree valid; npm audit during install reported zero vulnerabilities                                                                                     |
| `npm run typecheck`                              | PASS         | Client, server, contracts and test/tool TypeScript configurations pass                                                                                                                                              |
| `npm run lint`                                   | PASS         | Supported ESLint 10, zero warnings                                                                                                                                                                                  |
| `npm run format:check`                           | PASS         | All matched files conform to Prettier                                                                                                                                                                               |
| `npm run build`                                  | PASS         | Contracts/server/client built; final Vite output completed successfully                                                                                                                                             |
| `npm test`                                       | PASS         | **14 tests, 3 files**: 9 real MongoDB/API tests, 3 contract tests, 2 startup-config tests                                                                                                                           |
| `npm run test:e2e`                               | PASS         | **6 journeys**: 3 each on desktop Chromium and mobile Chromium emulation; all pass                                                                                                                                  |
| `node --import tsx tests/inspect-public.ts`      | PASS         | Normal client using the real Auth0 SDK, no login fixture: 1440×1000 and 390×844 public navigation, lesson refresh, protected-library/unconfigured state, no page errors or horizontal overflow; public-ui.json      |
| Production artifact marker inspection            | PASS         | No test-token endpoint/subject/issuer markers in client/server output; no Gemini/MongoDB/YouTube backend variable-name markers in client output. This is a focused marker check, not a comprehensive security audit |
| Curated sample resource check                    | PASS         | Nine MDN destinations inspected with the web tool; CSS link updated to the official current box-model page after the initial URL failed                                                                             |
| `npm run check:providers`                        | BLOCKED      | Executed and wrote provider-access.json; missing Gemini key/text+TTS model and YouTube key. Checker exits 2 for blocked probes; npm reports failure instead of synthetic success                                    |
| Actual Auth0 tenant login/logout                 | BLOCKED      | No tenant/SPA/domain/API audience or callback/origin setup is configured                                                                                                                                            |
| Configured persistent application MongoDB        | BLOCKED      | No app connection URI; no local mongod; `docker info` failed because Docker Desktop's daemon is unavailable. Isolated MongoDB tests do pass                                                                         |
| `docker compose up -d --wait`                    | NOT RUN      | Configuration prepared and parsed by formatting tooling, but no running Docker daemon                                                                                                                               |
| Vercel/Render hosted smoke                       | BLOCKED      | No account/project connection or deployment access; configurations and precise setup in README                                                                                                                      |
| Remote GitHub Actions                            | NOT RUN      | Workflow prepared; standalone local repo has no remote or pushed commit                                                                                                                                             |
| Live generated courses/media/PDF/progress writes | NOT RUN      | Later-week scope; none are claimed as implemented                                                                                                                                                                   |

## Meaningful API evidence

The suite launches MongoDB 8.0.16 as a real isolated replica set and signs short-lived RSA JWTs against a loopback JWKS fixture. Requests pass through the production `express-oauth2-jwt-bearer` middleware.

- Health/readiness and public labelled catalogue routes work.
- Anonymous, malformed, expired, incorrect issuer/audience, tampered-signature and unsigned/unsupported-algorithm tokens fail with 401.
- Creation produces complete validated 3-module/9-lesson records; stable IDs and content survive disconnect/reconnect. Readiness and personal API fail safely when disconnected.
- User B sees only B's list and receives 404 for A's course, lesson, cross-course lesson ID and deletion. A's children remain intact.
- Invalid titles/templates/UUIDs, client ownership injection, malformed JSON, oversized bodies and unapproved CORS origins are rejected.
- Owned deletion removes course/modules/lessons/progress, leaves another owner's records intact, and adjusts the cap counter.
- Injected creation and cleanup failures roll back all writes. Partial courses are invisible; failed deletion preserves the saved course and children.
- The per-user course cap rejects creation without inserting children.

Contract tests validate all authored content/IDs/parent references and reject invalid ready content, out-of-range quiz answers and arbitrary HTML blocks. Config tests validate required variables, ports/domains/origins and production HTTPS without revealing supplied values.

## Browser and visual evidence

Both Playwright projects exercise sample navigation and direct lesson refresh, MCQ answer explanations, signed-in sample creation/title, saved course and lesson refresh, persisted library listing, cancellation/confirmation of deletion, logout/protected route behavior, and recovery from an explicit API 503. Mobile navigation opens, Escape closes it and returns keyboard focus. The closed mobile workspace navigation is hidden from keyboard focus. The course outline starts collapsed on narrow screens.

The external Auth0 redirect is simulated **only** in the separate test Vite configuration. Real signed tokens, API ownership logic and MongoDB back these browser journeys. This verifies local behavior, not the tenant login flow. Mobile emulation uses Chromium, not a physical iPhone or Safari.

Actual screenshots were inspected for welcome, saved library, course overview and lesson typography/layout. Capture timing was corrected so overview screenshots contain all modules and fixed navigation appears at the top. Representative files:

- [Desktop public welcome](screenshots/desktop-public-welcome.png)
- [Desktop saved library — explicit test learner](screenshots/desktop-library.png)
- [Desktop course overview](screenshots/desktop-public-course.png)
- [Mobile saved library — explicit test learner](screenshots/mobile-library.png)
- [Mobile course overview](screenshots/mobile-public-course.png)
- [Mobile lesson](screenshots/mobile-public-lesson.png)

This is browser/keyboard/visual verification, not a full WCAG certification or screen-reader audit.

## Reproduction notes and resolved initial failures

On this Windows execution environment, Vite/tsx/Chromium and mongod required authorized subprocess access. Node used `NODE_OPTIONS=--use-system-ca` for trusted registry/binary downloads; TLS certificate verification stayed enabled. Chromium was installed with `PLAYWRIGHT_BROWSERS_PATH` pointing to the project's `.cache/playwright`. MongoDB downloads use `.cache/mongodb`. These caches are ignored by Git; regular developer/CI hosts may use their normal browser cache.

Initial failures were corrected: frontend return-token/conditional types, a test model generic, shared test-plugin resolution and compatible Tailwind version. Unsupported ESLint 9 was replaced with supported ESLint 10. The first API suite failed its setup hook during the 755.6 MiB Windows MongoDB download and skipped all API cases; it was never counted as a pass. Increasing the first-run hook budget to 600 seconds allowed the next complete run to execute and pass all 14 tests. The browser suite then passed all 6 journeys.

`git diff --check` exited successfully but no tracked baseline exists, so it is not presented as full added-file whitespace evidence. Prettier verifies the new files. No existing work was overwritten, secrets written, parent Git history changed, remote created, or files staged/committed/pushed. Test databases are temporary and were shut down; no user database was deleted.

## Remaining exact live actions

Privately configure `server/.env` with MONGODB_URI, AUTH0_DOMAIN, AUTH0_AUDIENCE and CLIENT_ORIGINS; configure `client/.env` with VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID and matching VITE_AUTH0_AUDIENCE. Apply the README Auth0 callback/logout/origin lists. Run the actual two-account login/save/refresh/lesson/ownership/deletion smoke. Configure provider keys/model names privately and rerun access probes. Connect GitHub/Vercel/Render only when publishing is authorized, set production origins/API URL, deploy and execute the hosted deep-link and persistence smoke. Record actual URLs and evidence before marking live acceptance complete.
