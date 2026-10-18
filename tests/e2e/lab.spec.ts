import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/${query}`);
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 45_000 });
  // let the camera flight and first frames settle
  await page.waitForTimeout(1200);
}
const detailTitle = (page: Page) => page.locator('#detail-title');

test('loads the model without console errors', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Human Heart', level: 1 })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-initial.png` });
  expect(errors).toEqual([]);
});

test('clicking the model selects the structure under the pointer', async ({ page }) => {
  await open(page);
  await ready(page);
  const box = (await page.locator('.viewer canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await expect(detailTitle(page)).toHaveText(/./);
  const picked = await detailTitle(page).textContent();
  // The selection is reflected in the list and as a scene label.
  await expect(page.locator('.struct-list button[aria-pressed="true"]')).toHaveText(new RegExp(picked!.replace(/[()]/g, '.')));
  await expect(page.locator('.scene-label.is-focus')).toBeVisible();
  // A drag rotates and must not change the selection.
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 260, { steps: 8 });
  await page.mouse.up();
  await expect(detailTitle(page)).toHaveText(picked!);
  await page.screenshot({ path: `${SHOTS}/02-selected.png` });
});

test('search finds by synonym and abbreviation; clearing restores the list', async ({ page }) => {
  await open(page);
  await ready(page);
  const search = page.getByLabel('Search structures');
  await search.fill('LAD');
  await expect(page.locator('.search-results button').first()).toContainText('Anterior interventricular artery');
  await search.press('Enter');
  await expect(detailTitle(page)).toHaveText('Anterior interventricular artery (LAD)');
  await search.fill('bicuspid');
  await expect(page.locator('.search-results button').first()).toContainText('Mitral valve');
  await search.fill('zzzz');
  await expect(page.getByText('No structure matches')).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('fieldset.layers')).toBeVisible();
});

test('layers hide and show structures', async ({ page }) => {
  await open(page);
  await ready(page);
  const rca = page.locator('.struct-list button', { hasText: 'Right coronary artery' });
  await expect(rca.locator('.tag')).toHaveCount(0);
  await page.getByLabel('Coronary arteries').uncheck();
  await expect(rca.locator('.tag')).toHaveText('hidden');
  await page.getByLabel('Coronary arteries').check();
  await expect(rca.locator('.tag')).toHaveCount(0);
  // The chambers start hidden and appear when their layer is turned on.
  const lv = page.locator('.struct-list button', { hasText: /^Left ventricle/ });
  await expect(lv.locator('.tag')).toHaveText('hidden');
  await page.getByLabel('Chambers (blood spaces)').check();
  await expect(lv.locator('.tag')).toHaveCount(0);
});

