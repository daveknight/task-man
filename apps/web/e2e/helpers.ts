import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Wednesday, the same pinned day CI uses for the seed checks. */
export const TODAY = '2026-11-18';

const root = resolve(import.meta.dirname, '../../..');

/** Runs the CLI against local Supabase at the pinned day. */
export function cli(...args: string[]): string {
  return execFileSync('npm', ['run', '-s', 'cli', '--', ...args, '--today', TODAY], { cwd: root, encoding: 'utf8' });
}

export function cliJson<T = unknown>(...args: string[]): T {
  return JSON.parse(cli(...args, '--json')) as T;
}

export interface CliTask {
  id: string;
  title: string;
  status: string;
  flagged: boolean;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  description: string;
}

export function showTask(title: string): { task: CliTask; placement: string } {
  return cliJson('show', title);
}

/** For polling until a just-created task reaches the database. */
export function findTask(title: string): { task: CliTask; placement: string } | null {
  try {
    return showTask(title);
  } catch {
    return null;
  }
}

export interface CliBoard {
  sections: { id: string; tasks: CliTask[]; later?: CliTask[]; count: number }[];
}

export function reseed() {
  cli('seed', '--reset');
}

export async function openBoard(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`/?today=${TODAY}`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
}

export const row = (page: Page, title: string) => page.locator('[data-slot=task-row]', { hasText: title }).first();

export const section = (page: Page, id: string) => page.locator(`[data-section=${id}]`);

/** Titles in a section, top to bottom (needs-follow-up only, for Waiting). */
export async function titlesIn(page: Page, id: string): Promise<string[]> {
  return section(page, id)
    .locator('[data-slot=task-row]')
    .evaluateAll((rows) => rows.filter((r) => !r.closest('[data-later]')).map((r) => r.querySelector('[data-slot=task-title]')?.textContent?.trim() ?? ''));
}
