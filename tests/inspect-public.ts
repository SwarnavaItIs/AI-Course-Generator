// Inspect the normal Vite client using the real SDK, without the browser-test alias.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

await mkdir('docs/weeks/week-1/screenshots', { recursive: true });
const browser = await chromium.launch();
const results: unknown[] = [];
try {
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/');
    await expect(page.getByRole('heading', { name: 'Follow your curiosity.' })).toBeVisible();
    await expect(
      page.getByText('Sign-in is currently unavailable. The sample is open for you to explore.'),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/weeks/week-1/screenshots/${name}-public-welcome.png`,
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Explore the sample', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Web foundations: from browser to build' }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: 'Connect the pieces', exact: true })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(
      page.getByRole('link', { name: 'Back to my library', exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `docs/weeks/week-1/screenshots/${name}-public-course.png`,
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Start learning', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'What happens when you open a website?' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'What happens when you open a website?' }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: `docs/weeks/week-1/screenshots/${name}-public-lesson.png`,
      fullPage: true,
    });
    await page.goto('http://127.0.0.1:5173/library');
    await expect(
      page.getByRole('heading', { name: 'A place for your next chapter.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to continue' })).toHaveCount(0);
    expect(errors).toEqual([]);
    results.push({
      viewport: name,
      width,
      height,
      status: 'PASS',
      checks: [
        'real SDK unconfigured state',
        'public sample navigation',
        'lesson deep-link refresh',
        'no horizontal overflow',
        'protected library',
        'no runtime errors',
      ],
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  'docs/weeks/week-1/public-ui.json',
  `${JSON.stringify({ environment: 'Normal local Vite client; no auth fixtures; no backend credentials.', results }, null, 2)}\n`,
);
console.info(JSON.stringify(results, null, 2));
