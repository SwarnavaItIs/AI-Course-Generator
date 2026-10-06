# Architecture — Week 3

`client/` is React 19, TypeScript, React Router, Vite 8 and Tailwind 4. `server/` is Node 24, Express 5 and Mongoose 9. `packages/contracts/` contains Zod schemas/types and one authored sample. npm workspaces link a built shared package; build/dev commands compile it before client/server startup. Dependencies are pinned reproducibly by `package-lock.json`.

## User journey

1. `/` and `/sample` offer an explicitly public, read-only authored sample using bundled shared data. The browser can inspect it without backend credentials; `/api/sample` exposes the same public catalogue for API consumers.
2. `/library`, `/courses/:courseId` and child lesson routes require an Auth0 session. Auth0Provider requests the configured API audience and redirects to the site origin; callback return paths are restricted to internal paths. SDK access tokens remain in memory. Logout returns to the site origin.
3. The API client obtains an **access token** with `getAccessTokenSilently`, sends Bearer auth to Express, applies a 15-second request deadline, and validates responses against Zod.
4. Express validates RS256 JWT signature, issuer, audience and expiry through `express-oauth2-jwt-bearer`. Only verified `sub` becomes `ownerSub`. Personal responses use `Cache-Control: no-store`.
5. Creating a sample validates a strict request, assigns fresh UUIDs, validates full lesson content, computes SHA-256 hashes, and inserts the user/counter, course, modules, lessons and progress record in one MongoDB transaction. The library cap is 100 courses, enforced on the user counter inside that transaction. Indexes are initialized before serving requests.
6. Topic submission saves a pending course, progress and job atomically. Overview polls until ready metadata is published. Opening a not_started lesson requests generation then polls; reopening ready content reads MongoDB only.
7. Reads scope the parent by owner and check child/module course references. Course detail uses a snapshot transaction to avoid mixing pending counts with published modules. Ordering uses positions, routing uses stable IDs. Deletion removes course/children/jobs and decrements the counter atomically. Replica-set/sharded MongoDB is mandatory.
8. React renders text safely. Lazily loaded lowlight supplies syntax tokens rendered as spans/text; unknown languages fall back to plain text. Quizzes remain explained local practice. The ready lesson mounts independent tools for video search, Hinglish/audio, PDF and idempotent completion; opening a cached lesson performs enhancement GETs without provider POSTs.

## Collections and indexes

| Collection    | Identity/references                                    | Key indexes/behavior                                                                 |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| User          | `_id` = Auth0 sub, unique `auth0Sub`; savedCourseCount | Unique sub, transactional per-user cap; no passwords                                 |
| Course        | UUID `_id`, `ownerSub`                                 | ownerSub/createdAt/id library ordering; explicit generation state                    |
| Module        | UUID `_id`, courseId, position                         | Unique courseId/position                                                             |
| Lesson        | UUID `_id`, courseId, moduleId, position               | Unique courseId/moduleId/position; Zod-validated discriminated content, hash/version |
| Progress      | UUID `_id`, courseId, ownerSub, completedLessonIds     | Unique courseId/ownerSub; idempotent completion and undo                             |
| GenerationJob | UUID, targetKey, kind, courseId/lessonId/ownerSub      | Unique targetKey; status/nextAttemptAt/leaseUntil scan, courseId cleanup             |

Week 2 adds a partial unique ownerSub/requestId index on Course, topic/model/promptVersion fields, model/promptVersion on Lesson, and User.generationRevision writes that serialize per-owner active-job quota checks. Jobs store captured model/promptVersion, attempts/runLimit, safe errors and lease tokens/deadlines.

## Generation protocol

`providers/generation.ts` uses official @google/genai Interactions with text/application-json schema output, store:false, zero SDK retries and a 45-second timeout/AbortSignal. Zod validates parsed output; structured formatting does not prove factual accuracy. GEMINI_TEXT_MODEL is explicit; production has no fixture fallback or silent model default. Prompts treat JSON topic/context as untrusted data. Provider drafts cannot control ownership, IDs, states or arbitrary URLs. Resource IDs resolve only through the server catalogue; unknown IDs fail validation, unresolved suggestions remain null and labelled. The backend never fetches a provider-supplied URL.

