import type { Subtask } from '@app/core';
import { applySubtaskChange, sortSubtasks } from '@app/core';
import { describe, expect, it } from 'vitest';
import { findSubtask, hasSubtaskEdits, planSubtaskEdits } from '../src/tasks.ts';

const list: Subtask[] = [
  { id: '1111aaaa-0000-4000-8000-000000000001', title: 'Check the weather', done: true, sortKey: 'a0' },
  { id: '2222bbbb-0000-4000-8000-000000000002', title: 'Pack lunch and snacks', done: true, sortKey: 'a1' },
  { id: '3333cccc-0000-4000-8000-000000000003', title: 'Charge phone and camera', done: false, sortKey: 'a2' },
  { id: '4444dddd-0000-4000-8000-000000000004', title: 'Fill water bottles', done: false, sortKey: 'a3' },
];

/** Applies the planned changes the way the CLI writes them, and returns the titles with their ticks. */
function after(edits: Parameters<typeof planSubtaskEdits>[1]): string[] {
  const result = planSubtaskEdits(list, edits).reduce((current, change) => applySubtaskChange(current, change), sortSubtasks(list));
  return result.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`);
}

describe('findSubtask', () => {
  it('finds by position, counting from 1 in the order shown', () => {
    expect(findSubtask(list, '1').title).toBe('Check the weather');
    expect(findSubtask([...list].reverse(), '4').title).toBe('Fill water bottles');
  });

  it('finds by id prefix and by title prefix, ignoring case', () => {
    expect(findSubtask(list, '3333').title).toBe('Charge phone and camera');
    expect(findSubtask(list, 'fill').title).toBe('Fill water bottles');
    expect(findSubtask(list, 'PACK lunch and snacks').title).toBe('Pack lunch and snacks');
  });

  it('says what is wrong when nothing or several match, or the position is out of range', () => {
    expect(() => findSubtask(list, '5')).toThrow('the task has 4');
    expect(() => findSubtask([], '1')).toThrow('has none');
    expect(() => findSubtask(list, 'nothing')).toThrow('No subtask matches');
    expect(() => findSubtask([...list, { ...list[0]!, id: '5555eeee', title: 'Check the oven' }], 'check')).toThrow('matches 2 subtasks');
  });
});

describe('planSubtaskEdits', () => {
  it('has nothing to do without edits', () => {
    expect(hasSubtaskEdits(undefined)).toBe(false);
    expect(hasSubtaskEdits({ add: [], done: undefined })).toBe(false);
    expect(hasSubtaskEdits({ add: ['x'] })).toBe(true);
    expect(planSubtaskEdits(list, {})).toEqual([]);
  });

  it('ticks, unticks, renames, removes and adds', () => {
    expect(after({ done: ['charge'], undone: ['1'], rename: ['4=Fill water bottles and a thermos'], remove: ['2'], add: ['Lock the car'] })).toEqual([
      '[ ] Check the weather',
      '[x] Charge phone and camera',
      '[ ] Fill water bottles and a thermos',
      '[ ] Lock the car',
    ]);
  });

  it('resolves every ref against the list as it was, so removing one does not shift the others', () => {
    expect(after({ remove: ['1', '2'], done: ['4'] })).toEqual(['[ ] Charge phone and camera', '[x] Fill water bottles']);
  });

  it('moves last, to a position in the final list', () => {
    expect(after({ move: ['4=1'] })).toEqual(['[ ] Fill water bottles', '[x] Check the weather', '[x] Pack lunch and snacks', '[ ] Charge phone and camera']);
    expect(after({ remove: ['1'], add: ['New'], move: ['charge=99'] })).toEqual(['[x] Pack lunch and snacks', '[ ] Fill water bottles', '[ ] New', '[ ] Charge phone and camera']);
  });

  it('writes nothing for a change that changes nothing', () => {
    expect(planSubtaskEdits(list, { done: ['1'], rename: ['2=Pack lunch and snacks'], move: ['2=2'] })).toEqual([]);
  });

  it('refuses bad input before anything is written', () => {
    expect(() => planSubtaskEdits(list, { add: ['  '] })).toThrow('title is required');
    expect(() => planSubtaskEdits(list, { rename: ['1='] })).toThrow('title is required');
    expect(() => planSubtaskEdits(list, { rename: ['no equals sign'] })).toThrow('takes <subtask>=<new title>');
    expect(() => planSubtaskEdits(list, { move: ['1=0'] })).toThrow('must be 1 or more');
    expect(() => planSubtaskEdits(list, { move: ['1=top'] })).toThrow('must be 1 or more');
    expect(() => planSubtaskEdits(list, { move: ['1=2'], remove: ['1'] })).toThrow("can't be moved and removed");
    expect(() => planSubtaskEdits(list, { done: ['9'] })).toThrow('No subtask 9');
  });
});
