# Deploy through your existing dashboards

GitHub is ready: [SwarnavaItIs/AI-Course-Generator](https://github.com/SwarnavaItIs/AI-Course-Generator), branch **main**. The latest published source passed GitHub CI. Use your existing Vercel frontend project and Render backend service. These instructions have not deployed either project; no frontend/backend URL is assumed.

## 1. Collect your existing configuration privately

In Auth0, use a **Single Page Application** and an **API signed with RS256**. Keep its bare domain, public SPA client ID and API identifier. A suitable API identifier is `https://text-to-learn-api`; use the same identifier in backend AUTH0_AUDIENCE and frontend VITE_AUTH0_AUDIENCE. It is an identifier, not a deployment URL. Never put an Auth0 client secret in the frontend.

In Atlas, use a persistent replica-set cluster and database user; copy the application connection string privately. Permit the existing Render service's outbound IP ranges in Atlas Network Access. Use a database name for this application and keep its data; do not delete databases/volumes to deploy. Atlas supports an [IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

Collect a Gemini API key from your Google project/AI Studio and enable YouTube Data API v3 for the YouTube key. The currently documented example model IDs below support the required Interactions/text and speech paths; confirm access/quota in your own Google project. [Text Interactions models](https://ai.google.dev/gemini-api/docs/interactions-overview), [speech models](https://ai.google.dev/gemini-api/docs/speech-generation).

Write down the actual existing frontend and backend HTTPS origins from their dashboards. Keep backend secrets in Render settings, never in chat, GitHub or VITE_ variables.

## 2. Configure the existing Render web service

Open the service's **Settings / Build & Deploy**, connect the GitHub repository above and select `main`.

| Setting           | Value                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Runtime           | Node                                                                                            |
| Root directory    | Repository root; leave blank, not `server`                                                      |
| Build command     | `npm ci && npm run build -w @text-to-learn/contracts && npm run build -w @text-to-learn/server` |
| Start command     | `npm run start -w @text-to-learn/server`                                                        |
| Health-check path | `/ready`                                                                                        |

In **Environment**, add the following values privately:

```dotenv
NODE_ENV=production
NODE_VERSION=24.16.0
MONGOMS_DISABLE_POSTINSTALL=1
CLIENT_ORIGINS=<actual Vercel HTTPS origin, no trailing slash>
MONGODB_URI=<private Atlas application URI>
AUTH0_DOMAIN=<bare Auth0 domain, no https:// or trailing slash>
AUTH0_AUDIENCE=https://text-to-learn-api
GEMINI_API_KEY=<private Gemini key>
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts
GEMINI_TTS_VOICE=Kore
YOUTUBE_API_KEY=<private YouTube Data API key>
```

Replace placeholders; use your actual API identifier if different. Render supplies PORT. Preserve the existing service plan and database. Audio persists in MongoDB GridFS, so a Render disk is not needed for audio. Deploy `main` via **Manual Deploy / Deploy latest commit**. Check build/runtime logs, then open the actual backend `/health` and `/ready`: both should return 200. Missing required database/Auth0 configuration prevents startup; missing optional provider configuration produces controlled unavailable states. [Render Express guide](https://render.com/docs/deploy-node-express-app).

## 3. Configure the existing Vercel frontend project

Open **Settings / Git** and connect the same repository; use `main` as the production branch. In build settings:

| Setting          | Value                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Framework        | Vite                                                                                  |
| Root directory   | Repository root, not `client`                                                         |
| Node.js          | 24.x                                                                                  |
| Install command  | `npm ci`                                                                              |
| Build command    | `npm run build -w @text-to-learn/contracts && npm run build -w @text-to-learn/client` |
| Output directory | `client/dist`                                                                         |

Add these **Production** environment variables:

```dotenv
VITE_AUTH0_DOMAIN=<same bare Auth0 domain>
VITE_AUTH0_CLIENT_ID=<public SPA client ID>
VITE_AUTH0_AUDIENCE=https://text-to-learn-api
VITE_API_URL=<actual Render HTTPS origin, no /api or trailing slash>
```

Redeploy `main` after saving the settings. The committed `vercel.json` handles lesson-route refreshes; frontend env changes require a new build. [Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite).

## 4. Finish Auth0 and CORS

In the Auth0 SPA settings, add the actual frontend HTTPS origin to **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**, then save. Ensure a login connection is enabled for the SPA. The callback is the site origin. Confirm Render CLIENT_ORIGINS contains that exact origin; if it changed, update it and redeploy the backend. Add explicitly intended preview origins individually if you want preview login/API access.

## 5. Check the live app

Open the frontend, sign in, submit a topic, open a lesson and answer a quiz. Reopen/refresh the lesson and library; saved content/progress should remain. Test videos, Hinglish/audio playback/download and PDF export. Refresh a direct lesson URL. Mark a lesson complete twice, then confirm one saved completion. A second account must not read another owner's course/lesson/audio. Restart/redeploy the backend and confirm saved data/audio remain. An enhancement error should leave the lesson usable.

If `/ready` fails, inspect Atlas connectivity/replica-set configuration and backend startup. If login fails, compare the three allowed-origin lists, domain and audience. If the frontend cannot reach the API, check VITE_API_URL and CLIENT_ORIGINS; rebuild frontend after changing its values. If generation fails, inspect model access/quota and the safe app error before controlled retry.

Share only the final frontend and backend public URLs for a hosted smoke check. Keep secrets private. The [full runbook](DEPLOYMENT.md) covers recovery, update/rollback and remaining submission checks.
