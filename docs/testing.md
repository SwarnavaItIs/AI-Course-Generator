# Testing

The test suite uses an isolated MongoDB replica set, a local JWKS endpoint and temporary signed tokens. Provider responses are deterministic fixtures. Browser tests substitute the Auth0 UI through a separate test configuration; production builds use the real SDK and JWT middleware.

## Run the checks

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run inspect:production
```

The first run downloads test MongoDB and Chromium binaries. GitHub Actions runs the same checks on Linux and retains reports for 14 days. Generated files go to ignored `artifacts/`, `test-results/` and `playwright-report/` directories.

## Coverage

| Area                | Checks                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| API and persistence | JWT validation, ownership, transactions, rollback, reconnect and restart                                           |
| Generation          | Invalid output, provider failures, concurrent/repeated requests, attempt limits, expired leases and cached lessons |
| Lesson tools        | Independent errors, cache reuse, owned GridFS audio, ranges, format/size bounds and cleanup                        |
| Progress            | Concurrent and repeated completion updates                                                                         |
| Browser             | Public sample, saved library, generation, quizzes, retry, navigation and media states on desktop/mobile            |
| Accessibility       | axe scans, keyboard navigation, dialogs, narrow/tablet layouts and 200% text sizing                                |
| Production build    | Real SDK configuration state, public routes and local deep-link refresh                                            |

The baseline suite has 61 automated tests and 24 desktop/mobile browser journeys. Accessibility scans found no violations in the tested states; manual screen-reader testing remains outstanding.

Audio fixtures use a one-second PCM16 WAV tone. Tests verify storage, decoding, playback and download, but a tone cannot establish speech pronunciation.

The long PDF test exports an eleven-page lesson with 35 blocks and 25,810 source characters, including 90 code examples, Unicode, links and quiz answers. It checks exact source reconstruction, page bounds and every rendered PDF page. Run it separately with:

```sh
npm run test:e2e -- tests/e2e/enhancements.spec.ts
```

PDFs, manifests and page images appear in `artifacts/pdf/`. Routine test output is kept out of Git; selected screenshots live in [screenshots](screenshots/README.md).

## Provider evaluation

```sh
npm run check:providers
npm run evaluate:fixtures
npm run evaluate:live
npm run evaluate:enhancements
npm run measure:latency
```

Access checks and live evaluations require private provider settings in `server/.env`. They make real requests when configured. Reports omit keys and raw upstream errors. Exit 2 means missing configuration, exit 1 means failure, and exit 0 means success; npm may report child exit 2 as a general command failure.

| Command                 | Output                                                         |
| ----------------------- | -------------------------------------------------------------- |
| `check:providers`       | `artifacts/providers/provider-access.json`                     |
| `evaluate:fixtures`     | `artifacts/generation/evaluation-fixtures.json`                |
| `evaluate:live`         | `artifacts/generation/live-evaluation.json`                    |
| `evaluate:enhancements` | `artifacts/enhancements/live-evaluation.json` and sample audio |
| `measure:latency`       | `artifacts/latency.json`                                       |
| `inspect:production`    | `artifacts/production-ui.json` and screenshots                 |

The three fixture topics cover different kinds of curriculum. These observations concern authored fixtures and their first lessons, not live Gemini output:

| Topic                | Progression and correctness                                                                                                                                      | Resources and quizzes                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Python for beginners | Values and types precede conditions, collections and functions. The first lesson's number/string examples are consistent.                                        | Official Python tutorial; four questions with explanations on types, conversion and concatenation. A gentler beginner reading would help.     |
| Persuasive writing   | Audience and purpose lead into evidence, counterarguments and revision. The library-hours example connects claims to reader needs.                               | Purdue OWL; four questions on purpose, evidence and objections. More targeted audience-analysis reading would help.                           |
| World history        | Selective scope through 1500, beginning with evidence and chronology before societies and connections. The first lesson explains source context and uncertainty. | OpenStax Volume 1; four questions on primary sources, corroboration and missing evidence. Later lessons need region-specific resource review. |

For live output, review the full progression, factual claims, resource relevance and every quiz answer. For Hinglish, compare the transcript with the original lesson and listen for preserved technical terms and natural Hindi-English pronunciation. Confirm actual video playback separately from search success.

## Observed cache timings

A local run on 29 October 2026, with provider fixtures delayed by 150 ms, measured a 54.96 ms median topic enqueue, 1.17 s outline completion and 1.17 s first-lesson completion across five samples. Twenty cached lesson reads had a 6.76 ms median; twenty cached enhancement reads had a 21.83 ms median. Browser checks and a clean installation were running on the same machine. Provider call counts did not increase during cached reads. These are local observations, not live-provider latency or a service guarantee. Use `measure:latency` to repeat the measurement.

## Acceptance audit — 29 October 2026

The audit compared the local master specification against the actual contracts, UI, API, database models, workers, storage, tests and hosting configuration. The starting revision was `12c90ef`, with a clean working tree. The product code already covered the requested local features. The remaining repository gaps were the missing demo materials and the README's abbreviated architecture, data and API sections; those are now completed. The concise documentation layout replaces the original weekly planning files, as requested.

| Requirement                                                    | Result                           | Evidence and boundary                                                                                                               |
| -------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Auth0 integration, access tokens and owned records             | PASS locally; live login BLOCKED | `api.test.ts`, `enhancements.test.ts` and browser fixtures; real tenant configuration absent                                        |
| Saved course CRUD, stable IDs and transaction cleanup          | PASS                             | `api.test.ts`, `lifecycle.test.ts`; isolated database reconnect and production-process restart                                      |
| Validated topic outlines, lesson metadata and rich content     | PASS with fixtures               | `contracts.test.ts`, `generation.test.ts`, `e2e/generation.spec.ts`; counts, quizzes, resources and ordering checked                |
| Durable jobs, duplicate protection, bounded retries and caches | PASS                             | `generation.test.ts`, `enhancements.test.ts`; invalid output, expired leases, late publication and repeated requests                |
| Videos, Hinglish, audio and independent failures               | PASS with fixtures               | `enhancement-provider.test.ts`, `enhancements.test.ts`, `e2e/enhancements.spec.ts`; live quality and pronunciation BLOCKED          |
| Persistent owned audio, size/format checks and cleanup         | PASS                             | Actual isolated GridFS writes, reconnects, authenticated byte ranges, WAV decoding/playback/download and interrupted-upload cleanup |
| Full lesson PDF and persistent completion                      | PASS                             | Desktop/mobile eleven-page export coverage and visual review; repeated/concurrent completion and library refresh                    |
| Responsive UI, accessibility and request/generation limits     | PASS for tested states           | 24 browser journeys, 16 axe reports without violations, keyboard/dialog checks, 200% text sizing and API limits                     |
| Technical, nontechnical and broad-topic evaluation             | PASS for fixtures; live BLOCKED  | Three-topic evaluation above; provider scripts identify missing key/model settings                                                  |
| Production configuration, readiness and restart recovery       | PASS locally; hosted BLOCKED     | Compiled entrypoint tests, Vite production preview, Render/Vercel configs and deployment guide                                      |
| README, GitHub CI, demo script, shot list and résumé bullets   | Implemented                      | [README](../README.md), [workflow](../.github/workflows/ci.yml), [demo guide](demo.md)                                              |
| Public application and narrated five-minute recording          | BLOCKED                          | No deployment or configured live journey; no recording produced                                                                     |

Executed in the main checkout: `format:check`, `lint`, `typecheck`, `build`, `test` (61 passed in nine files), `test:e2e` (24 passed), `inspect:production`, `evaluate:fixtures` (three topics passed), and `measure:latency` all passed. `check:providers`, `evaluate:live` and `evaluate:enhancements` returned configuration blockers. No live check is counted as a pass.

A separate clean clone of `e8e02e4` installed 471 packages with `npm ci --offline` from the local npm cache. It then passed formatting, lint, type checks, build, all 61 tests and the production preview. Node 24.16.0 and npm 11.13.0 were used. The clone had its own dependencies; only the MongoDB and Chromium executables were reused from local caches. This checks setup from the lockfile without application credentials. Docker Compose startup was BLOCKED because the Docker daemon was unavailable.

The [current Google text](https://ai.google.dev/gemini-api/docs/structured-output) and [speech](https://ai.google.dev/gemini-api/docs/speech-generation) guides were checked against the provider request shapes. This verifies the documented integration pattern, not access to a configured Google project.

## Still to verify externally

Live generation quality, real YouTube playback, speech pronunciation, Auth0 tenant login, public deep-link refresh, hosted restart recovery and the deployment rollback workflow need configured external accounts. Docker Compose startup also needs verification on a machine with Docker running. A recorded demo is not included. Follow the [deployment checks](deployment.md#verify-the-deployment) when the hosts are available.
