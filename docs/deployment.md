# Deployment

Use Vercel for the frontend, Render for the API, and MongoDB Atlas for persistent data and audio. Both hosting projects should build from the repository root on `main`.

## Prepare Auth0, Atlas and providers

Create or select an Auth0 **Single Page Application** and an **API using RS256**. Keep the bare domain, public SPA client ID and API identifier. The identifier must match `AUTH0_AUDIENCE` and `VITE_AUTH0_AUDIENCE`; it does not need to be a deployed URL.

Use an Atlas replica set with an application database user that can create indexes. Add the Render service's outbound IP ranges to the Atlas network access list. Save the application connection string in Render only. Audio uses GridFS, so no persistent Render disk is needed.

Create a Gemini API key and choose explicit text and speech models available to your project. The adapter uses the [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview); check model support for [structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [speech](https://ai.google.dev/gemini-api/docs/speech-generation). Enable YouTube Data API v3 for video search.

## Render backend

Connect `SwarnavaItIs/AI-Course-Generator` to your web service and select `main`.

| Setting        | Value                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Runtime        | Node                                                                                            |
| Root directory | Leave blank                                                                                     |
| Build command  | `npm ci && npm run build -w @text-to-learn/contracts && npm run build -w @text-to-learn/server` |
| Start command  | `npm run start -w @text-to-learn/server`                                                        |
| Health check   | `/ready`                                                                                        |

Add these environment variables in the dashboard:

```dotenv
NODE_ENV=production
NODE_VERSION=24.16.0
MONGOMS_DISABLE_POSTINSTALL=1
CLIENT_ORIGINS=<frontend HTTPS origin, no trailing slash>
MONGODB_URI=<private Atlas application URI>
AUTH0_DOMAIN=<bare Auth0 domain>
AUTH0_AUDIENCE=<Auth0 API identifier>
GEMINI_API_KEY=<private Gemini key>
GEMINI_TEXT_MODEL=<supported structured-output model>
GEMINI_TTS_MODEL=<supported speech model>
GEMINI_TTS_VOICE=Kore
YOUTUBE_API_KEY=<private YouTube Data API key>
```

Render supplies `PORT`. Missing database or Auth0 settings prevent startup; missing provider settings leave the corresponding tools unavailable. Deploy the latest commit and check that `/health` and `/ready` return 200. The repository also includes `render.yaml` for Blueprint setup.

## Vercel frontend

Connect the same repository to the frontend project, with `main` as the production branch.

| Setting          | Value                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Framework        | Vite                                                                                  |
| Root directory   | Repository root                                                                       |
| Node.js          | 24.x                                                                                  |
| Install command  | `npm ci`                                                                              |
| Build command    | `npm run build -w @text-to-learn/contracts && npm run build -w @text-to-learn/client` |
| Output directory | `client/dist`                                                                         |

Set these public build variables:

```dotenv
VITE_AUTH0_DOMAIN=<same bare Auth0 domain>
VITE_AUTH0_CLIENT_ID=<public SPA client ID>
VITE_AUTH0_AUDIENCE=<same API identifier>
VITE_API_URL=<Render HTTPS origin, no /api or trailing slash>
```

Deploy again after changing frontend variables. `vercel.json` supplies the SPA rewrite and asset caching. Never put backend keys or an Auth0 client secret in a `VITE_` variable.

## Connect login and CORS

Add the frontend HTTPS origin to the Auth0 SPA's **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**. Enable a login connection for the SPA. The callback is the site root.

Set Render's `CLIENT_ORIGINS` to that exact frontend origin. Multiple allowed origins are comma-separated, without paths or trailing slashes. Add preview origins individually if you need preview login and API access.

## Verify the deployment

- Open the frontend and check backend health and readiness.
- Sign in with a new account, create a course, generate a lesson and answer a quiz.
- Refresh a direct lesson URL and reopen saved content. Mark completion twice and confirm it counts once.
- Try video search, Hinglish, audio playback/download and a long PDF export. Check transcript meaning and Hindi-English pronunciation manually.
- Use a second account to confirm it cannot read the first account's course, lesson or audio.
- Restart the backend and confirm saved courses, progress and audio remain available.
- Test keyboard navigation and a narrow screen. A failed enhancement should leave the lesson usable.

No public deployment has been verified yet. Local browser tests use provider and login fixtures; repeat these checks against the configured hosts.

## Updates and recovery

Run the [checks](testing.md) before deploying and wait for GitHub CI. Deploy the reviewed commit on both hosts. Frontend environment changes require a rebuild; model and voice changes can create new enhancement cache entries.

Startup verifies transaction support and indexes before serving requests. Workers recover expired jobs after restart; a recovered job may repeat a provider call. GridFS cleanup also resumes from persisted records. Sleeping hosts pause this work until the service wakes.

If an update fails, restore the previous deployment on the affected host after checking configuration compatibility. Keep the same database and verify readiness, saved records, audio and deep links again. Configure database backups and test restoration in a separate database.

## Troubleshooting

| Symptom                   | Check                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `/ready` fails            | Atlas network access, database credentials and replica-set support                  |
| Login fails               | Auth0 domain, matching audience, connection and allowed URL lists                   |
| Frontend cannot reach API | `VITE_API_URL`, `CLIENT_ORIGINS`, then rebuild the frontend if its settings changed |
| Generation fails          | Model access, provider quota and the saved error before retrying                    |
| Jobs stop progressing     | Backend availability, worker logs and database connectivity                         |

Hosting references: [Render Express deployment](https://render.com/docs/deploy-node-express-app), [Vercel Vite setup](https://vercel.com/docs/frameworks/frontend/vite), [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
