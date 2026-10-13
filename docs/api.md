# API reference

JSON uses the schemas in `packages/contracts/src/index.ts`. All domain IDs are UUIDs; positions only control ordering. API error responses have `{ "error": { "code": "…", "message": "…", "requestId": "…" } }`, and `X-Request-Id` is set. Never send owner/user IDs as input. Another owner's records return the same 404 as nonexistent records.

| Method/path                                              | Authentication                          | Success                                                                                |
| -------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| GET `/health`                                            | Public                                  | 200 `{status:"ok"}`                                                                    |
| GET `/ready`                                             | Public                                  | 200 `{status:"ready"}` or 503 `{status:"not_ready"}`                                   |
| GET `/api/sample`                                        | Public                                  | 200 `{course: CourseDetail}` for the labelled authored catalogue sample                |
| GET `/api/sample/lessons/:lessonId`                      | Public                                  | 200 `{lesson: Lesson}` from that same public sample                                    |
| GET `/api/courses`                                       | Bearer access token                     | 200 `{courses: CourseSummary[]}`, own courses in all states, newest first, maximum 100 |
| POST `/api/courses`                                      | Bearer access token                     | Sample 201, topic 202 or cached-ready 200 `{course: CourseDetail}`; Location           |
| GET `/api/courses/:courseId`                             | Bearer + parent ownership               | 200 `{course: CourseDetail}`                                                           |
| GET `/api/courses/:courseId/lessons/:lessonId`           | Bearer + parent/module reference checks | 200 `{lesson: Lesson}`                                                                 |
| DELETE `/api/courses/:courseId`                          | Bearer + parent ownership               | 204; atomic removal of course/modules/lessons/progress/jobs in any state               |
| POST `/api/courses/:courseId/retry`                      | Bearer + parent ownership               | 202 while generating, otherwise 200 `{course}`                                         |
| POST `/api/courses/:courseId/lessons/:lessonId/generate` | Bearer + ready parent/module ownership  | 202 while generating, otherwise 200 `{lesson}`                                         |

## Create a course

Sample create body is `{ "templateId": "web-foundations", "title": "Optional custom title" }`, returning 201. Optional trimmed title is 3–120 characters. Topic create body is `{ "topic": "Python for beginners", "requestId": "client-generated UUID" }`; trimmed topic is 3–300 characters. Topic POST returns 202 with a persisted pending course and Location, or 200 when that request already has a ready course. Unknown fields, including ownership, are rejected. A unique owner/requestId index prevents duplicate creation. Reuse the same UUID when retrying an uncertain submission; a changed topic with that UUID returns 409 REQUEST_CONFLICT. Deleting the course removes its request record, permitting subsequent reuse of that UUID.

## Generation and retries

Course retry body is `{}` (the shared request schema also permits an optional retry boolean). Lesson generation body is `{}` or `{ "retry": true }`. Ready lessons return cached content without invoking Gemini. Queued/running requests return the existing target/job. Failed lessons remain failed unless retry is true. Course retry queues a failed job; ready/generating courses remain unchanged. Attempt counters never reset. The limits are three queued/running jobs per owner and 100 courses. UI polling uses GET every two seconds for up to five minutes per load, then leaves Check status available. GET does not initiate provider work.

## Response schemas

CourseSummary: id, title, description, tags, isSample, generationState, moduleCount, lessonCount, completedLessonCount, ISO createdAt/updatedAt and optional generation info. CourseDetail adds ordered modules and completedLessonIds. Ready courses have 3–6 modules, 3–5 lessons/module and 9–30 total lessons. Pending/failed outlines have zero counts and an empty modules array. Detail validation enforces unique IDs, parent references, contiguous zero-based positions, matching counts and completion references. Every generated outline lesson has IDs, title/description, objectives (1–8), keyTopics (1–10), resources (1–8) and generationState. Outline readiness means metadata is ready; its lessons initially have not_started content.

Lesson adds contentVersion, nullable SHA-256 contentHash, nullable content and optional generation info. Content has blocks and 4–5 MCQs. Blocks discriminate `heading{text}`, `paragraph{text}`, `code{language,code}`, `callout{title,text}`. MCQs have question/options/correctAnswerIndex/explanation; indexes must be in range and options distinct. Generated content additionally requires 3–80 blocks with headings and paragraphs, distinct quiz questions and 1–3 videoQueries. The authored sample retains its shape. Ready requires content; every other state requires null content. Generated hashes include content/model/promptVersion/contentVersion; reopening preserves them even if model configuration later changes.

