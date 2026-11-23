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
  hideUntil: string | null;
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

/**
 * Starts recording, every frame, where the dragged row's overlay and the row in the list sit. Call
 * before releasing the pointer, then `stop` once the drop has settled for the samples.
 */
export async function recordDrop(page: Page, title: string) {
  await page.evaluate((text) => {
    const w = window as unknown as { drop: { overlay: number | null; list: number | null }[]; dropOn: boolean };
    w.drop = [];
    w.dropOn = true;
    const tick = () => {
      const sample: { overlay: number | null; list: number | null } = { overlay: null, list: null };
      for (const r of document.querySelectorAll('[data-slot=task-row]')) {
        if (!r.textContent?.includes(text)) continue;
        let fixed = false;
        for (let e: Element | null = r; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') fixed = true;
        sample[fixed ? 'overlay' : 'list'] = r.getBoundingClientRect().y;
      }
      w.drop.push(sample);
      if (w.dropOn) requestAnimationFrame(tick);
    };
    tick();
  }, title);
  return {
    stop: () =>
      page.evaluate(() => {
        const w = window as unknown as { drop: { overlay: number | null; list: number | null }[]; dropOn: boolean };
        w.dropOn = false;
        return w.drop;
      }),
  };
}
