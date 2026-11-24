import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const DEV = { email: 'dev@example.com', password: 'dev-password' };
const root = resolve(import.meta.dirname, '../../..');

/** The local stack's admin client, used to mint a password-reset link without needing an inbox. */
function admin() {
  const out = execFileSync('supabase', ['status', '-o', 'json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const status = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
  const url = status.API_URL!;
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) throw new Error('The login tests only run against local Supabase.');
  return createClient(url, status.SERVICE_ROLE_KEY ?? status.SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

const heading = (name: string) => ({ name, exact: true });

test('the real login screen shows with auto sign-in off, and a wrong password says so', async ({ page }) => {
  await page.goto('/?autosignin=off');
  await expect(page.getByRole('heading', heading('Sign in'))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();

  await page.getByRole('textbox', { name: 'Email' }).fill(DEV.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
  await expect(page.getByRole('heading', heading('Sign in'))).toBeVisible();
});

test('signing in opens the board, a reload stays signed in, and Sign out returns to the login screen for good', async ({ page }) => {
  await page.goto('/?autosignin=off');
  await page.getByRole('textbox', { name: 'Email' }).fill(DEV.email);
  await page.getByLabel('Password').fill(DEV.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', heading('TaskMan'))).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', heading('TaskMan'))).toBeVisible();

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menu')).toContainText(DEV.email);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', heading('Sign in'))).toBeVisible();

  // Signing out in dev also turns auto sign-in off, so a reload shows the login screen rather than signing back in.
  await page.reload();
  await expect(page.getByRole('heading', heading('Sign in'))).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('board-cache'))).toBeNull();
});

test('Forgot password asks for an email and says a link is on its way, whether or not the address has an account', async ({ page }) => {
  await page.goto('/?autosignin=off');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', heading('Reset password'))).toBeVisible();
  await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', heading('Check your email'))).toBeVisible();
  await expect(page.getByText('If nobody@example.com has an account')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', heading('Sign in'))).toBeVisible();
});

test('the divider between the fields runs the full width, and the fields follow the list\'s rounded corners so a focus ring is not cropped', async ({ page }) => {
  await page.goto('/?autosignin=off');
  const email = page.getByRole('textbox', { name: 'Email' });
  const password = page.getByLabel('Password');
  await expect(email).toBeVisible();
  const style = (field: typeof email, prop: string, pseudo?: string) => field.evaluate((el, [p, ps]) => getComputedStyle(ps ? el.parentElement! : el, ps || null).getPropertyValue(p!), [prop, pseudo ?? '']);
  expect(await style(password, 'left', '::before')).toBe('0px');
  const radius = async (field: typeof email, corner: string) => parseFloat(await style(field, `border-${corner}-radius`));
  expect(await radius(email, 'top-left')).toBeGreaterThan(0);
  expect(await radius(email, 'bottom-left')).toBe(0);
  expect(await radius(password, 'bottom-left')).toBeGreaterThan(0);
  expect(await radius(password, 'top-left')).toBe(0);
  await password.focus();
  expect(await style(password, 'box-shadow')).not.toBe('none');
});

test('the primary buttons are 32px tall, the same as Add task', async ({ page }) => {
  await page.goto('/?autosignin=off');
  const height = async (name: string) => (await page.getByRole('button', { name, exact: true }).boundingBox())!.height;
  expect(await height('Sign in')).toBe(32);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  expect(await height('Send reset link')).toBe(32);
});

test('Forgot password starts with the email already typed on Sign in', async ({ page }) => {
  await page.goto('/?autosignin=off');
  await page.getByRole('textbox', { name: 'Email' }).fill('someone@example.com');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', heading('Reset password'))).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('someone@example.com');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeEnabled();

  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('someone@example.com');
});

test('a reset link opens New password, and saving it signs in with the new password', async ({ page }) => {
  const db = admin();
  const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email: DEV.email, options: { redirectTo: 'http://127.0.0.1:5179' } });
  expect(error).toBeNull();
  const link = data?.properties?.action_link;
  expect(link).toBeTruthy();
  try {
    await page.goto(link!);
    await expect(page.getByRole('heading', heading('New password'))).toBeVisible();

    await page.getByLabel('New password').fill('short');
    await expect(page.getByRole('button', { name: 'Save password' })).toBeDisabled();
    await page.getByLabel('New password').fill('a-new-password-1');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('heading', heading('TaskMan'))).toBeVisible();
    expect(page.url()).not.toContain('access_token');

    await page.reload();
    await expect(page.getByRole('heading', heading('TaskMan'))).toBeVisible();
  } finally {
    const { data: users } = await db.auth.admin.listUsers();
    const user = users.users.find((u) => u.email === DEV.email);
    if (user) await db.auth.admin.updateUserById(user.id, { password: DEV.password });
  }
});
