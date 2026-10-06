import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__fixture/reset-rate-limit')).status()).toBe(204);
});
async function audit(page: Page, name: string, project: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await mkdir('docs/weeks/week-4/accessibility', { recursive: true });
  await writeFile(
    `docs/weeks/week-4/accessibility/${project}-${name}.json`,
    `${JSON.stringify({ url: new URL(page.url()).pathname, viewport: page.viewportSize(), engine: result.testEngine, status: result.violations.length ? 'FAIL' : 'PASS', violations: result.violations, incomplete: result.incomplete.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) })), passedRules: result.passes.length }, null, 2)}\n`,
  );
  expect
    .soft(
      result.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
      })),
    )
    .toEqual([]);
}
test('public and saved learning pages pass available WCAG scans and keyboard navigation', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Follow your curiosity.' })).toBeVisible();
  await audit(page, 'welcome', testInfo.project.name);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.goto('/sample');
  await audit(page, 'sample-course', testInfo.project.name);
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  await audit(page, 'sample-lesson', testInfo.project.name);
  await page.goto('/library');
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here.' })).toBeVisible();
  await audit(page, 'private-library', testInfo.project.name);
  await page.getByRole('button', { name: 'Add sample course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill('Accessible learning path');
  await page.getByRole('button', { name: 'Save to my library' }).click();
  await expect(
    page.getByRole('heading', { name: 'Accessible learning path', exact: true }),
  ).toBeVisible();
  await audit(page, 'private-course', testInfo.project.name);
  await page.getByRole('button', { name: 'Delete this course' }).click();
  await expect(page.getByRole('button', { name: 'Keep course' })).toBeFocused();
  await audit(page, 'delete-dialog', testInfo.project.name);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page.getByRole('button', { name: 'Explain in Hinglish' })).toBeVisible();
  await page.getByRole('button', { name: 'Explain in Hinglish' }).click();
  await expect(page.locator('.hinglish-transcript')).toBeVisible();
  await page.getByRole('radio').first().check();
  await audit(page, 'private-lesson', testInfo.project.name);
  await page.getByRole('radio').nth(1).check();
  await audit(page, 'private-quiz-retry', testInfo.project.name);
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.locator('.sidebar-brand a')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.sidebar-brand a')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  }
});
test('lesson reflows at narrow/tablet widths and 200 percent text sizing with reduced motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sample');
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(page.locator('.code-block .hljs-name').first()).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const before = await page
    .locator('.lesson-prose > p')
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const textRules = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('body,body *'))
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const size = parseFloat(getComputedStyle(element).fontSize);
        const parts: string[] = [];
        let current: Element | null = element;
        while (current && current !== document.body) {
          parts.unshift(
            current.id
              ? `#${CSS.escape(current.id)}`
              : current.tagName.toLowerCase() +
                  Array.from(current.classList)
                    .map((name) => `.${CSS.escape(name)}`)
                    .join(''),
          );
          current = current.parentElement;
        }
        return `body${parts.length ? ' > ' + parts.join(' > ') : ''}{font-size:${size * 2}px !important;}`;
      })
      .join('\n'),
  );
  // Class/ID selectors survive React's transient siblings and lazy-content replacement.
  await page.addStyleTag({ content: textRules });
  await expect
    .poll(() =>
      page
        .locator('.lesson-prose > p')
        .first()
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    )
    .toBe(before * 2);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Export lesson PDF' })).toBeVisible();
  await mkdir('docs/weeks/week-4/screenshots', { recursive: true });
  await page.screenshot({
    path: `docs/weeks/week-4/screenshots/${testInfo.project.name}-reflow.png`,
    fullPage: true,
  });
});
