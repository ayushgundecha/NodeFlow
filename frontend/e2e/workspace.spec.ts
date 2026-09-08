import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workflowTemplates } from '../src/features/editor/workflowTemplates';
import { createEditorWorkspace } from '../src/features/editor/workspacePersistence';

async function chooseTemplate(page: Page, name = 'Data Quality Gate') {
  await page.getByRole('button', { name: 'Templates and workspace settings' }).click();
  await page.getByRole('button', { name: `Use ${name} template` }).click();
  await page.getByRole('button', { name: 'Replace workflow', exact: true }).click();
}

async function run(page: Page) {
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await expect(page.getByText('Workflow completed', { exact: true })).toBeVisible();
}

test('real execution, editing, branch change, inspection, comparison, replay and deletion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await chooseTemplate(page);
  await run(page);
  await page.getByRole('button', { name: 'View final output' }).click();
  await expect(page.locator('.nf-debug-data-panel')).toContainText('"valid"');
  await page.getByRole('button', { name: /Select Dataset metrics node/ }).click();
  await page.getByRole('textbox', { name: /Default JSON/ }).fill('{"qualityScore":0.5,"records":128,"invalidRecords":12}');
  await page.getByRole('textbox', { name: /Default JSON/ }).blur();
  await run(page);
  await page.getByRole('button', { name: 'View final output' }).click();
  await expect(page.locator('.nf-debug-data-panel')).toContainText('needs-review');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Changed');
  await page.getByRole('button', { name: 'Replay', exact: true }).first().click();
  await page.getByRole('slider', { name: 'Replay event sequence' }).fill('0');
  await expect(page.getByRole('list', { name: 'Run events in server order' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Runs', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Completed runs will be saved only in this browser.')).toBeVisible();
  await expect(page.getByText('Autosaved locally')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Select Dataset metrics node/ }).click();
  await expect(page.getByRole('textbox', { name: /Default JSON/ })).toHaveValue(/0.5/);
});

test('runtime failure can be inspected, repaired and rerun', async ({ page }) => {
  await page.goto('/');
  await chooseTemplate(page);
  await page.getByRole('button', { name: /Select Normalize metrics node/ }).click();
  await page.getByRole('textbox', { name: /Expression/ }).fill('@.missing');
  await page.getByRole('textbox', { name: /Expression/ }).blur();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await expect(page.getByText('Workflow stopped at Normalize metrics')).toBeVisible();
  await page.getByRole('button', { name: 'View error', exact: true }).click();
  await expect(page.locator('.nf-debug-error')).toBeVisible();
  await page.getByRole('textbox', { name: /Expression/ }).fill('@');
  await page.getByRole('textbox', { name: /Expression/ }).blur();
  await run(page);
});

test('import/export round trip and malformed import preserve the existing draft', async ({ page }) => {
  await page.goto('/');
  await chooseTemplate(page);
  await page.getByRole('button', { name: 'Import or export workflow' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export workflow', exact: true }).click();
  const download = await downloadPromise;
  const exported = await download.path();
  expect(download.suggestedFilename()).toBe('data-quality-gate.nodeflow.json');
  await page.getByLabel('Choose workflow JSON file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.getByRole('alert')).toContainText('Import blocked');
  await page.getByLabel('Choose workflow JSON file').setInputFiles(exported!);
  await page.getByRole('button', { name: 'Replace workflow', exact: true }).click();
  await run(page);
});

test('keyboard navigation, focus return and blank validation', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to workflow' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workflow-content')).toBeFocused();
  const opener = page.getByRole('button', { name: 'Templates and workspace settings' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close workspace menu' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  await page.getByRole('button', { name: 'Start a blank workflow' }).click();
  await page.getByRole('button', { name: 'Replace workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await expect(page.locator('#validation-summary')).toBeVisible();
});

test('storage denied and corrupted drafts recover without crashing', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('Denied', 'SecurityError'); }; });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Select Incident input node/ })).toBeVisible();
});

test('corrupt draft is backed up before recovery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nodeflow.editor-workspace.v2', '{invalid'));
  await page.goto('/');
  await expect(page.getByText('Workspace recovered safely.')).toBeVisible();
});

