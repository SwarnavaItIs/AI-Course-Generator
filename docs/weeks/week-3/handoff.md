# Week 3 handoff — completed 6 October 2026

Week 3 local engineering is complete after the mandatory [Week 2 review](preflight.md): 57 tests, 20 desktop/mobile journeys and required static/build checks PASS. Final results are in [verification.md](verification.md), with live-provider blockers in [live-evaluation.json](live-evaluation.json) and [evaluation.md](evaluation.md). The user has subsequently authorized Week 4, strictly after this completion record and a fresh full preflight.

## Delivered

Ready lessons expose user-triggered cached existing YouTube search, Hinglish text, configurable speech audio with protected playback/download, full single-lesson PDF export and idempotent saved completion/progress. Search rechecks embedding/privacy/age/region restrictions and caches empty results honestly. Each enhancement owns its status/error/retry and leaves base content/quizzes/navigation usable. Reopening reads stored enhancements/audio without new provider requests.

AudioStorage defaults to MongoDB GridFS, never ephemeral production disk. Actual MIME/RIFF/PCM/size/duration validation precedes upload. Register-before-upload asset records, matching leases/source/parent checks, transactional publication and durable deletion tombstones support failure/restart cleanup. Enhancement claims use a separate worker and the existing shared quota/retry framework. Progress writes serialize against parent deletion and use set operations so retries do not double-count.

PDF builds its own A4 pages from the full typed lesson. Ordinary blocks stay intact; oversized text/code is split before each page capture, long identifiers wrap, all source offsets are recorded, and resource/video annotations are clickable. Eleven-page desktop/mobile artifacts contain the final answer section and every source character. The page images rasterize text; the 120-page limit fails visibly instead of truncating.

## Main files

- `packages/contracts/src/index.ts`: enhancement/transcript/video/audio/completion contracts; earlier generation contracts preserved.
- `server/src/providers/enhancements.ts`, `audio.ts`: official fixed-endpoint YouTube search/details, structured Hinglish, exact transcript speech, explicit model/voice and format/limit checks.
- `server/src/services/enhancements.ts`, `models.ts`, `storage/audio.ts`: unique variant caches, leased worker/recovery/fencing, GridFS adapter, protected asset references and durable cleanup. `services/generation.ts` keeps the Week 2 worker restricted to course/lesson and exports shared transaction/quota helpers.
- `server/src/routes/enhancements.ts`, `app.ts`, `index.ts`, `services/courses.ts`: owned routes/audio ranges/completion, worker lifecycle, deletion cleanup marking and saved progress. Production JWT middleware is unchanged.
- `client/src/components/lesson-tools.tsx`, `api.ts`, `pages/course.tsx`, `export/lesson-pdf.ts`, `styles.css`: independent states/retries, opt-in embeds, readable Hinglish, authenticated object-URL audio, print layout, completion and current progress.
- `tests/enhancements.test.ts`, `enhancement-provider.test.ts`, `e2e/enhancements.spec.ts`, explicit fixtures and `evaluate-enhancements.ts`: real isolated MongoDB/GridFS/JWKS and browser/PDF evidence. No fixture imports in production entrypoints.
- README, API_CONTRACT, ARCHITECTURE, PROJECT_SPEC, ROADMAP, PROJECT_STATUS, server env example and Render blueprint reflect Week 3. Original master prompt remains unchanged.

## Run and external checks

Use Node 24 and `npm ci`; configure actual Auth0 client/server values and a persistent replica-set/Atlas database, then `npm run dev`. Server GEMINI_API_KEY/GEMINI_TEXT_MODEL enable course/lesson/Hinglish. Optional YOUTUBE_API_KEY requires YouTube Data API v3. Speech requires a currently supported Interactions GEMINI_TTS_MODEL; voice defaults to Kore and the documented allowlist is checked at startup. Model IDs have no silent fallback. Both workers start with the API. Audio is capped at 12 MB/240 seconds and cleanup resumes when hosting wakes/restarts.

Run format/lint/types/build, `npm test`, `npm run test:e2e`, `npm run evaluate:fixtures`, `npm run evaluate:live`, `npm run evaluate:enhancements`. The enhancement evaluation records three sample transcripts/WAVs/video results when configured, but human meaning/pronunciation and actual embedding remain separate reviews. Missing credentials here block those checks; fixture tone playback cannot establish pronunciation.

Privately configure providers and perform that review, then verify actual saved lesson controls/caches/audio/progress with two real accounts. Keep an awake worker for cleanup; register/upload/publish is designed around GridFS writes outside transactions. Do not claim exactly-once provider execution or hosted acceptance from local fixtures. No application .env, external account change, Git commit/remote/push or deployment was created. The standalone repository remains unborn/untracked.

## Next phase boundary

Stop after Week 3. A requested Week 4 must first reread this handoff, source/contracts and evidence, rerun prior checks, reconcile blockers and produce its own preflight. Hosted deployment, final demo/submission assets and feature-freeze work are not implemented in this phase.
