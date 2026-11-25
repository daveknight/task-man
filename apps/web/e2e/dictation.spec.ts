import { expect, test, type Page } from '@playwright/test';
import { dictationProbe, installDictation, speak, type DictationMode } from './dictation-fake';
import { reseed, TODAY } from './helpers';

const DRY_CLEANING = 'Add a task to pick up my dry cleaning on Friday';

async function openCapture(page: Page, mode: DictationMode) {
  reseed();
  await installDictation(page, mode);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`/?today=${TODAY}&capture=replay&slow=1`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Capture' }).click();
  const dialog = page.getByRole('dialog', { name: 'Capture' });
  await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeVisible();
  return dialog;
}

test('dictation writes the note, shows a local meter, and stops when editing ends', async ({ page }) => {
  const dialog = await openCapture(page, 'ok');
  const footer = dialog.locator('[data-slot=capture-footer]');
  const note = dialog.getByRole('textbox', { name: 'Note' });

  expect((await dictationProbe(page)).starts).toBe(0);
  await expect(page.getByRole('button', { name: 'Dictate', exact: true })).toHaveCount(1);
  await expect(footer.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Done' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Dictate', exact: true })).toHaveCount(0);
  await expect(footer.getByRole('button', { name: 'Stop dictation', exact: true })).toHaveCount(0);

  await note.fill('Remember: ');
  await dialog.getByRole('button', { name: 'Dictate', exact: true }).click();
  const meter = dialog.getByRole('meter', { name: 'Microphone level' });
  await expect(meter).toBeVisible();
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  const live = await dictationProbe(page);
  expect(live.starts).toBe(1);
  expect(live.meterAsks).toBe(1);
  expect(live.constraints).toEqual({ audio: true });
  expect(live.sampleReads).toBeGreaterThan(0);
  expect(live.recorders).toBe(0);
  await expect(note).toBeEnabled();

  await speak(page, [{ final: false, text: 'buy' }]);
  await expect(note).toHaveValue('Remember: buy');
  await speak(page, [
    { final: true, text: 'buy milk' },
    { final: false, text: ' tomorrow' },
  ]);
  await expect(note).toHaveValue('Remember: buy milk tomorrow');

  await note.fill(DRY_CLEANING);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog.getByText('Thinking…')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Dictate', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Stop dictation', exact: true })).toHaveCount(0);
  await expect(meter).toHaveCount(0);
  await expect.poll(async () => (await dictationProbe(page)).aborts).toBeGreaterThan(0);
  await expect.poll(async () => (await dictationProbe(page)).trackStops).toBeGreaterThan(0);

  await expect(dialog.locator('[data-slot=capture-card-title]')).toHaveText('Pick up dry cleaning');
  await expect(dialog.getByRole('button', { name: 'Dictate', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Recapture' }).click();
  await expect(note).toHaveValue(DRY_CLEANING);
  await expect(dialog.getByRole('button', { name: 'Dictate', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stop dictation', exact: true })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Dictate', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Stop dictation', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await dictationProbe(page)).trackStops).toBeGreaterThan(1);
});

test('a missing speech API or a refused microphone leaves the note usable', async ({ page }) => {
  const missing = await openCapture(page, 'no-api');
  const note = missing.getByRole('textbox', { name: 'Note' });
  await missing.getByRole('button', { name: 'Dictate', exact: true }).click();
  await expect(missing.locator('[data-slot=capture-dictation]')).toHaveText("Dictation isn't available in this browser. You can still type the note.");
  await expect(note).toBeEnabled();
  await expect(missing.getByRole('meter')).toHaveCount(0);
  await note.fill('Still typing');
  await expect(missing.getByRole('button', { name: 'Done' })).toBeEnabled();

  await missing.getByRole('button', { name: 'Cancel' }).click();
  const blocked = await openCapture(page, 'denied-speech');
  await blocked.getByRole('button', { name: 'Dictate', exact: true }).click();
  await expect(blocked.locator('[data-slot=capture-dictation]')).toHaveText('The microphone was blocked. You can still type the note.');
  await expect(blocked.getByRole('textbox', { name: 'Note' })).toBeEnabled();
  await expect(blocked.getByRole('button', { name: 'Stop dictation', exact: true })).toHaveCount(0);
  await blocked.getByRole('textbox', { name: 'Note' }).fill('Typed instead');
  await expect(blocked.getByRole('button', { name: 'Done' })).toBeEnabled();
});

test('a refused meter or one that fights the recognizer is skipped', async ({ page }) => {
  const refused = await openCapture(page, 'denied-meter');
  await refused.getByRole('button', { name: 'Dictate', exact: true }).click();
  await expect(refused.getByRole('button', { name: 'Stop dictation', exact: true })).toBeVisible();
  await expect(refused.getByRole('meter')).toHaveCount(0);
  await expect(refused.locator('[data-slot=capture-dictation]')).toHaveCount(0);
  await speak(page, [{ final: true, text: 'buy milk' }]);
  await expect(refused.getByRole('textbox', { name: 'Note' })).toHaveValue('buy milk');
  expect((await dictationProbe(page)).recorders).toBe(0);

  await refused.getByRole('button', { name: 'Cancel' }).click();
  const fight = await openCapture(page, 'fight');
  await fight.getByRole('button', { name: 'Dictate', exact: true }).click();
  await expect.poll(async () => (await dictationProbe(page)).starts).toBeGreaterThan(1);
  await expect(fight.getByRole('meter')).toHaveCount(0);
  await expect(fight.getByRole('button', { name: 'Stop dictation', exact: true })).toBeVisible();
  const fought = await dictationProbe(page);
  expect(fought.contexts).toBe(1);
  expect(fought.trackStops).toBeGreaterThan(0);
  expect(fought.recorders).toBe(0);
  await speak(page, [{ final: true, text: 'buy milk' }]);
  await expect(fight.getByRole('textbox', { name: 'Note' })).toHaveValue('buy milk');
  await expect(fight.getByRole('textbox', { name: 'Note' })).toBeEnabled();
});
