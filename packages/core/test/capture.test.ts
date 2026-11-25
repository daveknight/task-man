import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAPTURE_MAX_CHARS,
  CAPTURE_RESPONSE_SCHEMA,
  CAPTURE_RULES,
  CAPTURE_SCHEMA_ID,
  LOW_CONFIDENCE_MESSAGE,
  captureApplyOrder,
  captureCardSnapshot,
  capturePrompt,
  isCreateExample,
  planCaptureTasks,
  readCaptureExamples,
  reviewCapture,
  reviewFromFailure,
  weekdayOf,
  type CaptureCard,
  type CaptureDeferredExpect,
} from '../src/index.ts';

const TODAY = '2026-11-18';
const examples = readCaptureExamples(JSON.parse(readFileSync(new URL('../../../seed/capture-examples.json', import.meta.url), 'utf8')));
const functionSource = readFileSync(new URL('../../../supabase/functions/parse-capture/index.ts', import.meta.url), 'utf8');
const functionSchema = JSON.parse(readFileSync(new URL('../../../supabase/functions/parse-capture/capture-schema.json', import.meta.url), 'utf8'));

function review(reply: unknown, today: string = TODAY) {
  return reviewCapture(reply, today);
}

const INPUTS = [
  'Add a task to pick up my dry cleaning on Friday',
  'Add a task for every Wednesday to take out the garbage, and no similar task exists',
  'Update the task to follow up with Dan to start next Monday, and one task title matches',
  'Add a note for buying jeans to check out 501 33/33 size, and one jeans task matches',
  'Update the task to follow up with Dan to start next Monday, and no task matches',
  'Add a note for buying jeans to check out 501 33/33 size, and no task matches',
  'Update the task to follow up with Dan to start next Monday, and several tasks match',
  'Add a task for every Wednesday to take out the garbage, and a close garbage task already exists',
] as const;

describe('capture examples', () => {
  it('covers every row and pins today to a Wednesday', () => {
    expect(examples.today).toBe(TODAY);
    expect(weekdayOf(examples.today)).toBe('wed');
    expect(examples.examples.map((example) => example.input)).toEqual([...INPUTS]);
    expect(examples.examples.map((example) => example.kind)).toEqual([
      'create',
      'create',
      'update',
      'append_note',
      'no_match',
      'no_match',
      'ambiguous',
      'ambiguous',
    ]);
    expect(examples.examples.filter((example) => example.implemented).map((example) => example.id)).toEqual(['dry-cleaning', 'garbage-weekly']);
  });

  it.each(examples.examples.filter(isCreateExample))('replays the create $id without calling a provider', (example) => {
    const result = review(example.reply, examples.today);
    expect(result.confidence).toBe(example.expect.confidence);
    expect(result.summary).toBe((example.reply as { summary: string }).summary);
    expect(result.cards.map(captureCardSnapshot)).toEqual(example.expect.actions);
    expect(result.message).toBeUndefined();
  });

  it.each(examples.examples.filter((example) => !example.implemented))('replays $id and does not create a task', (example) => {
    const result = review(example.reply, examples.today);
    const expectLater = example.expect as CaptureDeferredExpect;
    expect(result.cards).toEqual([]);
    expect(expectLater.creates).toBe(false);
    expect(expectLater.outcome).toBe(example.kind);
    if (example.kind === 'update') expect(expectLater).toMatchObject({ match: 'follow up with Dan', startDate: '2026-11-23' });
    if (example.kind === 'append_note') expect(expectLater).toMatchObject({ match: 'buying jeans', text: 'check out 501 33/33 size', replacesDescription: false });
    if (example.kind === 'no_match') {
      expect(expectLater.message).toBe('No task was found.');
      expect(result.summary).toBe('No task was found.');
    }
    if (example.kind === 'ambiguous') {
      expect(expectLater.guesses).toBe(false);
      expect(result.summary).toBe(expectLater.ask);
      expect(result.cards).toEqual([]);
    }
  });
});

