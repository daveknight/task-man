import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('..', import.meta.url));
const tsx = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));

function run(...args: string[]): string {
  return execFileSync(tsx, ['src/main.ts', ...args], { cwd: cli, encoding: 'utf8' });
}

describe('cli capture replay', () => {
  it('prints the dry-cleaning example and does not save it', () => {
    const result = JSON.parse(run('capture', '--example', 'dry-cleaning', '--json', '--today', '2026-11-18'));
    expect(result.applied).toBe(false);
    expect(result.saved).toBeUndefined();
    expect(result.input).toBe('Add a task to pick up my dry cleaning on Friday');
    expect(result.cards[0]).toMatchObject({ title: 'Pick up dry cleaning', dueDate: '2026-11-20', status: 'open' });
  });

  it('prints no cards for update, append-note, no match, and ambiguous fixtures', () => {
    for (const id of ['follow-up-dan', 'jeans-note', 'follow-up-dan-none', 'jeans-note-none', 'follow-up-dan-many', 'garbage-close']) {
      const result = JSON.parse(run('capture', '--example', id, '--json', '--today', '2026-11-18'));
      expect(result.cards).toEqual([]);
      expect(result.applied).toBe(false);
    }
  });

  it('prints the weekly garbage create', () => {
    const result = JSON.parse(run('capture', '--example', 'garbage-weekly', '--json', '--today', '2026-11-18'));
    expect(result.applied).toBe(false);
    expect(result.cards[0]).toMatchObject({
      title: 'Take out the garbage',
      dueDate: '2026-11-18',
      repeat: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'] },
    });
  });

  it('says nothing was saved when it is not applying', () => {
    const text = run('capture', '--example', 'dry-cleaning', '--today', '2026-11-18');
    expect(text).toContain('Pick up dry cleaning');
    expect(text).toContain('Nothing was saved');
    expect(text).not.toContain('Added');
  });
});
