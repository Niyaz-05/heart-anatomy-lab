import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';

/**
 * Phone, tablet and desktop layouts. The same file runs in every lab: it relies only on the shared
 * layout (`.app[data-layout]`, `.identity`, `.top-actions`, `.modes`, `.dock`, `aside.left`, `aside.right`).
 */
const SHOTS = 'docs/screenshots/responsive';
fs.mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  { name: 'phone', width: 390, height: 844, touch: true, layout: 'sheet' },
  { name: 'phone-landscape', width: 844, height: 390, touch: true, layout: 'landscape' },
  { name: 'tablet-portrait', width: 768, height: 1024, touch: true, layout: 'sheet' },
  { name: 'tablet-portrait-large', width: 820, height: 1180, touch: true, layout: 'sheet' },
  { name: 'tablet-landscape', width: 1024, height: 768, touch: true, layout: 'desktop' },
  { name: 'desktop', width: 1366, height: 820, touch: false, layout: 'desktop' },
] as const;

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

async function ready(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(900);
  return errors;
}
async function box(l: Locator) { return (await l.boundingBox())!; }
async function inside(page: Page, l: Locator) {
  const b = await box(l);
  const vp = page.viewportSize()!;
  expect(b.x, 'left edge').toBeGreaterThanOrEqual(-1);
  expect(b.y, 'top edge').toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width, 'right edge').toBeLessThanOrEqual(vp.width + 1);
  expect(b.y + b.height, 'bottom edge').toBeLessThanOrEqual(vp.height + 1);
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
/** Pick the first structure in the list, opening the drawer first where there is one. */
async function pickFirst(page: Page, layout: string) {
  if (layout !== 'desktop') await page.getByRole('button', { name: 'Structures', exact: true }).click();
  await expect(page.locator('aside.left')).toBeVisible();
  await page.locator('aside.left .struct-list button').first().click();
  await expect(page.locator('aside.right')).toBeVisible();
  if (layout !== 'desktop') await expect(page.locator('aside.left')).toBeHidden();
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}×${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch && size.width < 1024 });

    test(`layout fits the screen @smoke`, async ({ page }) => {
      const errors = await ready(page);
      await expect(page.locator('.app')).toHaveAttribute('data-layout', size.layout);
      await noHorizontalScroll(page);
      const top = page.locator('.top-actions');
      const dock = page.locator('.dock');
      for (const l of [page.locator('.identity h1'), top, dock]) await inside(page, l);
      expect(overlap(await box(top), await box(dock)), 'top bar and dock').toBe(0);
      expect(overlap(await box(page.locator('.identity h1')), await box(top)), 'title and modes').toBe(0);
      if (size.touch) {
        // Finger-sized controls in the top bar and the dock.
        const heights = await page.locator('.modes button:visible, .dock button:visible, .icon-button:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(43.5);
      }
      await page.screenshot({ path: `${SHOTS}/${size.name}-1-start.png` });

      await pickFirst(page, size.layout);
      const sheet = page.locator('aside.right');
      await inside(page, sheet);
      expect(overlap(await box(top), await box(sheet)), 'top bar and details').toBe(0);
      // At least a third of the screen is left for the model beside or above the details.
      const vp = page.viewportSize()!;
      const s = await box(sheet);
      const t = await box(top);
      const free = size.layout === 'sheet' ? vp.width * (s.y - (t.y + t.height)) : (s.x - (size.layout === 'desktop' ? (await box(page.locator('aside.left'))).x + (await box(page.locator('aside.left'))).width : 0)) * vp.height;
      expect(free / (vp.width * vp.height)).toBeGreaterThan(size.layout === 'landscape' ? 0.4 : 0.3);
      await noHorizontalScroll(page);
      await page.screenshot({ path: `${SHOTS}/${size.name}-2-details.png` });
      expect(errors).toEqual([]);
    });

    if (size.layout !== 'desktop') {
      test(`the sheet folds, opens and expands`, async ({ page }) => {
        await ready(page);
        await pickFirst(page, size.layout);
        const app = page.locator('.app');
        const sheet = page.locator('aside.right');
        const handle = page.locator('.sheet-handle');
        await expect(app).toHaveAttribute('data-sheet', 'half');
        const half = (await box(sheet)).height;
        if (size.layout === 'sheet') {
          await handle.click();
          await expect(app).toHaveAttribute('data-sheet', 'full');
          await page.waitForTimeout(300);
          expect((await box(sheet)).height).toBeGreaterThan(half);
          await inside(page, sheet);
          expect(overlap(await box(page.locator('.top-actions')), await box(sheet)), 'full sheet stays below the top bar').toBe(0);
        }
        await handle.click();
        await expect(app).toHaveAttribute('data-sheet', 'peek');
        await page.waitForTimeout(300);
        const peek = await box(sheet);
        expect(peek.height).toBeLessThan(80);
        // Folded, the details leave the dock free.
        expect(overlap(peek, await box(page.locator('.dock'))), 'peek and dock').toBe(0);
        await page.screenshot({ path: `${SHOTS}/${size.name}-3-peek.png` });
        await handle.click();
        await expect(app).toHaveAttribute('data-sheet', 'half');
        // Keyboard users step through the heights too.
        await handle.focus();
        await page.keyboard.press('Enter');
        await expect(app).not.toHaveAttribute('data-sheet', 'half');
        if (size.layout === 'sheet') {
          // Dragging the handle up snaps the sheet to full.
          await handle.click();
          await handle.click();
          await expect(app).toHaveAttribute('data-sheet', 'half');
          await page.waitForTimeout(400); // let the height animation finish before measuring
          const h = await box(handle);
          await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
          await page.mouse.down();
          await page.mouse.move(h.x + h.width / 2, 40, { steps: 8 });
          await page.mouse.up();
          await expect(app).toHaveAttribute('data-sheet', 'full');
        }
      });
    }

    test(`every mode fits`, async ({ page }) => {
      const errors = await ready(page);
      const modes = page.locator('.modes button');
      const n = await modes.count();
      for (let i = 0; i < n; i++) {
        await modes.nth(i).click();
        await page.waitForTimeout(500);
        await noHorizontalScroll(page);
        const sheet = page.locator('aside.right');
        if (await sheet.count()) {
          await inside(page, sheet);
          // The panel scrolls to its end inside the screen.
          await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
          const last = await sheet.evaluate((el) => {
            const kids = el.querySelectorAll('*');
            const lastEl = kids[kids.length - 1]!;
            return { bottom: lastEl.getBoundingClientRect().bottom, sheet: el.getBoundingClientRect().bottom };
          });
          expect(last.bottom).toBeLessThanOrEqual(last.sheet + 1);
        }
        await page.screenshot({ path: `${SHOTS}/${size.name}-mode-${i + 1}.png` });
      }
      expect(errors).toEqual([]);
    });
  });
}
