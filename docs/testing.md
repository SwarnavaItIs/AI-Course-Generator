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

A local run on 13 October 2026, with provider fixtures delayed by 150 ms, measured a 40.52 ms median topic enqueue, 1.16 s outline completion and 1.20 s first-lesson completion across five samples. Twenty cached lesson reads had an 8.32 ms median; twenty cached enhancement reads had a 12.39 ms median. Browser tests were running on the same machine. Provider call counts did not increase during cached reads. These are local observations, not live-provider latency or a service guarantee. Use `measure:latency` to repeat the measurement.

## Still to verify externally

Live generation quality, real YouTube playback, speech pronunciation, Auth0 tenant login, public deep-link refresh, hosted restart recovery and the deployment rollback workflow need configured external accounts. Docker Compose startup also needs verification on a machine with Docker running. A recorded demo is not included. Follow the [deployment checks](deployment.md#verify-the-deployment) when the hosts are available.
