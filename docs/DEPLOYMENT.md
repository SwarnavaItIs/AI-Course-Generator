# Production and update runbook

Status on 6 October 2026: configuration is prepared and local production builds/entrypoint checks pass. **No GitHub remote, Vercel project, Render service, application Atlas database, actual Auth0 tenant or public URLs were available.** Hosted CI, public login/deep-link/persistence checks and final recording remain blocked. Nothing has been published or provisioned. Retain Vercel + Render + MongoDB replica set/GridFS; changing providers needs an explicit decision.

## Private configuration

Use Node 24 and the committed lockfile. Repository root is the project root for both hosting services. Keep backend secrets in Render's environment settings; frontend VITE_ values become public build output. Examples in `.env.example` are placeholders. Configure privately; never send keys through chat or commit `.env`.

| Render variable                    | Required behavior                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| NODE_ENV                           | production; blueprint sets it                                                                 |
| NODE_VERSION                       | 24.16.0; blueprint pin, matching local runtime                                                |
| PORT                               | Render supplies it; API binds the host's port                                                 |
| CLIENT_ORIGINS                     | Exact Vercel HTTPS origin, comma-separated if more than one; no path/trailing slash/wildcard  |
| MONGODB_URI                        | Atlas/other replica set database, private credentials and permitted network access            |
| AUTH0_DOMAIN                       | Bare tenant/custom issuer domain, identical to client                                         |
| AUTH0_AUDIENCE                     | API identifier, identical to client; RS256 API                                                |
| GEMINI_API_KEY, GEMINI_TEXT_MODEL  | Supported structured-output text model and Google project access for courses/lessons/Hinglish |
| GEMINI_TTS_MODEL, GEMINI_TTS_VOICE | Explicit supported speech Interactions model; Kore default, allowlisted voices in README      |
| YOUTUBE_API_KEY                    | Enable YouTube Data API v3; restrict key to that API and appropriate backend access           |
| MONGOMS_DISABLE_POSTINSTALL        | 1 prevents unnecessary test MongoDB downloads during install                                  |

| Vercel build variable | Value                                                      |
| --------------------- | ---------------------------------------------------------- |
| VITE_AUTH0_DOMAIN     | Same bare domain as backend                                |
| VITE_AUTH0_CLIENT_ID  | Public SPA ID, never a client secret                       |
| VITE_AUTH0_AUDIENCE   | Same API identifier as backend                             |
| VITE_API_URL          | Exact Render HTTPS origin without `/api` or trailing slash |

Provider configuration is optional at startup: missing providers return controlled 503 states and the public authored sample still works. Missing Auth0/backend database settings fail required startup configuration. Model/voice changes create new cache variants; there is no silent model fallback. Budget and quota availability must be checked in the actual Google project.

## Accounts and first deployment

1. Publish the reviewed branch to an explicitly chosen GitHub repository only with authorization/access. Connect CI; keep the default branch consistent with the workflow's `main` trigger. PR and manual workflow triggers are available. No repository URL has been invented here.
2. Create an Auth0 SPA and RS256 API. Match the audience/domain on both sides. Add the exact frontend origin to Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins. Callback URI is the origin. Local origins are `http://localhost:5173` and `http://127.0.0.1:5173`; add preview origins individually. Enable an actual login connection and create two test accounts. The app requests `openid profile email` plus the configured audience and stores access tokens in memory.
3. Provision or select a persistent MongoDB replica set/Atlas database with transactions, an application database user and network access for Render. Save the URI only on the server. Index creation needs permissions. Enable the database's backup/restore policy as appropriate and verify restoration in a separate database, without deleting production data. `lessonAudio.files`/`lessonAudio.chunks` are durable audio storage; no Render disk is used for audio. Local isolated test databases are not the application database.
4. Import `render.yaml`. Build: `npm ci && npm run build -w @text-to-learn/contracts && npm run build -w @text-to-learn/server`. Start: `npm run start -w @text-to-learn/server`. Health path `/ready`. Complete environment values privately. The blueprint uses the existing free plan; confirm its current availability and sleep behavior before relying on timely generation. Sleeping/restarting suspends workers until the process resumes; database jobs persist. Choosing a different paid plan is an account decision, not a silent implementation change.
5. Import `vercel.json` at repository root, Node 24, output `client/dist`. Build compiles contracts then client. Configure the four public build variables and rebuild. The catch-all rewrite supports SPA routes; existing assets are served directly, with immutable caching for hashed assets. Verify both a lesson deep link and an asset URL on the actual host.
6. Set the final exact origins in backend CORS/Auth0 and redeploy as needed. Check external setup below before recording a real demo.

