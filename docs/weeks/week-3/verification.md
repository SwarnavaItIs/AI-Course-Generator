# Week 3 verification — completed 6 October 2026

Mandatory previous-week baseline: unchanged Week 2 format/lint/typecheck/build PASS, 35 tests PASS, 12 desktop/mobile journeys PASS. See [preflight.md](preflight.md). Week 3 local engineering is complete: 57 unit/API/provider tests and all 20 desktop/mobile journeys PASS, including earlier regressions. Format, lint, typecheck and production build PASS. Live checks remain separately blocked.

## Executed evidence

- Initial Week 3 tests PASS: 49, then 53 after official-provider transport tests were added. Initial six enhancement desktop/mobile browser journeys PASS, including actual WAV decode/play/download and full PDF generation.
- Long export: eleven pages, 35 blocks, 25,810 source characters, complete sentences and all 90 code examples. Exact source-offset reconstruction and fragment bounds PASS. All actual PDF pages were parsed/rendered; first/middle/final/Unicode artifacts visually inspected for readable text/code, margins and answer section. Clickable resource/video annotations PASS. A final targeted desktop/mobile rerun after completing the authored source fixture also PASS (2/2).
- Required final commands: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` PASS (57/57); `npm run test:e2e` PASS (20/20). `npm run format` and `npm run format:check` PASS. Build keeps export/highlighting dependencies lazy; production bundles contain no fixture/reset-route imports.
- Intermediate expanded-suite run FAIL: two unit cases and one browser journey hit the real 120/minute limiter because independent tests shared one loopback address. Corrected fixture isolation resets its real MemoryStore between tests/journeys. The production limit remains unchanged, with a passing 121-request enforcement case. Final reruns PASS. Storage cleanup failure retains durable records and permits other enhancements to finish, also verified.
- Provider evaluation: `npm run evaluate:enhancements` BLOCKED, missing YOUTUBE_API_KEY/GEMINI_API_KEY/GEMINI_TEXT_MODEL/GEMINI_TTS_MODEL. Report recorded for all three technical/nontechnical/broad samples. No network calls were attempted without keys. Live meaning/embedding/pronunciation NOT RUN because those prerequisites are absent.
- Week 2 `evaluate:fixtures` PASS for all three topics; `evaluate:live` BLOCKED by absent Gemini key/model. Prior provider quality and actual Auth0/application persistence/hosted smoke remain external.
- Dependency install PASS: npm added 26 packages, audited 473 packages and reported zero vulnerabilities at installation. The lockfile includes html2canvas/jsPDF plus test-only pdfjs/canvas.

Sandbox notes: default TypeScript/esbuild subprocess execution returned EPERM; authorized escalated checks work. Tests use cached MongoDB 8.0.16 and Chromium with isolated databases/services. `PLAYWRIGHT_BROWSERS_PATH` points at `.cache/playwright`. This does not change production authentication. No auto-review rejection occurred. No credentials/URIs were printed or committed.

## Coverage and artifacts

Integration/provider cases cover unique concurrent requests, three-active-job limit, zero-result videos, failed/invalid transcript and explicit four-attempt retries, audio MIME/container/size/duration, actual GridFS bytes/ranges/persistence/reconnect, every other-owner endpoint/unauthenticated audio, source/model/voice variant keys, expired leases/provider deadline, expired video cleanup, upload failure/deletion fencing/abandoned chunks, concurrent duplicate completion/undo/ready checks and library counts.

Browser journeys cover existing video title/channel/embed/external link, readable Hinglish, actual one-second WAV metadata/no autoplay/play/download, cached reopening without provider POSTs, independent transport failure, persisted invalid explanation/reopen/explicit retry, completion/library counts/undo, PDF export with closed outline and long independent A4 export on desktop/mobile. Earlier navigation/authored sample/save/delete/generation/error/cache/quiz journeys are retained. Browser embeddings and providers are explicit fixtures; actual YouTube service and speech quality are not implied.

Artifacts: [screenshots/](screenshots/), [long desktop PDF](pdf/long-desktop.pdf), [long mobile PDF](pdf/long-mobile.pdf), page PNGs and exact source/fragment manifests in [pdf/](pdf/). [Evaluation](evaluation.md) separates format/player evidence from blocked human listening/meaning checks. The original source text can be reconstructed exactly from either manifest; actual PDFs contain rasterized page images and approved clickable link annotations.

## External verification

BLOCKED: actual Auth0 login/two-account ownership and configured persistent application MongoDB; live Gemini course/lesson/Hinglish correctness; live speech/pronunciation and real YouTube search/embedding; hosted Vercel/Render smoke. NOT RUN: hosted CI/deployment/fresh-clone checks/final demo (Week 4). Local isolated DB/fixture checks do not satisfy those live claims.

No commit, remote, push or deployment at this phase boundary. Week 3 is complete locally; the subsequent user request authorizes Week 4 only after this handoff. Its entry point is a mandatory full review/preflight. Live provider meaning/pronunciation, actual authenticated application smoke and hosted acceptance remain blocked by private external setup.