`services/generation.ts` queues jobs with transactionally enforced limits (100 courses, three active jobs per owner), owner/request UUID idempotency for topics and unique target keys for lessons. Ready lessons remain cached through configuration changes. New jobs capture model/prompt version, and hashes combine content/model/promptVersion/contentVersion. The adapter executes the job's captured model.

Each process scans at one-second intervals and executes one task at a time. Atomic findOneAndUpdate claims an eligible queued job, increments attempts and sets a fresh fencing token with a 60-second lease. A Promise race bounds even an uncooperative provider at 45 seconds. Automatic attempts stop at two initially; manual retry permits remaining attempts through four total. Backoff is five seconds × attempts. Nonretryable provider/configuration errors stop automatic retries early. Startup/each scan recovers expired running jobs using that same bound; exhausted jobs become failed. Database outages leave durable recoverable jobs.

Publication validates all content first, then in one transaction checks the parent and matching running/unexpired lease, marks the job ready and writes the complete curriculum or lesson/hash/state. Failures roll back all writes. Expired/replaced workers cannot publish. Parent/job deletion in one transaction prevents orphan publication. Recovery can replay an upstream call, and a late upstream call may overlap a replacement after expiry: this is fenced publication, **not exactly-once provider execution**.

MongoDB availability and an awake worker process are needed for progress. Suspended hosting pauses processing until resume. UI polls for up to five minutes per load and retains Check status; no latency promise is made. Shutdown aborts active provider work and retains the ten-second process deadline; interrupted jobs are recovered later.

## Enhancement protocol and durable audio

