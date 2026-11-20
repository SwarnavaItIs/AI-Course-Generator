import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ request }) => {
  expect((await request.post('/__fixture/reset-rate-limit')).status()).toBe(204);
});

test('public sample supports deep links, quiz feedback and accessible mobile navigation', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Follow your curiosity.' })).toBeVisible();
  await mkdir('artifacts/screenshots/sample', { recursive: true });
  await page.screenshot({
    path: `artifacts/screenshots/sample/${testInfo.project.name}-welcome.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Explore the sample', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Web foundations: from browser to build' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(
    page.getByRole('heading', { name: 'What happens when you open a website?' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'What happens when you open a website?' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'The web browser', exact: true }).check();
  await expect(page.getByRole('status').filter({ hasText: 'That’s right.' })).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/sample/${testInfo.project.name}-lesson.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'UP NEXT Give content a meaningful structure' }).click();
  await expect(
    page.getByRole('heading', { name: 'Give content a meaningful structure', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Workspace navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('a missing highlighting module leaves code and the quiz readable', async ({ page }) => {
  const codeModule = '**/src/components/code.tsx*';
  const moduleFailed = page.waitForEvent('requestfailed', (request) =>
    new URL(request.url()).pathname.endsWith('/src/components/code.tsx'),
  );
  await page.route(codeModule, (route) => route.abort());
  await page.goto('/sample');
  await page.getByRole('link', { name: 'Start learning' }).click();
  await moduleFailed;
  await expect(page.locator('.code-block pre code').first()).toContainText('<!doctype html>');
  await page.getByRole('radio', { name: 'The web browser', exact: true }).check();
  await expect(page.getByRole('status').filter({ hasText: 'That’s right.' })).toBeVisible();
});

test('signed-in library saves, refreshes, navigates and deletes persistent courses', async ({
  page,
}, testInfo) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'A place for your next chapter.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add sample course', exact: true }).click();
  await page
    .getByLabel('Course title', { exact: true })
    .fill(`My ${testInfo.project.name} learning path`);
  await page.getByRole('button', { name: 'Save to my library' }).click();
  await expect(
    page.getByRole('heading', { name: `My ${testInfo.project.name} learning path` }),
  ).toBeVisible();
  const courseUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `My ${testInfo.project.name} learning path` }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(
    page.getByRole('heading', { name: 'What happens when you open a website?' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'What happens when you open a website?' }),
  ).toBeVisible();
  await page.goto('/library');
  await expect(
    page.getByRole('heading', { name: `My ${testInfo.project.name} learning path` }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/screenshots/sample/${testInfo.project.name}-library.png`,
    fullPage: true,
  });
  await page.goto(courseUrl);
  await page.getByRole('button', { name: 'Delete this course' }).click();
  await page.getByRole('button', { name: 'Keep course' }).click();
  await expect(
    page.getByRole('heading', { name: `My ${testInfo.project.name} learning path` }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete this course' }).click();
  await page.route(courseUrl.replace('/courses/', '/api/courses/'), (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>SPA fallback</html>' }),
  );
  await page.getByRole('button', { name: 'Delete course', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('unexpected response');
  await expect(page).toHaveURL(courseUrl);
  await page.unroute(courseUrl.replace('/courses/', '/api/courses/'));
  await page.getByRole('button', { name: 'Delete course', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here.' })).toBeVisible();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Follow your curiosity.' })).toBeVisible();
  await page.goto(courseUrl);
  await expect(page.getByRole('heading', { name: 'A place for your next chapter.' })).toBeVisible();
});

test('library failures offer retry and loading state resolves', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here.' })).toBeVisible();
  await page.route('**/api/courses', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'UNAVAILABLE',
          message: 'Your library is temporarily unavailable. Please try again.',
          requestId: 'browser-fixture-request',
        },
      }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Your library is temporarily unavailable');
  await page.unroute('**/api/courses');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here.' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);

  await page.route('**/api/courses', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>SPA fallback</html>' }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('unexpected response');
  await page.unroute('**/api/courses');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here.' })).toBeVisible();
});
