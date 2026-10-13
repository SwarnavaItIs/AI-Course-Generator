// Smoke the built production client with the real Auth0 SDK, never the login fixture.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:4180';
const preview = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4180',
    '--strictPort',
  ],
  { cwd: resolve('client'), stdio: 'ignore', windowsHide: true },
);
const exited = new Promise<void>((done, reject) => {
  preview.once('exit', () => done());
  preview.once('error', reject);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: unknown[] = [];
try {
  const end = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < end) {
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(500) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for Vite preview. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  expect(ready).toBe(true);
  const html = await readFile('client/dist/index.html', 'utf8');
  expect(html).toContain('/assets/');
  expect(html).not.toContain('/src/main');
  browser = await chromium.launch();
  await mkdir('artifacts/screenshots/production', { recursive: true });
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Follow your curiosity.' })).toBeVisible();
    await expect(
      page.getByText('Sign-in is currently unavailable. The sample is open for you to explore.'),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/screenshots/production/${name}-production-welcome.png`,
      fullPage: true,
    });
    await page.goto(`${origin}/sample`);
    await page.getByRole('link', { name: 'Start learning' }).click();
    await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
    await expect(page.locator('.code-block .hljs-name').first()).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'What happens when you open a website?' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `artifacts/screenshots/production/${name}-production-lesson.png`,
      fullPage: true,
    });
    await page.goto(`${origin}/library`);
    await expect(
      page.getByRole('heading', { name: 'A place for your next chapter.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to continue' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate my course' })).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.close();
    results.push({
      viewport: name,
      width,
      height,
      status: 'PASS',
      checks: [
        'built hashed assets',
        'real SDK unconfigured state',
        'public lesson navigation and code',
        'SPA lesson deep-link refresh on local Vite preview',
        'no horizontal overflow',
        'private library unavailable without Auth0',
        'no runtime page errors',
      ],
    });
  }
  const report = {
    checkedAt: new Date().toISOString(),
    environment:
      'Local production build + Vite preview; real Auth0 SDK, no fixture login/provider or configured backend. Not a deployed Vercel/Render smoke or actual login.',
    status: 'PASS',
    results,
  };
  await writeFile('artifacts/production-ui.json', `${JSON.stringify(report, null, 2)}\n`);
  console.info(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
  await exited;
}
