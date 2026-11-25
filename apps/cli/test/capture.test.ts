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

  it('prints an update, an appended note, no match, and a question', () => {
    const update = JSON.parse(run('capture', '--example', 'follow-up-dan', '--json', '--today', '2026-11-18'));
    expect(update.applied).toBe(false);
    expect(update.cards[0]).toMatchObject({ type: 'update', taskId: 'dan', title: 'Follow up with Dan', patch: { startDate: '2026-11-23' } });

    const note = JSON.parse(run('capture', '--example', 'jeans-note', '--json', '--today', '2026-11-18'));
    expect(note.cards[0]).toMatchObject({ type: 'append_note', taskId: 'jeans', text: 'check out 501 33/33 size' });

    for (const id of ['follow-up-dan-none', 'jeans-note-none']) {
      const result = JSON.parse(run('capture', '--example', id, '--json', '--today', '2026-11-18'));
      expect(result.cards).toEqual([]);
      expect(result.message).toBe('No task was found.');
      expect(result.applied).toBe(false);
    }

    const many = JSON.parse(run('capture', '--example', 'follow-up-dan-many', '--json', '--today', '2026-11-18'));
    expect(many.cards[0].taskId).toBeNull();
    expect(many.cards[0].ask).toBe('Which task?');
    expect(many.cards[0].candidates.map((candidate: { id: string }) => candidate.id)).toEqual(['dan', 'dan-deck']);
    expect(many.applied).toBe(false);

    const close = JSON.parse(run('capture', '--example', 'garbage-close', '--json', '--today', '2026-11-18'));
    expect(close.cards[0].ask).toBe('Update its repeat, or create another?');
    expect(close.cards[0].type).toBe('create');
    expect(close.applied).toBe(false);
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