test('isolate, zoom and reset', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.locator('.struct-list button', { hasText: 'Mitral valve' }).click();
  await expect(detailTitle(page)).toHaveText('Mitral valve');
  await page.getByLabel('Isolate').check();
  await expect(page.locator('.struct-list button', { hasText: 'Aortic valve' }).locator('.tag')).toHaveText('hidden');
  await page.getByRole('button', { name: 'Zoom to' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/03-isolated-mitral.png` });
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(detailTitle(page)).toHaveCount(0);
  await expect(page.locator('.struct-list button', { hasText: 'Aortic valve' }).locator('.tag')).toHaveCount(0);
  await expect(page.getByLabel('Chambers (blood spaces)')).not.toBeChecked();
});

test('camera presets switch views', async ({ page }) => {
  await open(page);
  await ready(page);
  const canvas = page.locator('.viewer canvas');
  const front = await canvas.screenshot();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1200);
  const back = await canvas.screenshot();
  expect(Buffer.compare(front, back)).not.toBe(0);
  await page.screenshot({ path: `${SHOTS}/04-posterior.png` });
});

test('labels mode shows non-overlapping labels and hides occluded ones', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByLabel('Labels').check();
  await page.waitForTimeout(1200);
  const shown = page.locator('.scene-label[data-state="shown"]');
  expect(await shown.count()).toBeGreaterThanOrEqual(4);
  const boxes = await shown.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i]!, boxes[j]!];
    const overlap = !(a[2]! <= b[0]! || b[2]! <= a[0]! || a[3]! <= b[1]! || b[3]! <= a[1]!);
    expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
  }
  // From the front, the papillary muscles are inside the heart and must not be labelled.
  await expect(page.locator('.scene-label[data-structure="right-papillary-muscles"]')).toHaveAttribute('data-state', 'occluded');
  await page.screenshot({ path: `${SHOTS}/05-labels.png` });
});

test('blood-flow mode lists the circuit in order and can pause', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await page.getByRole('button', { name: 'Blood flow' }).click();
  const steps = page.locator('.flow-steps li');
  await expect(steps).toHaveCount(15);
  const text = (await steps.allTextContents()).join(' | ');
  const order = ['venae cavae', 'Right atrium', 'Tricuspid', 'Right ventricle', 'Pulmonary valve', 'Pulmonary trunk', 'Lungs', 'Pulmonary veins', 'Left atrium', 'Mitral', 'Left ventricle', 'Aortic valve', 'Aorta'];
  let at = -1;
  for (const o of order) {
    const i = text.indexOf(o, at + 1);
    expect(i, `"${o}" after position ${at}`).toBeGreaterThan(at);
    at = i;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/06-flow.png` });
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('guided tour navigates forward, back and finishes', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: 'Guided tour' }).click();
  await expect(page.getByText(/step 1 of 11/)).toBeVisible();
  await expect(page.getByRole('button', { name: '← Back' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByText(/step 3 of 11/)).toBeVisible();
  await expect(page.locator('#tour-title')).toHaveText('Through the tricuspid valve');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/07-tour-tricuspid.png` });
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByText(/step 2 of 11/)).toBeVisible();
  await page.locator('.tour-index button').last().click();
  await expect(page.getByText(/step 11 of 11/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('button', { name: 'Anatomy' })).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard: Escape clears the selection', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.locator('.struct-list button', { hasText: 'Aortic arch' }).click();
  await expect(detailTitle(page)).toHaveText('Aortic arch');
  await page.locator('.viewer').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(detailTitle(page)).toHaveCount(0);
});

test('phone layout: structures open from the dock and details follow a pick', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('aside.left')).toBeHidden();
  await page.getByRole('button', { name: 'Structures' }).click();
  await expect(page.locator('aside.left')).toBeVisible();
  await page.locator('.struct-list button', { hasText: 'Pulmonary trunk' }).click();
  await expect(page.locator('aside.left')).toBeHidden();
  await expect(detailTitle(page)).toHaveText('Pulmonary trunk');
  await page.screenshot({ path: `${SHOTS}/08-phone.png` });
});

test('details appear only after a selection; the main screen carries no disclaimer text', async ({ page }) => {
  await open(page);
  await ready(page);
  await expect(page.locator('aside.right')).toHaveCount(0);
  await expect(page.getByText('For learning only')).toHaveCount(0);
  await expect(page.getByText('You will learn to')).toHaveCount(0);
  await page.locator('.struct-list button', { hasText: 'Aortic valve' }).click();
  await expect(page.locator('aside.right')).toBeVisible();
  await expect(detailTitle(page)).toHaveText('Aortic valve');
  // Model note and sources are folded away until asked for.
  await expect(page.locator('details.more')).not.toHaveAttribute('open', '');
  await page.locator('details.more summary').click();
  await expect(page.locator('details.more')).toContainText('OpenStax');
});

test('the About sheet holds the credits and closes with Escape', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: /About this lab/ }).click();
  const dialog = page.getByRole('dialog', { name: 'About this lab' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('BodyParts3D');
  await expect(dialog).toContainText('CC Attribution 4.0');
  await expect(dialog).toContainText('For learning only');
  await page.screenshot({ path: `${SHOTS}/11-about.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Source & credits' }).click();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('without WebGL the learning content still works', async ({ page }) => {
  await open(page, '?nowebgl');
  await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible();
  await page.locator('.struct-list button', { hasText: 'Tricuspid valve' }).click();
  await expect(detailTitle(page)).toHaveText('Tricuspid valve');
  await page.screenshot({ path: `${SHOTS}/09-no-webgl.png` });
});

test('a missing model shows an error with a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/models/heart.glb', (route) => (fail ? route.fulfill({ status: 404, body: 'not found' }) : route.continue()));
  await page.goto('/');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The 3D model could not be loaded');
  await page.screenshot({ path: `${SHOTS}/10-model-error.png` });
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
});

test('reduced motion: flow mode works without animation errors', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  const errors = await open(page);
  await ready(page);
  await page.getByRole('button', { name: 'Blood flow' }).click();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
  await context.close();
});
