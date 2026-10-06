# Week 2 handoff — 5 October 2026

Week 2 engineering is complete after the mandatory Week 1 review. **35 unit/API/provider tests and 12 desktop/mobile browser journeys pass**, as do formatting, lint, typecheck and production build. Week 1 regressions pass. Live Gemini output quality and actual authenticated application smoke remain blocked by missing private configuration; see verification/evaluation/live-evaluation. Stop at Week 2.

## Delivered

Topic submission persists an owned course/job immediately. The worker generates and validates a complete 3–6-module outline with 3–5 lessons/module and metadata/resources for every lesson. First lesson opening generates and persists rich content; subsequent opens reuse its content/hash. The UI distinguishes authored samples and AI content, polls saved status, displays bounded attempt/error/retry information, and provides safe code highlighting, resources, video-query placeholders, explained quizzes and stable previous/next navigation.

Durable job claims have leases/fencing tokens, deadlines, initial automatic retries and a total four-attempt bound after manual retry. Owner/request UUID and target-key indexes prevent duplicate records/work. Stale jobs recover after restart; old results cannot overwrite a replacement. Complete publication and deletion are transactional. Recovery may replay upstream requests; exactly-once provider execution is not promised.

## Files and decisions

- `packages/contracts/src/index.ts`: pending course representation, generation info, strict provider drafts, ready/null content rules, counts/parent/order invariants, video queries and quiz validation. `sample.ts` retains its authored content.
- `server/src/providers/generation.ts`: official Gemini adapter/prompts, safe provider errors, explicit model, resource catalogue/resolution. No generated URL fetches or production fixture fallback.
- `server/src/services/generation.ts`: transactional queue/quota/idempotency, worker leases/recovery/retries and fenced publication. `models.ts` adds GenerationJob, request uniqueness and generation metadata; `services/courses.ts` reads all course states with consistent snapshot detail and deletes jobs.
- `server/src/index.ts`, `app.ts`, `routes/courses.ts`: real production adapter and worker lifecycle, owned create/retry/generate endpoints. Existing JWT middleware remains unchanged.
- `client/src/pages/library.tsx`, `course.tsx`, `components/common.tsx`, `code.tsx`, `styles.css`: topic form, polling/retry/cache flow and renderer. Unknown code languages use plain text. Video queries do not imply active video search.
- `tests/generation.test.ts`, `provider.test.ts`, expanded contracts/API tests and `e2e/generation.spec.ts`: invalid/provider/ownership/persistence/duplicate/cache/timeout/restart/deletion/rollback coverage. `tests/fixtures/generation.ts` is explicitly authored test data. Browser login remains only in the test Vite configuration.
- `server/src/scripts/evaluate-generation.ts`, `tests/evaluate-fixtures.ts`, evaluation docs/reports and screenshots: separate live versus fixture evidence. README, API_CONTRACT, ARCHITECTURE, PROJECT_SPEC, ROADMAP, PROJECT_STATUS and AGENTS reflect Week 2.

## Run and next action

Follow README: Node 24, `npm ci`, private client/server .env configuration, an actual Auth0 SPA/API and MongoDB replica set/Atlas, then `npm run dev`. Set backend GEMINI_API_KEY plus a supported structured-output GEMINI_TEXT_MODEL. The API runs the worker automatically. Missing Gemini configuration returns unavailable rather than saving synthetic output; public/sample behavior remains usable separately.

Checks: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e` (after Chromium setup), `npm run evaluate:fixtures`, `npm run evaluate:live`. See verification for environment-specific commands/results. The isolated test services/databases shut down after tests. No commit, remote, publication or deployment was created; all source is still untracked in the standalone unborn repository.

Next concrete task within Week 2: privately configure Gemini key/model, run live evaluation and review the three outputs for accuracy/progression/resources/quizzes. Configure actual Auth0/MongoDB and verify saved course creation, first lesson generation, refresh/cache, controlled failure/retry and User B denial. Hosted/CI verification remains external. Do not infer a live quality pass from deterministic fixtures or SDK access alone.

## Phase boundary and Week 3 entry

**No Week 3 implementation.** Completion writes, YouTube search/embeds, Hinglish transcript/TTS/durable audio and PDF export remain deferred. Week 3 requires a fresh user request and preflight of this code/evidence. Reuse verified ownership/parent checks, job leases, shared lesson content, hash/version/model fields and cached ready behavior. Enhancement cache keys must also include applicable language/voice/model; failures should leave the base lesson usable. Do not reset generation attempts or expose internal job tokens/raw provider errors.
