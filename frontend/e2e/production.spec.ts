import { expect, test } from '@playwright/test';

// Explicit opt-in: these checks consume real free-tier provider allowance.
test.skip(!process.env.NODEFLOW_PROVIDER_SMOKE, 'Set NODEFLOW_PROVIDER_SMOKE=1 with NODEFLOW_TEST_URL to run real integrations.');

for (const template of ['Incident Response Demo', 'GitHub Release Digest', 'Data Quality Gate']) {
  test(`production smoke: ${template}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Templates and workspace settings' }).click();
    await page.getByRole('button', { name: `Use ${template} template` }).click();
    await page.getByRole('button', { name: 'Replace workflow', exact: true }).click();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/v1/runs'));
    await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
    await expect(page.getByText('Workflow completed', { exact: true })).toBeVisible({ timeout: 40_000 });
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
    const stream = await response.text();
    expect(stream).toContain('event: run.completed');
    expect(stream).not.toContain('event: node.failed');
    await page.getByRole('button', { name: 'View final output' }).click();
    await expect(page.locator('.nf-debug-data-panel pre')).not.toBeEmpty();
  });
}