describe('reviewCapture', () => {
  it('does not invent a task when confidence is low, even if the reply includes one', () => {
    const result = review({
      summary: 'Change when the follow-up with Dan starts.',
      confidence: 'low',
      actions: [{ type: 'create', title: 'Follow up with Dan', startDate: '2026-11-23' }],
    });
    expect(result.cards).toEqual([]);
    expect(result.message).toBe(LOW_CONFIDENCE_MESSAGE);
  });

  it('does not turn an update into a create', () => {
    const result = review({
      summary: 'Change when the follow-up with Dan starts.',
      confidence: 'high',
      actions: [{ type: 'update', match: 'follow up with Dan', startDate: '2026-11-23' }],
    });
    expect(result.confidence).toBe('low');
    expect(result.cards).toEqual([]);
    expect(result.message).toContain('existing task');
  });

  it('keeps a create and leaves an update out', () => {
    const result = review({
      summary: 'Two requests.',
      confidence: 'high',
      actions: [
        { type: 'create', title: 'Pick up dry cleaning', dueDate: '2026-11-20' },
        { type: 'append_note', match: 'jeans', text: '501' },
      ],
    });
    expect(result.cards.map((card) => card.action.title)).toEqual(['Pick up dry cleaning']);
    expect(result.notes.join(' ')).toContain('existing task');
  });

  it('drops a bad date and marks the card', () => {
    const result = review({
      summary: 'Dry cleaning.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Pick up dry cleaning', dueDate: '2026-02-31', startDate: '2026-11-18' }],
    });
    const card = result.cards[0]!;
    expect(card.action.dueDate).toBeNull();
    expect(card.action.startDate).toBe('2026-11-18');
    expect(card.marks.map((mark) => mark.field)).toContain('dueDate');
  });

  it('drops a bad repeat and keeps the due date', () => {
    const result = review({
      summary: 'Garbage.',
      confidence: 'high',
      actions: [
        {
          type: 'create',
          title: 'Take out the garbage',
          dueDate: '2026-11-18',
          repeat: { mode: 'schedule', freq: 'weekly', interval: 0, byWeekday: ['wed'] },
        },
      ],
    });
    const card = result.cards[0]!;
    expect(card.action.repeat).toBeNull();
    expect(card.action.dueDate).toBe('2026-11-18');
    expect(card.marks.some((mark) => mark.field === 'repeat')).toBe(true);
  });

  it('moves a start date that falls after the due date, and marks it', () => {
    const result = review({
      summary: 'Start too late.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'File the form', startDate: '2026-11-21', dueDate: '2026-11-20' }],
    });
    const card = result.cards[0]!;
    expect(card.action.startDate).toBe('2026-11-20');
    expect(card.action.dueDate).toBe('2026-11-20');
    expect(card.marks.some((mark) => mark.field === 'startDate' && mark.message.includes('2026-11-20'))).toBe(true);
  });

  it('drops a start date on a Waiting task and a hide-until date on an Open task', () => {
    const waiting = review({
      summary: 'Waiting.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Hear back', status: 'waiting', startDate: '2026-11-20', hideUntil: '2026-11-21' }],
    });
    expect(waiting.cards[0]!.action.startDate).toBeNull();
    expect(waiting.cards[0]!.action.hideUntil).toBe('2026-11-21');
    const open = review({
      summary: 'Open.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Call', status: 'open', hideUntil: '2026-11-21' }],
    });
    expect(open.cards[0]!.action.hideUntil).toBeNull();
    expect(open.cards[0]!.marks.some((mark) => mark.field === 'hideUntil')).toBe(true);
  });

  it('anchors a repeat with no due date to today and marks it', () => {
    const result = review({
      summary: 'Weekly.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Take out the garbage', repeat: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'] } }],
    });
    expect(result.cards[0]!.action.dueDate).toBe(TODAY);
    expect(result.cards[0]!.action.repeat?.byWeekday).toEqual(['wed']);
    expect(result.cards[0]!.marks.some((mark) => mark.field === 'dueDate')).toBe(true);
  });

  it('treats a reply that is not the schema as low confidence', () => {
    expect(review('nope').cards).toEqual([]);
    expect(review({ tasks: [{ title: 'Guessed' }] }).cards).toEqual([]);
    expect(review({ summary: 'Hi', confidence: 'maybe', actions: [{ type: 'create', title: 'Guessed' }] }).cards).toEqual([]);
  });

  it('names a failed call without inventing tasks', () => {
    expect(reviewFromFailure('not_configured')).toMatchObject({ confidence: 'low', cards: [], message: "Capture isn't set up yet. Nothing was saved." });
    expect(reviewFromFailure('provider_error').cards).toEqual([]);
  });
});

describe('capture prompt and schema', () => {
  it('tells the model the day, the rules, and the existing tags', () => {
    const prompt = capturePrompt('Pick up the cleaning', { today: TODAY, timeZone: 'America/Los_Angeles', tags: ['errands', 'home'] });
    expect(prompt).toContain('Wednesday, 2026-11-18');
    expect(prompt).toContain('America/Los_Angeles');
    expect(prompt).toContain(CAPTURE_RULES);
    expect(prompt).toContain('errands, home');
    expect(prompt.endsWith('Pick up the cleaning')).toBe(true);
  });

  it('keeps the Edge Function on the same rules, cap and schema, with keys only in its environment', () => {
    expect(functionSource).toContain(CAPTURE_SCHEMA_ID);
    expect(functionSource).toContain(CAPTURE_RULES);
    expect(functionSource).toContain(`const MAX_CHARS = ${CAPTURE_MAX_CHARS}`);
    expect(functionSource).not.toContain('VITE_');
    expect(functionSource).not.toContain('console.');
    expect(functionSource).not.toContain('?key=');
    expect(functionSchema).toEqual(CAPTURE_RESPONSE_SCHEMA);
  });
});

describe('planCaptureTasks', () => {
  it('saves the first card last so it sits above the others, and writes nothing itself', () => {
    const cards = review({
      summary: 'Two.',
      confidence: 'high',
      actions: [
        { type: 'create', title: 'First', dueDate: '2026-11-20' },
        { type: 'create', title: 'Second', tags: ['home', 'Home'] },
      ],
    }).cards;
    expect(captureApplyOrder(cards).map((card: CaptureCard) => card.action.title)).toEqual(['Second', 'First']);
    let n = 0;
    const planned = planCaptureTasks(cards, { tasks: [], tags: [{ id: 'tag-home', name: 'Home' }], positions: new Map() }, TODAY, () => `id-${n++}`);
    expect(planned.map((item) => item.task.title)).toEqual(['Second', 'First']);
    expect(planned[0]!.tagCreates).toEqual([]);
    expect(planned[0]!.task.tags).toEqual([{ id: 'tag-home', name: 'Home' }]);
    expect(planned.every((item) => item.positions.length === 1)).toBe(true);
  });
});
