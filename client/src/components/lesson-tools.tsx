import { useEffect, useRef, useState } from 'react';
import {
  courseResponseSchema,
  enhancementsResponseSchema,
  type CourseDetail,
  type EnhancementKind,
  type Enhancements,
  type Lesson,
} from '@text-to-learn/contracts';
import { useApi, useAudioDownload } from '../api';
import { ErrorState } from './common';

function AudioPlayer({ path, filename }: { path: string; filename: string }) {
  const load = useAudioDownload();
  const [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState<unknown>(null),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setUrl(null);
    setError(null);
    void load(path, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [load, path, reload]);
  return (
    <div className="audio-player">
      {Boolean(error) && <ErrorState error={error} retry={() => setReload((value) => value + 1)} />}{' '}
      {!url && !error && <p role="status">Loading saved audio…</p>}{' '}
      {url && (
        <>
          <audio
            controls
            preload="metadata"
            src={url}
            onError={() =>
              setError(
                new Error(
                  'Your browser could not play this audio. You can download it and try again.',
                ),
              )
            }
          />
          <a className="button secondary" href={url} download={filename}>
            Download audio (.wav)
          </a>
        </>
      )}
    </div>
  );
}

export function LessonTools({
  lesson,
  course,
  preview,
  onCourse,
}: {
  lesson: Lesson;
  course: CourseDetail;
  preview: boolean;
  onCourse: (course: CourseDetail) => void;
}) {
  const api = useApi();
  const path = `/api/courses/${course.id}/lessons/${lesson.id}`;
  const [data, setData] = useState<Enhancements | null>(null),
    [loadError, setLoadError] = useState<unknown>(null),
    [reload, setReload] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<EnhancementKind, unknown>>>({}),
    [busy, setBusy] = useState<Partial<Record<EnhancementKind, boolean>>>({});
  const [openVideos, setOpenVideos] = useState<string[]>([]);
  const [completionBusy, setCompletionBusy] = useState(false),
    [completionError, setCompletionError] = useState<unknown>(null);
  const [exportBusy, setExportBusy] = useState(false),
    [exportStatus, setExportStatus] = useState(''),
    [exportError, setExportError] = useState<unknown>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const until = Date.now() + 300_000;
    const load = async () => {
      try {
        const result = await api(`${path}/enhancements`, enhancementsResponseSchema, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setData(result.enhancements);
        setLoadError(null);
        if (
          Object.values(result.enhancements).some((item) => item.state === 'generating') &&
          Date.now() < until
        )
          timer = setTimeout(() => {
            void load();
          }, 1500);
      } catch (failure) {
        if (!controller.signal.aborted) setLoadError(failure);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, path, preview, reload]);
  const request = async (kind: EnhancementKind, retry = false) => {
    setBusy((value) => ({ ...value, [kind]: true }));
    setErrors((value) => ({ ...value, [kind]: null }));
    try {
      const result = await api(`${path}/enhancements/${kind}`, enhancementsResponseSchema, {
        method: 'POST',
        body: { retry },
        signal: controllerRef.current?.signal,
      });
      setData(result.enhancements);
      setReload((value) => value + 1);
    } catch (failure) {
      if (!controllerRef.current?.signal.aborted)
        setErrors((value) => ({ ...value, [kind]: failure }));
    } finally {
      setBusy((value) => ({ ...value, [kind]: false }));
    }
  };
  const status = (kind: EnhancementKind, label: string) => {
    const value = data?.[kind];
    return (
      <>
        {Boolean(errors[kind]) && <ErrorState error={errors[kind]} />}{' '}
        {value?.state === 'generating' && (
          <p role="status">
            Preparing {label}… Your request is saved. You can return later. Attempt{' '}
            {value.generation?.attempts ?? 0} of 4.
          </p>
        )}{' '}
        {value?.state === 'failed' && (
          <div className="enhancement-error" role="alert">
            <p>{value.generation?.error?.message ?? `${label} could not finish.`}</p>
            <p>{value.generation?.attempts} of 4 attempts used.</p>
            {value.generation?.canRetry ? (
              <button
                className="button secondary"
                disabled={busy[kind]}
                onClick={() => {
                  void request(kind, true);
                }}
              >
                Retry {label}
              </button>
            ) : (
              <p>The retry limit has been reached.</p>
            )}
          </div>
        )}{' '}
        {value?.state === 'not_started' && !value.available && (
          <p className="muted">{label} is currently unavailable.</p>
        )}
      </>
    );
  };
  const completed = course.completedLessonIds.includes(lesson.id);
  const toggleCompletion = async () => {
    setCompletionBusy(true);
    setCompletionError(null);
    try {
      const result = await api(`${path}/completion`, courseResponseSchema, {
        method: 'POST',
        body: { completed: !completed },
        signal: controllerRef.current?.signal,
      });
      onCourse(result.course);
    } catch (failure) {
      if (!controllerRef.current?.signal.aborted) setCompletionError(failure);
    } finally {
      setCompletionBusy(false);
    }
  };
  const exportPdf = async () => {
    setExportBusy(true);
    setExportError(null);
    setExportStatus('Laying out full lesson…');
    try {
      const { createLessonPdf, downloadBlob } = await import('../export/lesson-pdf');
      const { blob } = await createLessonPdf(lesson, data?.videos.items ?? [], (page, total) =>
        setExportStatus(`Creating PDF · page ${page} of ${total}`),
      );
      downloadBlob(
        blob,
        `${lesson.title.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 80) || 'lesson'}.pdf`,
      );
      setExportStatus('Your full lesson PDF is ready.');
    } catch (failure) {
      setExportError(failure);
      setExportStatus('');
    } finally {
      setExportBusy(false);
    }
  };
  return (
    <section className="lesson-tools" aria-label="Lesson tools">
      <div className="lesson-actions">
        <button
          className="button secondary"
          disabled={exportBusy}
          onClick={() => {
            void exportPdf();
          }}
        >
          {exportBusy ? 'Creating PDF…' : 'Export lesson PDF'}
        </button>
        {!preview && (
          <button
            className="button primary"
            disabled={completionBusy}
            onClick={() => {
              void toggleCompletion();
            }}
          >
            {completionBusy
              ? 'Saving progress…'
              : completed
                ? 'Mark as incomplete'
                : 'Mark lesson complete'}
          </button>
        )}
      </div>
      {exportStatus && <p role="status">{exportStatus}</p>}
      {Boolean(exportError) && <ErrorState error={exportError} />}{' '}
      {Boolean(completionError) && <ErrorState error={completionError} />}{' '}
      {!preview && (
        <p className="saved-progress">
          {completed ? '✓ Lesson completed · ' : ''}
          {course.completedLessonCount} of {course.lessonCount} lessons completed
        </p>
      )}
      {preview ? (
        <p className="muted">
          Save a course to find videos, prepare a Hinglish explanation, and track your progress.
        </p>
      ) : (
        <>
          {Boolean(loadError) && (
            <ErrorState error={loadError} retry={() => setReload((value) => value + 1)} />
          )}
          {!data && !loadError && <p role="status">Loading lesson tools…</p>}
          {data && (
            <>
              <section className="enhancement-panel" aria-labelledby="videos-title">
                <p className="eyebrow">WATCH & LEARN</p>
                <h2 id="videos-title">Related videos</h2>
                <p>Existing YouTube videos found using this lesson’s search queries.</p>
                {data.videos.state === 'not_started' && (
                  <button
                    className="button secondary"
                    disabled={!data.videos.available || busy.videos}
                    onClick={() => {
                      void request('videos');
                    }}
                  >
                    Find videos
                  </button>
                )}
                {status('videos', 'videos')}
                {data.videos.state === 'ready' &&
                  (data.videos.items.length ? (
                    data.videos.items.map((video) => (
                      <div className="video-card" key={video.id}>
                        <h3>{video.title}</h3>
                        <p>{video.channel}</p>
                        {openVideos.includes(video.id) ? (
                          <iframe
                            title={video.title}
                            src={`https://www.youtube-nocookie.com/embed/${video.id}`}
                            loading="lazy"
                            allow="encrypted-media; picture-in-picture; fullscreen"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                        ) : (
                          <button
                            className="button secondary"
                            onClick={() => setOpenVideos((value) => [...value, video.id])}
                          >
                            Load video
                          </button>
                        )}
                        <a
                          href={`https://www.youtube.com/watch?v=${video.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Watch on YouTube ↗
                        </a>
                        <p className="muted">
                          If the embed is unavailable, open the video on YouTube. Availability can
                          change.
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>
                      No embeddable videos were found. Use the video search ideas above to search
                      independently.
                    </p>
                  ))}
              </section>
              <section className="enhancement-panel" aria-labelledby="hinglish-title">
                <p className="eyebrow">LISTEN IN YOUR LANGUAGE</p>
                <h2 id="hinglish-title">Hinglish explanation</h2>
                <p>A Hindi-English explanation that keeps the lesson’s technical terms.</p>
                {data.transcript.state === 'not_started' && (
                  <button
                    className="button secondary"
                    disabled={!data.transcript.available || busy.transcript}
                    onClick={() => {
                      void request('transcript');
                    }}
                  >
                    Explain in Hinglish
                  </button>
                )}
                {status('transcript', 'explanation')}
                {data.transcript.state === 'ready' && (
                  <>
                    <div className="hinglish-transcript" lang="hi">
                      {data.transcript.text?.split(/\n\s*\n/).map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                    <h3>Listen to the explanation</h3>
                    {data.audio.state === 'not_started' && (
                      <button
                        className="button secondary"
                        disabled={!data.audio.available || busy.audio}
                        onClick={() => {
                          void request('audio');
                        }}
                      >
                        Generate audio
                      </button>
                    )}
                    {status('audio', 'audio')}
                    {data.audio.asset && (
                      <>
                        <p className="muted">
                          Saved WAV audio · {Math.ceil(data.audio.asset.durationSeconds)} seconds
                        </p>
                        <AudioPlayer
                          path={`${path}/audio/${data.audio.asset.id}`}
                          filename={`${lesson.id}-hinglish.wav`}
                        />
                      </>
                    )}
                  </>
                )}
              </section>
              {Object.values(data).some((item) => item.state === 'generating') && (
                <button
                  className="button secondary"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Check enhancement status
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