test('offline validation offers a recoverable error', async ({ page, context }) => {
  await page.goto('/');
  await chooseTemplate(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Retry run', exact: true })).toBeVisible();
  await context.setOffline(false);
  await run(page);
});

for (const width of [375, 768, 1024, 1440]) {
  test(`responsive accessibility and visual baseline at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Run workflow', exact: true }).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await expect(page).toHaveScreenshot(`workspace-${width}.png`, { animations: 'disabled' });
  });
}

test('maximum 25-node graph executes and stays editable', async ({ page }) => {
  const workspace = createEditorWorkspace(workflowTemplates[2]);
  workspace.id = 'maximum-graph';
  workspace.nodes = Array.from({ length: 25 }, (_, index) => ({ id: `node-${index}`, type: 'registryNode', position: { x: index % 5 * 260, y: Math.floor(index / 5) * 150 }, data: { id: `node-${index}`, nodeType: index === 0 ? 'manualInput' : index === 24 ? 'output' : 'transform', label: `Step ${index}`, config: index === 0 ? { inputKey: 'value', defaultValue: { ok: true } } : index === 24 ? { label: 'result', format: 'json' } : { expression: '@' } } }));
  workspace.edges = Array.from({ length: 24 }, (_, i) => ({ id: `edge-${i}`, source: `node-${i}`, target: `node-${i + 1}`, sourceHandle: i === 0 ? 'value' : 'output', targetHandle: i === 23 ? 'value' : 'input' }));
  await page.addInitScript((draft) => localStorage.setItem('nodeflow.editor-workspace.v2', JSON.stringify(draft)), workspace);
  await page.goto('/');
  await run(page);
  await page.getByRole('button', { name: /Select Step 0 node/ }).click();
  await page.getByRole('textbox', { name: 'Node name', exact: true }).fill('Still editable');
  await expect(page.getByRole('button', { name: /Select Still editable node/ })).toBeVisible();
});


test('stop cancels a real delayed workflow and permits a fresh run', async ({ page }) => {
  const workspace = createEditorWorkspace(workflowTemplates[2]);
  workspace.nodes[1].data.nodeType = 'delay';
  workspace.nodes[1].data.config = { milliseconds: 10000 };
  await page.addInitScript((draft) => localStorage.setItem('nodeflow.editor-workspace.v2', JSON.stringify(draft)), workspace);
  await page.goto('/');
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Select Normalize metrics node, Running/ })).toBeVisible();
  await expect(page).toHaveScreenshot('running-and-queued.png', { mask: [page.locator('.nf-run-summary'), page.locator('.nf-debug-event p')] });
  await page.getByRole('button', { name: 'Stop run', exact: true }).first().click();
  await expect(page.getByText('Run stopped', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('stopped.png', { mask: [page.locator('.nf-run-summary'), page.locator('.nf-debug-event p')] });
  await expect(page.getByRole('button', { name: 'Run workflow', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Select Normalize metrics node/ }).click();
  await page.getByRole('spinbutton', { name: /Duration/ }).fill('0');
  await page.getByRole('spinbutton', { name: /Duration/ }).blur();
  await run(page);
});

test('keyboard port connection, duplicate, undo and inspector tabs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Templates and workspace settings' }).click();
  await page.getByRole('button', { name: 'Start a blank workflow' }).click();
  await page.getByRole('button', { name: 'Replace workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Add Manual input node', exact: true }).click();
  await page.getByRole('textbox', { name: /Default JSON/ }).fill('{"hello":"NodeFlow"}');
  await page.getByRole('textbox', { name: /Default JSON/ }).blur();
  await page.getByRole('button', { name: 'Add Output node', exact: true }).click();
  await page.getByRole('button', { name: 'output port Value, json, available', exact: true }).press('Enter');
  await page.getByRole('button', { name: /input port Value, .*compatible/ }).press('Enter');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await run(page);
  await page.getByRole('button', { name: 'View final output' }).click();
  await expect(page.locator('.nf-debug-data-panel')).toContainText('NodeFlow');
  const configure = page.getByRole('tab', { name: 'configure', exact: true });
  await configure.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'input', exact: true })).toBeFocused();
});

test('real terminal execution states have a visual baseline', async ({ page }) => {
  await page.goto('/');
  await chooseTemplate(page);
  await run(page);
  await expect(page).toHaveScreenshot('completed-and-skipped.png', {
    mask: [page.locator('.nf-run-summary'), page.locator('.nf-debug-event p')],
  });
  await page.getByRole('button', { name: /Select Normalize metrics node/ }).click();
  await page.getByRole('textbox', { name: /Expression/ }).fill('@.missing');
  await page.getByRole('textbox', { name: /Expression/ }).blur();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).first().click();
  await expect(page.getByText('Workflow stopped at Normalize metrics')).toBeVisible();
  await expect(page).toHaveScreenshot('failed.png', {
    mask: [page.locator('.nf-run-summary'), page.locator('.nf-debug-event p')],
  });
});
