import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ request }) => {
  expect((await request.post('/__fixture/reset-rate-limit')).status()).toBe(204);
});

test('topic generation persists rich lessons, quizzes and cached reopening', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let lessonRequests = 0;
  page.on('request', (call) => {
    if (call.method() === 'POST' && /\/lessons\/[^/]+\/generate$/.test(call.url()))
      lessonRequests++;
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await page.getByLabel('Learning topic').fill('Python for beginners');
  await mkdir('docs/weeks/week-2/screenshots', { recursive: true });
  await page.screenshot({
    path: `docs/weeks/week-2/screenshots/${testInfo.project.name}-topic.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Generate course', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preparing your course…' })).toBeVisible();
  await page.screenshot({
    path: `docs/weeks/week-2/screenshots/${testInfo.project.name}-pending.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole('heading', { name: 'Python: from values to small programs', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start learning' })).toBeVisible();
  const courseUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Python: from values to small programs', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Build a small quiz program', exact: false })
    .scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/weeks/week-2/screenshots/${testInfo.project.name}-course.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page.getByRole('heading', { name: 'Preparing your lesson…' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  await expect(page.locator('.quiz-question')).toHaveCount(4);
  await expect(page.locator('.code-block .hljs-string').first()).toBeVisible();
  await page.getByRole('radio', { name: 'String', exact: true }).check();
  await expect(page.getByRole('status').filter({ hasText: 'That’s right.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Python: official tutorial' })).toHaveAttribute(
    'href',
    'https://docs.python.org/3/tutorial/',
  );
  await expect(page.getByText('Unverified suggestion', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Video search ideas' })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByRole('link', { name: 'Course overview', exact: true })).toBeInViewport();
  await page.screenshot({
    path: `docs/weeks/week-2/screenshots/${testInfo.project.name}-lesson.png`,
    fullPage: true,
  });
  const initialRequests = lessonRequests;
  const lessonUrl = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  expect(lessonRequests).toBe(initialRequests);
  await page.goto('/library');
  await expect(
    page.getByRole('heading', { name: 'Python: from values to small programs', exact: true }),
  ).toBeVisible();
  await page.goto(lessonUrl);
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  expect(lessonRequests).toBe(initialRequests);
  await page.getByRole('link', { name: 'UP NEXT Names and assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Names and assignment', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'PREVIOUS LESSON Values and types' }).click();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto(courseUrl);
  expect(errors).toEqual([]);
});

test('failed lesson reopening stays failed until an explicit retry', async ({ page }, testInfo) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await page.getByLabel('Learning topic').fill(`Lesson retry test ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Generate course', exact: true }).click();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page.getByRole('alert')).toContainText('Your lesson needs another try');
  await expect(page.getByRole('alert')).toContainText('2 of 4 attempts used');
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry generation' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry generation' }).click();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
});

test('invalid generation shows a controlled retry and becomes a saved valid course', async ({
  page,
}, testInfo) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await page.getByLabel('Learning topic').fill(`Retry generation test ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Generate course', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your course needs another try');
  await expect(page.getByRole('alert')).toContainText('2 of 4 attempts used');
  await expect(page.getByRole('link', { name: 'Start learning' })).toHaveCount(0);
  await page.screenshot({
    path: `docs/weeks/week-2/screenshots/${testInfo.project.name}-failure.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry generation' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry generation' }).click();
  await expect(page.getByRole('link', { name: 'Start learning' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Python: from values to small programs', exact: true }),
  ).toBeVisible();
});
