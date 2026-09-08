import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.goto(process.env.NODEFLOW_PROFILE_URL ?? 'http://127.0.0.1:3011');
  await page.getByRole('button', { name: /Select Incident input/ }).waitFor();
  await page.evaluate(() => {
    window.nodeflowMeasurements = [];
    document.addEventListener('click', () => {
      const start = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => window.nodeflowMeasurements.push(performance.now() - start)));
    }, true);
  });
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: /Select Incident input/ }).click();
    await page.getByRole('textbox', { name: 'Node name', exact: true }).fill(`Incident input ${i}`);
    await page.getByRole('button', { name: 'Collapse inspector', exact: true }).click();
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await page.evaluate(() => ({
    clickToTwoFramesMs: window.nodeflowMeasurements,
    reactProfile: JSON.parse(document.documentElement.dataset.nodeflowReactProfile ?? 'null'),
    userAgent: navigator.userAgent,
  }));
  result.conditions = `${result.reactProfile ? 'Local Vite development build, React StrictMode' : 'Local production build'}, 1440x1000, reduced motion; click-to-two-animation-frames proxy, not field INP.`;
  await writeFile(new URL(`../../docs/evidence/${result.reactProfile ? 'editor-profile' : 'editor-production'}.json`, import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
