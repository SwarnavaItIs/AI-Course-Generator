import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import type { ExportManifest } from '../../client/src/export/lesson-pdf.js';
test.beforeEach(async ({ request }) => {
  expect((await request.post('/__fixture/reset-rate-limit')).status()).toBe(204);
});

async function savedSample(page: import('@playwright/test').Page, name: string) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await page.getByRole('button', { name: 'Add sample course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save to my library' }).click();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
}
test('videos, Hinglish, real WAV playback/download, PDF and persistent progress work from the lesson', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Isolated video embed fixture</p>' }),
  );
  let posts = 0;
  page.on('request', (call) => {
    if (call.method() === 'POST' && /\/enhancements\//.test(call.url())) posts++;
  });
  await savedSample(page, `Week 3 ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Find videos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fixture learning video' })).toBeVisible();
  await expect(page.getByText('Test channel', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load video' }).click();
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  await expect(page.getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  await page.getByRole('button', { name: 'Explain in Hinglish' }).click();
  await expect(page.locator('.hinglish-transcript')).toContainText('Technical terms को English');
  await page.getByRole('button', { name: 'Generate audio' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio');
    return audio && audio.readyState >= 2;
  });
  expect(
    await page.locator('audio').evaluate((audio: HTMLAudioElement) => ({
      duration: audio.duration,
      paused: audio.paused,
      autoplay: audio.autoplay,
    })),
  ).toEqual({ duration: 1, paused: true, autoplay: false });
  await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.play());
  await page.waitForFunction(() => document.querySelector('audio')!.currentTime > 0.1);
  const audioDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download audio (.wav)' }).click();
  const audio = await audioDownload;
  const audioPath = await audio.path();
  const audioBytes = await readFile(audioPath!);
  expect(audioBytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(audioBytes.length).toBe(48044);
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByText('1 of 9 lessons completed', { exact: false })).toBeVisible();
  await mkdir('docs/weeks/week-3/screenshots', { recursive: true });
  await page.screenshot({
    path: `docs/weeks/week-3/screenshots/${testInfo.project.name}-enhancements.png`,
    fullPage: true,
  });
  const lessonUrl = page.url();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark as incomplete' })).toBeVisible();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  expect(posts).toBe(3);
  // Export from a closed outline and a scrolled lesson; dedicated print layout supplies all content.
  if ((await page.locator('.lesson-outline details').getAttribute('open')) !== null)
    await page.locator('.lesson-outline summary').click();
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export lesson PDF' }).click();
  const pdf = await pdfDownload;
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
  await page.goto('/library');
  await expect(
    page.locator('.course-card').filter({ hasText: `Week 3 ${testInfo.project.name}` }),
  ).toContainText('1 of 9');
  await page.goto(lessonUrl);
  await expect(page.getByRole('button', { name: 'Mark as incomplete' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as incomplete' }).click();
  await expect(page.getByText('0 of 9 lessons completed', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('failed explanation leaves quiz, videos, progress and PDF available; retry is explicit', async ({
  page,
}) => {
  await savedSample(page, 'Enhancement failure isolated');
  // Fail just this enhancement transport. Other lesson functions continue to use the actual fixture API.
  await page.route('**/enhancements/transcript', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'PROVIDER_FAILED',
          message: 'Explanation service unavailable.',
          requestId: 'fixture',
        },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Explain in Hinglish' }).click();
  await expect(page.getByRole('alert')).toContainText('Explanation service unavailable.');
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  await page.getByRole('button', { name: 'Find videos' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture learning video' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByRole('button', { name: 'Mark as incomplete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export lesson PDF' })).toBeEnabled();
  await page.unroute('**/enhancements/transcript');
  await page.getByRole('button', { name: 'Explain in Hinglish' }).click();
  await expect(page.locator('.hinglish-transcript')).toBeVisible();
});
test('long PDF has page-sized captures, every source character, readable wrapped code and final answers', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/sample');
  const directory = 'docs/weeks/week-3/pdf';
  await mkdir(directory, { recursive: true });
  const downloaded = page.waitForEvent('download');
  const manifest = await page.evaluate(
    async (fixturePath) => {
      const exporterPath = '/src/export/lesson-pdf.ts';
      const { createLessonPdf, downloadBlob } = await import(exporterPath);
      const { longLesson, longVideos } = await import(fixturePath);
      const { blob, manifest } = await createLessonPdf(longLesson, longVideos);
      downloadBlob(blob, 'long-lesson.pdf');
      return manifest as ExportManifest;
    },
    `/@fs/${resolve('tests/fixtures/long-lesson.ts').replace(/\\/g, '/')}`,
  );
  const download = await downloaded;
  const pdfPath = `${directory}/long-${testInfo.project.name}.pdf`;
  await download.saveAs(pdfPath);
  expect(manifest.pages.length).toBeGreaterThanOrEqual(10);
  expect(manifest.blocks.find((block) => block.kind === 'code')!.text).toContain(
    '// CODE_END_SENTINEL: all 90 lines included.',
  );
  for (const block of manifest.blocks) {
    const fragments = manifest.pages
      .flatMap((page) => page.fragments)
      .filter((fragment) => fragment.blockId === block.id);
    expect(fragments.map((fragment) => fragment.text).join('')).toBe(block.text);
    expect(fragments[0]!.start).toBe(0);
    expect(fragments.at(-1)!.end).toBe(block.text.length);
    for (let index = 1; index < fragments.length; index++)
      expect(fragments[index]!.start).toBe(fragments[index - 1]!.end);
  }
  expect(
    manifest.pages.every((page) =>
      page.fragments.every(
        (fragment) => fragment.top >= 0 && fragment.bottom <= manifest.bodyHeight + 0.5,
      ),
    ),
  ).toBe(true);
  expect(
    manifest.pages
      .at(-1)!
      .fragments.map((fragment) => fragment.text)
      .join(''),
  ).toContain('Explanation:');
  expect(
    manifest.blocks.some((block) =>
      block.text.includes('https://www.youtube.com/watch?v=AAAAAAAAAAA'),
    ),
  ).toBe(true);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    useSystemFonts: true,
  });
  const document = await loading.promise;
  expect(document.numPages).toBe(manifest.pages.length);
  const links: string[] = [];
  const unicodePage = manifest.pages.find((page) =>
    page.fragments.some((fragment) => fragment.text.includes('END_SENTINEL')),
  )!.number;
  for (let number = 1; number <= document.numPages; number++) {
    const pdfPage = await document.getPage(number),
      viewport = pdfPage.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pdfPage.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    expect(pixels.some((value, index) => index % 4 !== 3 && value < 150)).toBe(true);
    links.push(
      ...(await pdfPage.getAnnotations()).flatMap((item) => (item.url ? [item.url as string] : [])),
    );
    if ([1, Math.ceil(document.numPages / 2), document.numPages, unicodePage].includes(number))
      await writeFile(
        `${directory}/${testInfo.project.name}-page-${number}.png`,
        canvas.toBuffer('image/png'),
      );
    pdfPage.cleanup();
  }
  expect(links).toContain('https://www.youtube.com/watch?v=AAAAAAAAAAA');
  expect(links.some((link) => link.includes('developer.mozilla.org'))).toBe(true);
  await loading.destroy();
  await writeFile(
    `${directory}/manifest-${testInfo.project.name}.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
});
test('invalid persisted explanation stays failed on reopen until the learner retries', async ({
  page,
}, testInfo) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await page.getByLabel('Learning topic').fill(`Enhancement retry test ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Generate course', exact: true }).click();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await page.getByRole('button', { name: 'Explain in Hinglish' }).click();
  await expect(page.locator('.enhancement-error')).toContainText('2 of 4 attempts used.');
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry explanation' })).toBeVisible();
  await expect(page.locator('.hinglish-transcript')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry explanation' }).click();
  await expect(page.locator('.hinglish-transcript')).toBeVisible();
});
