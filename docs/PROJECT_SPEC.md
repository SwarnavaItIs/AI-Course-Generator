# Text to Learn

An AI-assisted learning space for turning a free-form topic into a saved, structured course. The supplied `text_to_learn_codex_master_prompt.md` remains the original specification. The latest user request authorizes **Week 4**, strictly after completing Week 3. Week 4 is the stopping boundary. Local delivery and incomplete external submission must be reported separately.

## Final product

Auth0 sign-in; saved courses with title, description, tags, 3–6 modules and 3–5 lessons/module; objectives, topics and resources on every lesson; detailed, validated lesson blocks and 4–5 MCQs with explanations; stable-ID navigation and persistent progress; existing YouTube suggestions; on-demand Hinglish transcript/audio; polished single-lesson PDF export. Public frontend/backend, accurate repository/README and five-minute demo are final submission assets.

## Week 1 scope and acceptance

- npm workspaces, strict TypeScript, lint/format/build scripts, startup validation, MongoDB connection, health/readiness, CI and Vercel/Render configuration.
- User, Course, Module, Lesson and Progress models with ownership and stable IDs; a labelled authored sample with representative content.
- Auth0 redirect login/logout, protected personal routes and server JWT checks (issuer, audience, signature, expiry, RS256).
- Validated saved-sample create/list/get/delete APIs with transactional child cleanup.
- Responsive library, course overview, lesson renderer/sidebar/navigation, loading/empty/error/retry states.
- Local evidence for unauthorized and cross-user denial, saved data surviving reconnect/refresh, desktop/mobile screens, build and static checks.
- Live Auth0/provider/hosted smoke checks when account access exists; otherwise explicit blockers and exact setup.

## Week 2 scope and acceptance

- Official backend Gemini adapter with structured outline/lesson prompts and strict validation.
- Topic → saved course with 3–6 modules and 3–5 lessons/module; metadata/resources on every lesson.
- Durable leased jobs, duplicate protection, bounded retries/deadlines, restart recovery, and on-demand persisted lessons with cached reopening.
- Safe rich renderer, code highlighting, 4–5 interactive explained MCQs, resource suggestions, video-query placeholders, previous/next navigation and clear generation/error/retry states.
- Invalid output never published as ready; failures permit controlled retry. Ownership, persistence, repeated requests, provider errors and caches covered by integration tests; Week 1 regressions pass.
- Technical/nontechnical/broad-topic evaluation and Week 2 contracts/architecture/status/handoff. Live-provider checks blocked by credentials identified separately.

## Week 3 scope and acceptance

- Review preceding implementation and generation contracts first; preserve all earlier acceptance checks.
- Backend existing-video search using generated queries, embeddable filtering and caching. Render title/channel/embed/external link and unavailable states.
- User-triggered readable Hinglish preserving technical terminology/meaning; configurable supported TTS model/voice, actual audio format handling, playback/download and sample pronunciation review where credentials permit.
- Durable storage adapter (GridFS default), ownership on every child/audio endpoint, size limits and cleanup; no production audio on ephemeral Render disk.
- Dedicated single-lesson html2canvas/jsPDF layout with objectives/content/code/resources/video title/URL/MCQ answers, independent of UI/sidebar. Block-aware pagination, code wrapping and genuinely long multipage evidence.
- Idempotent ready-lesson completion and persisted owned course/library progress. Cached enhancements are reused; one failed enhancement leaves the base lesson and other tools usable.
- Update architecture/contracts/status/evidence/handoff; distinguish fixture engineering evidence from blocked live checks. Stop at Week 3.

## Week 4 scope and acceptance

- Review complete implementation, handoffs and unresolved issues before work; preserve previous acceptance behavior.
- Resolve critical authorization/provider/duplicate/persistence/media/export defects; complete responsive/accessibility/limits and measured cache/latency checks. Freeze features at the Day 24 equivalent.
- Finalize Auth0, exact CORS, readiness, restart recovery, durable storage, SPA links and CI/deployment/update configuration; verify fresh-clone setup when possible.
- Deliver accurate README/screenshots/architecture/model/pipeline/env/API/deployment/verification/limitations, resume bullets, five-minute demo script/shot list and recording only with access.
- Run available automated/browser/production-build checks; record real public hosted/login/data/update checks when deployments exist. Missing repository/frontend/backend/demo URLs or required live checks keep overall submission incomplete.
- Update status, architecture/contracts, handoff and verification; stop at Week 4 without pushing/provisioning/publishing silently.

## Requirements retained across phases

Never store passwords or expose backend secrets. Only verified token `sub` determines ownership. Validate generated text as untrusted input; discriminate lesson blocks; never execute code or unsanitized HTML. Prefer curated resource links; label unresolved suggestions and never fetch arbitrary AI URLs. Use deterministic ordering, bounds, safe error envelopes/request IDs, rate limits, provider timeouts and honest failure states.

Generation in Week 2 must persist jobs with atomic leases, bounded retries and restart recovery; recovery may replay a provider request. Distinguish not_started/generating/ready/failed and publish only complete validated content. Cache by content hash/version and applicable model/language/voice. Week 3 audio storage must be durable (for example GridFS), never ephemeral Render disk; no autoplay. Test long PDF pagination and independent enhancement failures.

No payments, marketplaces, social features, multi-agent infrastructure, Kubernetes, additional-language scope, or whole-course PDF export. Automated fixtures are explicit and isolated; production never silently uses mock providers. Report every check as PASS, FAIL, BLOCKED or NOT RUN.
