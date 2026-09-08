import { chromium } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const media = fileURLToPath(new URL('../../docs/media/', import.meta.url));
await mkdir(media, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', recordVideo: { dir: media, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
// Pauses are intentional reading time for the recording, not test synchronization.
const pause = (ms = 4000) => page.waitForTimeout(ms);
try {
  await page.goto(process.env.NODEFLOW_DEMO_URL ?? 'http://127.0.0.1:8011');
  await pause(2000);
  await page.screenshot({ path: `${media}/studio.png` });
  await page.getByRole('button', { name: 'Templates and workspace settings' }).click();
  await pause();
  await page.getByRole('button', { name: 'Use Data Quality Gate template' }).click();
  await page.getByRole('button', { name: 'Replace workflow', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: /Select Dataset metrics node/ }).click();
  const data = page.getByRole('textbox', { name: /Default JSON/ });
  await data.fill('{"qualityScore":0.95,"records":256,"invalidRecords":3}');
  await data.blur();
  await pause();
  const run = async () => {
    await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
    await page.getByText('Workflow completed', { exact: true }).waitFor();
    await pause();
  };
  await run();
  await page.getByRole('button', { name: 'View final output' }).click();
  await pause(5000);
  await page.screenshot({ path: `${media}/debugger.png` });
  await page.getByRole('button', { name: /Select Normalize metrics node/ }).click();
  await page.getByRole('textbox', { name: /Expression/ }).fill('@.missing');
  await page.getByRole('textbox', { name: /Expression/ }).blur();
  await pause();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await page.getByText('Workflow stopped at Normalize metrics').waitFor();
  await pause();
  await page.getByRole('button', { name: 'View error', exact: true }).click();
  await pause(5000);
  await page.getByRole('textbox', { name: /Expression/ }).fill('@');
  await page.getByRole('textbox', { name: /Expression/ }).blur();
  await pause();
  await run();
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await pause();
  await page.getByRole('button', { name: 'Replay', exact: true }).first().click();
  const slider = page.getByRole('slider', { name: 'Replay event sequence' });
  await slider.fill('0');
  await pause();
  await slider.fill('15');
  await pause();
  await slider.fill(await slider.getAttribute('max'));
  await pause(5000);
} finally {
  await context.close();
  await rename(await page.video().path(), `${media}/walkthrough.webm`);
  await browser.close();
}