Render build/start guidance: [official Express deployment](https://render.com/docs/deploy-node-express-app). SPA setup: [official Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite). CI artifact configuration: [official upload-artifact](https://github.com/actions/upload-artifact).

## Runtime and recovery

`/health` is liveness; `/ready` pings MongoDB and returns 503 when unavailable. Startup verifies replica-set/sharded transaction capability, initializes unique indexes, binds HTTP and only then starts both workers. Failed connection/capability/index/listener startup closes MongoDB and exits with a safe error. Production trusts one proxy hop; verify that this matches the actual Render ingress rather than applying this setting blindly to another topology.

SIGTERM/SIGINT stop accepting HTTP and stop/abort workers concurrently, then disconnect MongoDB; shutdown has a ten-second deadline. Windows process restart checks exercise persistence and boot, not Linux graceful signal delivery. On Render, check shutdown/restart logs and expired-job recovery. Jobs use atomic leases and fenced publication; a replay can call a provider again after expiry, so upstream execution is not exactly once. Invalid or late output cannot publish ready content. GridFS cleanup recovers persisted deleting/uploading records on worker scans; tombstones protect against late upload chunks through the five-minute safety window.

Limits remain 120 API requests/minute/IP, 16 KiB JSON, 100 courses/user, three active jobs/user across all kinds, two initial automatic attempts/four total after manual retries, 45-second text deadline, 70-second enhancement worker deadline, 12 MB/four-minute WAV bounds and 120-page PDF cap. The rate limiter is per process; multiple API replicas would require a shared limiter store before claiming a fleet-wide IP limit. Authentication, persisted user quotas and job uniqueness apply independently.

## Reviewed update and rollback workflow

Run `npm ci`, formatting/lint/types/build, `npm test`, browser checks and production preview checks on the reviewed source. CI runs the same critical checks on Linux with isolated MongoDB/JWKS/provider fixtures; it does not need live secrets. The workflow retains browser/a11y/production evidence for fourteen days. Local fresh-clone results are in the Week 4 verification record; hosted CI has not run without a remote.

Commit only intended source/configuration/docs, inspect the diff for secrets and user work, and use a PR for review. Push/merge/publish only when authorized. Deploy the exact reviewed revision; record commit, environment, deployment URLs and smoke outcomes in `docs/weeks/week-4/submission.json`. Changing VITE_ values requires a frontend rebuild. Keep configured model/voice versions explicit and monitor provider quota/errors, readiness and queued/expired jobs. Logs show safe codes/request IDs, never raw provider bodies or credentials.

If an update fails, use each existing host's previous known-good deployment/revision after confirming configuration compatibility. Preserve the same database; never roll back by deleting collections or wiping a volume. This phase introduces no destructive database migration. Recheck readiness, saved records, audio and direct lesson links after rollback. Actual deploy/update/rollback UI actions are **BLOCKED**, pending account access and authorization; the runbook is reviewable configuration, not evidence of deployment.

## Required hosted smoke evidence

Record PASS/FAIL/BLOCKED separately for every item, with real URLs and date. Currently all are BLOCKED because deployments/configured tenant/application database are absent.

- Frontend HTTPS loads; backend `/health` and `/ready` return 200; hashed assets load. Allowed-origin requests/preflight succeed and a different origin is denied.
- Fresh User A login/logout completes on the actual Auth0 connection, with correct issuer/audience; unsigned/wrong-audience requests return 401. User B receives 404 for A's course, lesson, enhancement, completion, deletion and audio URLs.
- Submit a new topic; see persisted generation progress; repeated submission/opening coalesces work. Open rich lesson, answer a quiz, verify cached reopening, controlled failure/retry and previous/next navigation.
- Find existing embeddable YouTube videos; test unavailable video state. Generate Hinglish, compare meaning/terminology, listen to Hindi-English pronunciation and verify real WAV playback/download. An enhancement failure leaves the lesson usable.
- Mark completion twice, refresh library and lesson deep links, restart/redeploy backend and confirm learning records/progress/audio persist. Check lease recovery without duplicate publication.
- Export a genuinely long PDF; inspect every page, wrapped code, Unicode, links and MCQ answer section. Check narrow screen, keyboard focus, dialog dismissal and reduced motion.
- Verify a reviewed update and rollback on existing host projects. Record CI run and final five-minute narrated demo URL/file. Do not mark submission complete while required assets or smoke checks are absent.
