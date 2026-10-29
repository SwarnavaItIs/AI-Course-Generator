# Demo

The application is implemented and tested locally. A public deployment and the recorded demonstration are still outstanding. Use the [deployment guide](deployment.md) to configure the hosts before recording the complete live flow.

## Preparation

Use a signed-in account and a ready course alongside one new topic request. Check provider quota and rehearse with the configured models. Keep secrets and hosting environment panels off screen. Save one generated lesson with videos and a Hinglish transcript/audio so variable provider latency does not consume the demonstration.

If a new request is still running, show its saved status and switch to the previously generated example. Explain the switch. Test fixtures can be used for rehearsal when labelled, but they do not demonstrate real login, model quality or speech pronunciation.

## Five-minute script and shot list

### 0:00–0:30 — Problem

**Show:** The welcome page and the course library.

“Starting a new subject often means collecting disconnected articles and videos. Text to Learn gives that topic an ordered path: modules, lessons, objectives, readings and practice questions. It keeps the material and progress together, so you can return to the same course instead of generating a different answer every time. The public sample lets you explore the lesson format before signing in.”

### 0:30–1:20 — Course creation

**Show:** Sign in, enter `Python for beginners`, submit, then show the saved outline or a previously generated example.

“I’ll enter a topic and submit it. The backend saves the request before generation starts, so leaving the page does not lose the job. A ready course contains three to six modules, with three to five lessons in each. Each lesson already has objectives, key topics and suggested resources. Here the order should move from basic concepts toward application. A broad topic needs a clear scope. Structural validation checks the counts and required fields, while curriculum quality still needs human review.”

### 1:20–2:15 — Rich lesson and quiz

**Show:** Open a lesson, scroll through headings and code, answer a quiz question, navigate to another lesson, then reopen the ready lesson.

“Lesson content is generated when opened, then stored. This view combines explanations, relevant examples and four or five practice questions. Selecting an answer shows an explanation; the quiz is a learning aid, not a graded certification. Code is highlighted as text and is never executed. Approved catalogue readings have links. Other resource suggestions are labelled unverified. Previous and next controls follow the saved curriculum. Reopening this lesson uses its stored content rather than asking the provider to write it again.”

### 2:15–3:10 — Videos and Hinglish

**Show:** Find videos, display the title/channel and load an embed. Open the Hinglish transcript, then play and download a few seconds of saved audio.

“Video search finds existing YouTube videos using the lesson's queries. The backend filters for public, embeddable results and caches the search. Hinglish explanation is a separate request that aims to preserve the original meaning and keep technical terms in English. The transcript remains readable even without audio. Speech uses that saved transcript and a configured model and voice. Playback starts only when I press play. Audio is checked as WAV, saved in GridFS and downloaded through an authenticated endpoint. A video or speech failure leaves the original lesson available.”

### 3:10–3:45 — PDF and progress

**Show:** Export the lesson, open the PDF's first and final pages, mark completion and refresh the library.

“The PDF includes the full lesson, objectives, code, reading links, video references and quiz answers. A separate export layout paginates content before capture, so the sidebar and scroll position do not crop the result. Long text and code can split across pages. Completion is saved as a set: repeating the same update counts once. Refreshing the library shows the same progress.”

### 3:45–4:40 — Architecture and verification

**Show:** The README architecture diagram, the shared contract file, then GitHub Actions.

“The React client and Express server share TypeScript and Zod contracts. Auth0 access tokens identify the user; the server checks ownership through the parent course for lessons, media and progress. MongoDB transactions prevent partial courses from appearing ready. Workers claim persisted jobs with expiring leases, validate provider output, and publish only while they still own the lease. Jobs have bounded retries and recover after a restart. Recovery can repeat a provider call, so this does not promise exactly-once execution. Tests use isolated MongoDB, signed tokens and provider fixtures to exercise failures, ownership, caching, playback and long PDF coverage. Live-provider checks are separate.”

### 4:40–5:00 — Limits

**Show:** README limitations and the actual application URL if deployed.

“Generated lessons can still contain mistakes. Resource coverage is limited, PDF text is rasterized, and a sleeping backend pauses workers. Deployment, real login, provider quality and Hindi-English pronunciation must be verified separately from fixture tests. Those are the boundaries I would report alongside this demonstration.”

## Résumé bullets

- Built a React/TypeScript learning application with an Express API, Auth0 access-token validation and ownership checks across saved courses, lessons, media and progress.
- Implemented Gemini course and lesson generation with shared Zod validation, MongoDB-backed jobs, bounded retries, expiring leases and cached reopening.
- Added YouTube search, Hinglish transcripts, validated WAV audio in GridFS, lesson PDF export and idempotent completion updates.
- Verified failure and persistence paths with 61 automated tests, 24 desktop/mobile browser journeys, accessibility scans and long PDF coverage; configured GitHub Actions and Vercel/Render deployment.

These describe implemented work and automated checks. Do not add production usage, live quality scores, deployment URLs or performance improvements without measuring them.

## Recording status

**BLOCKED:** The full live demonstration needs configured Auth0, MongoDB and providers plus a public deployment. Browser screenshot tools are available; no narrated recording of the required live journey has been produced. After setup and live verification, record the script, check its duration and audio, and add the actual video file or URL to the README.
