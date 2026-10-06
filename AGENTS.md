# Text to Learn development

Work from this directory. Node 24, npm workspaces, React/Vite/Tailwind client, Express/Mongoose server, shared Zod contracts. Preserve the supplied specification and user changes. Stop at the user-selected week; currently Week 4, authorized only after the completed Week 3 handoff.

## Commands

- `npm ci` installs the lockfile. `npm run dev` builds/watches shared contracts and starts the client/API; configure both `.env` files first.
- `npm run dev -w @text-to-learn/client` previews the public authored sample without credentials after the shared package is built.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`, `npm run format:check` are required checks. Browser setup: `npx playwright install chromium`.
- `npm run check:providers` writes a safe access report; exit 2 means blocked, exit 1 means failed.
- Tests require subprocess/network access for their first isolated MongoDB/browser binary downloads. Cache locations should be writable; do not disable TLS verification to bypass a certificate problem.

## Boundaries

- Only server configuration may hold MongoDB, Gemini, YouTube or other private credentials. Never print their values or put secrets in VITE_ variables.
- The production entrypoint uses real Auth0 RS256 token validation. Test login fixtures are confined to `tests/` and a separate Vite test configuration. Never alias them in the production client or enable a runtime auth bypass.
- Derive ownership from verified `sub`, check the parent course before child access, and return 404 for another owner's records. Validate inputs and serialized responses using shared contracts.
- Course creation/deletion require MongoDB transactions. Use a replica set; no partial ready courses or orphaned child records. No database deletion outside the isolated test harness.
- Lesson text is rendered as React text, never arbitrary HTML or executable code. The sample is authored, clearly labelled, and separate from future AI generation.
- Do not publish, push, or change account resources without session authorization. This directory initially inherited an unrelated parent Git repository; scope Git operations carefully and never stage unrelated parent files.

## Mandatory weekly review and handoff

Before each new week or interrupted-week resume: read README, PROJECT_SPEC, ROADMAP, ARCHITECTURE, API_CONTRACT, PROJECT_STATUS, earlier preflights/handoffs/evidence, and actual preceding-week source. Inspect Git/manifests/configuration names/diffs, rerun appropriate baseline checks, trace UI → API → validation/auth → persistence → UI, reconcile docs with code, fix prerequisite regressions, and write `docs/weeks/week-N/preflight.md`. Give the user the concise review before implementation.

Before stopping, update PROJECT_STATUS, architecture/contracts and the current week's handoff/verification with concrete files, commands actually executed, PASS/FAIL/BLOCKED/NOT RUN evidence, external blockers and the next action. Engineering completion and live verification must be separate. No invented deployments, credentials, metrics, or completed phases.