`providers/enhancements.ts` uses fixed YouTube search/videos endpoints. Search is bounded to three lesson queries (or a saved sample's title/topics), type=video, videoEmbeddable=true and videoSyndicated=true. Details confirm public/processed/embeddable status; age-restricted, live and region-restricted results are excluded conservatively. Up to three safe ID/title/channel results are returned; URLs are constructed from validated eleven-character IDs. Empty searches become cached ready results. Metadata expires at the next UTC day (at most 24 hours), and records/jobs are removed together. External playback availability can change after search.

Hinglish is structured `{text}` generation with untrusted lesson context, instructions to preserve meaning and English terminology, and 80–6000-character validation. Semantic correctness requires live review. TTS submits that exact saved transcript with speech metadata and configured model/voice, requests WAV/24 kHz, disables SDK retries and bounds its request to 60 seconds. `providers/audio.ts` inspects actual MIME, RIFF chunks/length, PCM16 mono/stereo format, rates/alignment/data and duration. WAV bytes are retained; declared raw PCM with explicit sample rate is wrapped once. Unsupported/truncated/oversized/overlong audio never becomes ready. Limits: 12 MB, 240 seconds.

Enhancement records have a unique cacheKey including owned lesson identity, a hash of title/objectives/topics/resources/content/version, kind, prompt version, captured model, language and relevant voice/transcript hash. The separate worker only claims videos/transcript/audio; the Week 2 worker only claims course/lesson. Both share the transactionally serialized three-active-job quota, initial two automatic attempts and four total after explicit retry. Enhancement lease is 90 seconds; a Promise race/AbortSignal bounds all provider/storage work to 70 seconds. Publication checks the matching lease and unchanged ready source/parent, then writes only this enhancement. Failures never mutate base lesson content/state. Configured model/voice changes start a new cache variant; old owned assets remain until course deletion. Stale leases recover after restart; exactly-once upstream execution is not promised.

Collections added: Enhancement (UUID, unique cacheKey, owner/course/lesson, source/version/model/language/voice, state, videos/transcript/hash/audioAssetId, expiresAt), AudioAsset (UUID, unique internal GridFS ObjectId, owner/course/lesson/enhancement, uploading/ready/deleting, MIME/bytes/duration/cleanupAfter), and GridFS `lessonAudio.files/chunks`. Course.enhancementRevision writes serialize enhancement registration/publication/completion with parent deletion. Progress uses `$addToSet`/`$pull`; ready parent/module/lesson checks precede updates. The completion response includes current CourseDetail, updating lesson/sidebar context and later library reads without discarding the lesson.

`storage/audio.ts` defines AudioStorage; GridFsAudioStorage never uses production disk. GridFS writes are not a cross-collection transaction: first register an uploading asset/internal file ID inside a fenced transaction, then stream bounded validated bytes, then atomically mark asset/enhancement/job ready. Failure/deletion marks assets deleting. Cleanup removes recorded files and chunks, including uploads lacking files documents, and keeps tombstones through a five-minute safety window for late chunks. Expired uploading records are recovered after restart. Deletion transaction removes enhancements/jobs and marks assets; cleanup runs on subsequent worker scans. If storage is unavailable or hosting sleeps, cleanup remains durable and resumes later.

Audio GET checks parent, lesson, owner, ready asset and source-linked ready enhancement before any storage read. It supports single byte ranges and sends audio/wav, exact length, inline UUID filename and no-store. Client fetches with Bearer auth, verifies MIME/size, then uses/revokes an object URL for native controls and download; tokens never appear in URLs. No autoplay. Enhancements and PDF have separate errors; explicit controls initiate provider work.

## Full lesson PDF

`client/src/export/lesson-pdf.ts` constructs a dedicated fixed A4 layout from typed content, independent of the application's DOM/sidebar/scroll. Title, description, objectives, blocks/code/callouts, resources, video title/channel/URL or search ideas, and all MCQ options/answers/explanations become ordered source blocks. Keep ordinary blocks intact; reserve room after headings; split oversized paragraphs at word boundaries and code at line boundaries before rendering. Long identifiers wrap, Unicode surrogate pairs stay intact, and every source character/whitespace has a recorded offset fragment. Page bounds are checked before capture; a visible error replaces truncation. Limit: 120 pages.

html2canvas captures each laid-out page, not a cropped tall screenshot. jsPDF adds page images, counters and clickable approved resource/video annotations. Canvas memory is released between pages and the layout is removed afterward. These PDFs rasterize text (no selectable/searchable text layer). Browser tests export an eleven-page/25,810-character authored lesson with 90 complete code examples at desktop/mobile widths, compare exact fragment reconstruction, validate vertical bounds, parse/render every real PDF page with pdfjs and inspect first/middle/final/Unicode page artifacts. Live pronunciation is unrelated to fixture WAV/player validation.

## Reliability and test boundary

Startup validates environment names without printing values, connects to MongoDB with a selection deadline, checks transaction capability and initializes indexes. `/health` reports process liveness; `/ready` pings MongoDB. SIGTERM/SIGINT close HTTP and MongoDB, with a bounded shutdown deadline. CORS allows explicit origins, JSON is limited to 16 KiB, and API rate limits are 120/minute/IP. Render's single HTTPS proxy hop is trusted only in production. All errors include a server-generated request ID; internal exceptions and upstream bodies are not disclosed.

`tests/fixtures/harness.ts` launches an isolated real MongoDB replica set and loopback JWKS service and signs temporary RSA fixture tokens. Production JWT middleware still verifies those tokens. The browser test config alone aliases the external Auth0 SDK to a test login facade; localhost-only fixture endpoints issue signed tokens and reset the real limiter's in-memory store between independent journeys. Production configs/entrypoints never import this code or expose reset routes; the 120/minute limit is unchanged and tested. These tests prove local authorization/persistence and UI behavior, **not actual Auth0 tenant login**.

Week 1 probes still check small text/TTS/search access requests. `evaluate:live` separately validates structured course/lesson output for three topics and records reviewable outputs or credential blockers. It does not prove actual saved production records. `tests/fixtures/generation.ts` supplies authored responses only by test dependency injection; integration tests exercise the real queue/worker/publication with isolated MongoDB/JWKS. Live factual quality and actual tenant login remain separate external checks.

## Official references consulted

- [Auth0 React login and API access](https://auth0.com/docs/quickstart/spa/react)
- [Auth0 Express JWT API authorization](https://developer.auth0.com/resources/guides/api/express/basic-authorization)
- [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- [Vite setup](https://vite.dev/guide/) and [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Gemini text interactions](https://ai.google.dev/gemini-api/docs/text-generation) and [TTS interactions/audio formats](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview), and [Lowlight tokens](https://github.com/wooorm/lowlight)
- [YouTube search parameters](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube video details](https://developers.google.com/youtube/v3/docs/videos/list), [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/), [html2canvas](https://html2canvas.hertzen.com/documentation), [jsPDF](https://parall.ax/products/jspdf)
- [GitHub Node CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs), [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), [Render Blueprint](https://render.com/docs/blueprint-spec)