Generation info: `{attempts:0..4,maxAttempts:4,canRetry:boolean,error:{code,message}|null}`. Errors appear only for failed jobs. Initial automatic attempts stop at two; manual retry permits remaining attempts up to four total. Nonretryable provider/configuration errors can stop automatic attempts early. Recovery consumes the same bound. Internal job leases/tokens, owners, model metadata and raw provider errors are omitted from API JSON; poll the owned course/lesson.

Resources have title, nullable HTTPS url and source (`catalogue` or `unverified_suggestion`). Provider drafts accept only `{catalogueId:string|null,title}`. Unknown IDs are rejected; accepted IDs resolve to the server catalogue's own title/URL; unresolved suggestions get url:null. Generated URLs are rejected as unknown fields and never fetched. Video search uses lesson videoQueries; saved authored samples use a bounded title/topic query.

States: `not_started`, `generating`, `ready`, `failed`. Topic submission persists generating immediately. Complete validation and fenced transactions publish ready; invalid output and partial writes never become ready. Sample copies remain authored and get fresh IDs; public IDs do not grant saved-copy access. Deleting parent/jobs atomically prevents orphan publication.

## Errors

Errors: 400 invalid input/IDs/JSON, 401 invalid token, 403 unapproved origin, 404 missing/not-owned, 409 COURSE_LIMIT / REQUEST_CONFLICT / RETRY_LIMIT, 413 oversized body, 429 RATE_LIMITED / GENERATION_LIMIT, 503 database/provider configuration unavailable, 500 safe internal error. Accepted upstream failures appear as persisted generation errors, not synthetic success or raw exceptions. Personal responses use no-store; lesson reuse is a database cache. Rate-limit headers expose reset information; readiness omits database details.

## Lesson tools and progress

All paths below start with `/api/courses/:courseId/lessons/:lessonId`; UUID/parent/module/ready lesson checks apply and only verified sub supplies ownership. Request bodies are strict; ownership, model, voice and arbitrary URLs cannot be supplied by clients.

| Method/suffix              | Body                                                 | Success                                                                          |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| GET `/enhancements`        | none                                                 | 200 `{enhancements: {videos,transcript,audio}}`; reads only, never provider work |
| POST `/enhancements/:kind` | `{}` or `{retry:true}`; kind videos/transcript/audio | 202 while generating, otherwise cached/failed 200 `{enhancements}`               |
| GET `/audio/:assetId`      | none; optional single Range header                   | Protected 200 audio/wav or 206 range; 416 unsatisfiable/malformed range          |
| POST `/completion`         | `{completed:boolean}`                                | 200 `{course:CourseDetail}` with persisted set-based progress                    |

Every enhancement has `{state:not_started|generating|ready|failed,available:boolean,generation?:GenerationInfo}`. `available` indicates current configuration; cached ready variants can remain readable with the model configured even when its key is absent. Videos adds `items` (0–3 `{id,title,channel}`; ID exactly eleven safe YouTube characters). Transcript adds nullable `text` (80–6000 characters, nonnull iff ready). Audio adds nullable `asset` (nonnull iff ready) with `{id,mimeType:"audio/wav",bytes:44..12000000,durationSeconds:0..240}`; duration must be positive. No owners/internal file IDs/cache keys/provider details are serialized. Empty video arrays are valid ready results, distinct from failures.

Requests coalesce on unique source/version/model/language/voice/prompt/transcript cache identity. Ready/generating repeats reuse the record; failed repeats remain failed unless retry:true. Initial two automatic attempts, total four after retry; max three active jobs per owner across all kinds. Audio requires a matching ready transcript, otherwise 409 TRANSCRIPT_REQUIRED. Not-ready lessons return 409 LESSON_NOT_READY; an in-flight changed source can return 409 LESSON_CHANGED. Missing configuration returns 503 without queuing synthetic results. Job failures expose safe persisted error/attempt/retry info. Client polls every 1.5 seconds up to five minutes and retains Check enhancement status.

Video cache expires on the next UTC day, at most 24 hours. Transcript/audio caches use the current configured model and relevant voice plus source/transcript hash. Different configuration starts a new variant; matching reopening uses stored content/audio. Audio reads also validate that the source-linked enhancement references this owned ready asset. Headers include exact Content-Length, Accept-Ranges, Content-Range for partial reads, Content-Disposition with a safe UUID WAV filename and no-store. Bearer auth is mandatory; no query-token bypass. The browser uses authenticated blob reads for playback/download.

Completion uses `$addToSet` when true and `$pull` when false; duplicate/concurrent writes do not double-count. Only generated ready content can be completed. Course detail, library summaries and next incomplete navigation read the same owned Progress record. Deleting a course atomically removes progress/enhancement/job records and marks audio assets deleting; asynchronous durable GridFS cleanup follows, including restart/interrupted-upload recovery. PDF is a client-only export of the full ready typed lesson; no new public/private server route is needed.
