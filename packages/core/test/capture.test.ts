import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logThrownProviderError, ModelUnavailable, readProviderReply, resolveGeminiModel } from '../../../supabase/functions/parse-capture/provider-error.ts';
import {
  CAPTURE_MAX_CHARS,
  CAPTURE_RESPONSE_SCHEMA,
  CAPTURE_RULES,
  CAPTURE_SCHEMA_ID,
  LOW_CONFIDENCE_MESSAGE,
  NO_MATCH_MESSAGE,
  UPDATE_OR_CREATE_ASK,
  UPDATE_REPEAT_ASK,
  WHICH_TASK_ASK,
  appendCaptureNote,
  captureApplyOrder,
  captureCardReady,
  captureCardSnapshot,
  captureFailure,
  capturePrompt,
  chooseCaptureCreate,
  chooseCaptureTask,
  isCreateExample,
  planCaptureTasks,
  readCaptureExamples,
  reviewCapture,
  reviewFromFailure,
  weekdayOf,
  type CaptureCard,
  type CaptureExample,
  type Task,
} from '../src/index.ts';

const TODAY = '2026-11-18';
const examples = readCaptureExamples(JSON.parse(readFileSync(new URL('../../../seed/capture-examples.json', import.meta.url), 'utf8')));
const functionSource = readFileSync(new URL('../../../supabase/functions/parse-capture/index.ts', import.meta.url), 'utf8');
const webCaptureSource = readFileSync(new URL('../../../apps/web/src/data/capture.ts', import.meta.url), 'utf8');
const cliCaptureSource = readFileSync(new URL('../../../apps/cli/src/capture.ts', import.meta.url), 'utf8');
const providerErrorSource = readFileSync(new URL('../../../supabase/functions/parse-capture/provider-error.ts', import.meta.url), 'utf8');
const functionSchema = JSON.parse(readFileSync(new URL('../../../supabase/functions/parse-capture/capture-schema.json', import.meta.url), 'utf8'));

function providerResponse(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) };
}

function review(reply: unknown, today: string = TODAY, tasks: readonly Task[] = []) {
  return reviewCapture(reply, today, tasks);
}

function reviewExample(example: CaptureExample) {
  return reviewCapture(example.reply, examples.today, example.tasks);
}

function created(card: CaptureCard) {
  if (card.action.type !== 'create') throw new Error(`expected a create, got ${card.action.type}`);
  return card.action;
}

const DAN: Task = { id: 'dan', title: 'Follow up with Dan', description: '', status: 'open', flagged: false, startDate: null, hideUntil: null, dueDate: null };
const JEANS: Task = { id: 'jeans', title: 'Buy jeans', description: 'Dark wash', status: 'open', flagged: false, startDate: null, hideUntil: null, dueDate: null };

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
    expect(examples.examples.every((example) => example.implemented)).toBe(true);
  });

  it.each(examples.examples.filter(isCreateExample))('replays the create $id without calling a provider', (example) => {
    const result = reviewExample(example);
    expect(result.confidence).toBe(example.expect.confidence);
    expect(result.summary).toBe((example.reply as { summary: string }).summary);
    expect(result.cards.map(captureCardSnapshot)).toEqual(example.expect.actions);
    expect(result.message).toBeUndefined();
    expect(result.cards.every(captureCardReady)).toBe(true);
  });

  it('updates the one matching task and does not create another', () => {
    const example = examples.examples.find((item) => item.id === 'follow-up-dan')!;
    const result = reviewExample(example);
    expect(result.confidence).toBe('high');
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0]!;
    expect(card.action).toMatchObject({ type: 'update', taskId: 'dan', title: 'Follow up with Dan', patch: { startDate: '2026-11-23' } });
    expect(captureCardReady(card)).toBe(true);
    const planned = planCaptureTasks(result.cards, { tasks: example.tasks, tags: [], positions: new Map() }, examples.today, () => 'new-id');
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ kind: 'update', task: { id: 'dan', title: 'Follow up with Dan', startDate: '2026-11-23' } });
    expect(planned[0]!.task.id).not.toBe('new-id');
  });

  it('appends a note without replacing the description', () => {
    const example = examples.examples.find((item) => item.id === 'jeans-note')!;
    const result = reviewExample(example);
    const card = result.cards[0]!;
    expect(card.action).toMatchObject({ type: 'append_note', taskId: 'jeans', text: 'check out 501 33/33 size' });
    const planned = planCaptureTasks(result.cards, { tasks: example.tasks, tags: [], positions: new Map() }, examples.today, () => 'new-id');
    expect(planned).toHaveLength(1);
    expect(planned[0]!.kind).toBe('append_note');
    expect(planned[0]!.task.description).toBe('Dark wash\ncheck out 501 33/33 size');
    expect(planned[0]!.task.description?.startsWith('Dark wash')).toBe(true);
    expect(planned[0]!.task.id).toBe('jeans');
  });

  it.each(examples.examples.filter((example) => example.kind === 'no_match'))('says nothing was found for $id and does not create a task', (example) => {
    const result = reviewExample(example);
    expect(example.expect).toMatchObject({ outcome: 'no_match', creates: false, message: NO_MATCH_MESSAGE });
    expect(result.cards).toEqual([]);
    expect(result.message).toBe(NO_MATCH_MESSAGE);
    expect(result.confidence).toBe('high');
    expect(planCaptureTasks(result.cards, { tasks: example.tasks, tags: [], positions: new Map() }, examples.today, () => 'new-id')).toEqual([]);
  });

  it.each(examples.examples.filter((example) => example.kind === 'ambiguous'))('asks and does not guess for $id', (example) => {
    const result = reviewExample(example);
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0]!;
    expect(card.ask).toBe(example.expect.ask);
    expect(card.candidates.map((candidate) => candidate.id)).toEqual(example.expect.candidates);
    expect(captureCardReady(card)).toBe(false);
    expect(example.expect.guesses).toBe(false);
    expect(example.expect.creates).toBe(false);
    if (card.action.type !== 'create') expect(card.action.taskId).toBeNull();
    expect(planCaptureTasks(result.cards, { tasks: example.tasks, tags: [], positions: new Map() }, examples.today, () => 'new-id')).toEqual([]);
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

  it('does not turn an update into a create when nothing matches', () => {
    const result = review({
      summary: 'Change when the follow-up with Dan starts.',
      confidence: 'high',
      actions: [{ type: 'update', match: 'follow up with Dan', startDate: '2026-11-23' }],
    });
    expect(result.confidence).toBe('high');
    expect(result.cards).toEqual([]);
    expect(result.message).toBe(NO_MATCH_MESSAGE);
    expect(result.cards.some((card) => card.action.type === 'create')).toBe(false);
  });

  it('keeps a create and says when the note matched nothing', () => {
    const result = review({
      summary: 'Two requests.',
      confidence: 'high',
      actions: [
        { type: 'create', title: 'Pick up dry cleaning', dueDate: '2026-11-20' },
        { type: 'append_note', match: 'buying jeans', text: '501' },
      ],
    });
    expect(result.cards.map((card) => card.action.type)).toEqual(['create']);
    expect(result.notes.join(' ')).toContain('No task was found');
    expect(result.notes.join(' ')).toContain('buying jeans');
  });

  it('leaves subtasks off an update', () => {
    const result = review(
      {
        summary: 'Add a step and move the start.',
        confidence: 'high',
        actions: [{ type: 'update', match: 'follow up with Dan', startDate: '2026-11-23', subtasks: ['Call him'] }],
      },
      TODAY,
      [{ ...DAN, subtasks: [{ id: 'step', title: 'Existing step', done: false, sortKey: 'a' }] }],
    );
    const card = result.cards[0]!;
    expect(card.action.type).toBe('update');
    expect(card.marks.some((mark) => mark.field === 'subtasks')).toBe(true);
    const planned = planCaptureTasks(result.cards, { tasks: [{ ...DAN, subtasks: [{ id: 'step', title: 'Existing step', done: false, sortKey: 'a' }] }], tags: [], positions: new Map() }, TODAY, () => 'new');
    expect(planned[0]!.task.subtasks).toEqual([{ id: 'step', title: 'Existing step', done: false, sortKey: 'a' }]);
  });

  it('ignores a completed task and a trashed task with the same title', () => {
    const result = review(
      {
        summary: 'Start Monday.',
        confidence: 'high',
        actions: [{ type: 'update', match: 'follow up with Dan', startDate: '2026-11-23' }],
      },
      TODAY,
      [
        { ...DAN, id: 'done', completedAt: '2026-11-01T00:00:00.000Z', completedOn: '2026-11-01' },
        { ...DAN, id: 'gone', deletedAt: '2026-11-01T00:00:00.000Z', deletedOn: '2026-11-01' },
      ],
    );
    expect(result.message).toBe(NO_MATCH_MESSAGE);
    expect(result.cards).toEqual([]);
  });

  it('asks which task when several titles fit, and saves only the one Dave picks', () => {
    const tasks: Task[] = [DAN, { ...DAN, id: 'dan-deck', title: 'Follow up with Dan about the deck' }];
    const result = review(
      {
        summary: 'Start Monday.',
        confidence: 'high',
        actions: [{ type: 'update', match: 'follow up with Dan', startDate: '2026-11-23' }],
      },
      TODAY,
      tasks,
    );
    const card = result.cards[0]!;
    expect(card.ask).toBe(WHICH_TASK_ASK);
    expect(card.candidates.map((candidate) => candidate.id)).toEqual(['dan', 'dan-deck']);
    expect(planCaptureTasks(result.cards, { tasks, tags: [], positions: new Map() }, TODAY, () => 'new')).toEqual([]);
    const chosen = chooseCaptureTask(card, 'dan-deck', tasks);
    expect(chosen.action).toMatchObject({ type: 'update', taskId: 'dan-deck', title: 'Follow up with Dan about the deck' });
    expect(captureCardReady(chosen)).toBe(true);
    const planned = planCaptureTasks([chosen], { tasks, tags: [], positions: new Map() }, TODAY, () => 'new');
    expect(planned.map((item) => item.task.id)).toEqual(['dan-deck']);
    expect(planned[0]!.task.startDate).toBe('2026-11-23');
    expect(tasks.find((task) => task.id === 'dan')!.startDate).toBeNull();
  });

  it('asks before updating a close task, and can still create another', () => {
    const garbage: Task = {
      id: 'garbage',
      title: 'Take out garbage',
      description: 'Bins at the curb',
      status: 'open',
      dueDate: '2026-11-19',
      repeat: { mode: 'schedule', freq: 'weekly', interval: 1, startOffsetDays: 1 },
    };
    const result = review(
      {
        summary: 'Every Wednesday.',
        confidence: 'high',
        actions: [{ type: 'create', title: 'Take out the garbage', repeat: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'] } }],
      },
      TODAY,
      [garbage],
    );
    const card = result.cards[0]!;
    expect(card.ask).toBe(UPDATE_REPEAT_ASK);
    expect(card.action.type).toBe('create');
    expect(planCaptureTasks([card], { tasks: [garbage], tags: [], positions: new Map() }, TODAY, () => 'new')).toEqual([]);
    const updated = chooseCaptureTask(card, 'garbage', [garbage]);
    expect(updated.action).toMatchObject({ type: 'update', taskId: 'garbage' });
    if (updated.action.type !== 'update') throw new Error('expected an update');
    expect(updated.action.patch.repeat).toMatchObject({ byWeekday: ['wed'] });
    expect(updated.action.patch.dueDate).toBeUndefined();
    expect(updated.marks.some((mark) => mark.field === 'subtasks')).toBe(false);
    const created = chooseCaptureCreate(card);
    expect(created.action.type).toBe('create');
    expect(captureCardReady(created)).toBe(true);
    expect(created.candidates).toEqual([]);
  });

  it('asks whether to update a close task that has no repeat', () => {
    const result = review(
      {
        summary: 'Dry cleaning Friday.',
        confidence: 'high',
        actions: [{ type: 'create', title: 'Pick up dry cleaning', dueDate: '2026-11-20' }],
      },
      TODAY,
      [{ id: 'cleaning', title: 'Pick up dry cleaning', description: '', status: 'open' }],
    );
    expect(result.cards[0]!.ask).toBe(UPDATE_OR_CREATE_ASK);
    expect(captureCardReady(result.cards[0]!)).toBe(false);
  });

  it('appends onto an empty description and keeps the old text when there is some', () => {
    expect(appendCaptureNote(undefined, 'check out 501 33/33 size')).toBe('check out 501 33/33 size');
    expect(appendCaptureNote('Dark wash', 'check out 501 33/33 size')).toBe('Dark wash\ncheck out 501 33/33 size');
    const planned = planCaptureTasks(
      review(
        { summary: 'Size.', confidence: 'high', actions: [{ type: 'append_note', match: 'buying jeans', text: 'check out 501 33/33 size' }] },
        TODAY,
        [JEANS],
      ).cards,
      { tasks: [JEANS], tags: [], positions: new Map() },
      TODAY,
      () => 'new',
    );
    expect(planned[0]!.task.description).toBe('Dark wash\ncheck out 501 33/33 size');
    expect(planned[0]!.patch).toEqual({ description: 'Dark wash\ncheck out 501 33/33 size' });
  });

  it('drops a bad date and marks the card', () => {
    const result = review({
      summary: 'Dry cleaning.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Pick up dry cleaning', dueDate: '2026-02-31', startDate: '2026-11-18' }],
    });
    const card = result.cards[0]!;
    expect(created(card).dueDate).toBeNull();
    expect(created(card).startDate).toBe('2026-11-18');
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
    expect(created(card).repeat).toBeNull();
    expect(created(card).dueDate).toBe('2026-11-18');
    expect(card.marks.some((mark) => mark.field === 'repeat')).toBe(true);
  });

  it('moves a start date that falls after the due date, and marks it', () => {
    const result = review({
      summary: 'Start too late.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'File the form', startDate: '2026-11-21', dueDate: '2026-11-20' }],
    });
    const card = result.cards[0]!;
    expect(created(card).startDate).toBe('2026-11-20');
    expect(created(card).dueDate).toBe('2026-11-20');
    expect(card.marks.some((mark) => mark.field === 'startDate' && mark.message.includes('2026-11-20'))).toBe(true);
  });

  it('drops a start date on a Waiting task and a hide-until date on an Open task', () => {
    const waiting = review({
      summary: 'Waiting.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Hear back', status: 'waiting', startDate: '2026-11-20', hideUntil: '2026-11-21' }],
    });
    expect(created(waiting.cards[0]!).startDate).toBeNull();
    expect(created(waiting.cards[0]!).hideUntil).toBe('2026-11-21');
    const open = review({
      summary: 'Open.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Call', status: 'open', hideUntil: '2026-11-21' }],
    });
    expect(created(open.cards[0]!).hideUntil).toBeNull();
    expect(open.cards[0]!.marks.some((mark) => mark.field === 'hideUntil')).toBe(true);
  });

  it('anchors a repeat with no due date to today and marks it', () => {
    const result = review({
      summary: 'Weekly.',
      confidence: 'high',
      actions: [{ type: 'create', title: 'Take out the garbage', repeat: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'] } }],
    });
    expect(created(result.cards[0]!).dueDate).toBe(TODAY);
    expect(created(result.cards[0]!).repeat?.byWeekday).toEqual(['wed']);
    expect(result.cards[0]!.marks.some((mark) => mark.field === 'dueDate')).toBe(true);
  });

  it('treats a reply that is not the schema as low confidence', () => {
    expect(review('nope').cards).toEqual([]);
    expect(review({ tasks: [{ title: 'Guessed' }] }).cards).toEqual([]);
    expect(review({ summary: 'Hi', confidence: 'maybe', actions: [{ type: 'create', title: 'Guessed' }] }).cards).toEqual([]);
  });

  it('names a failed call without inventing tasks', () => {
    expect(reviewFromFailure('not_configured')).toMatchObject({ confidence: 'low', cards: [], message: "Capture isn't set up yet. Nothing was saved." });
    expect(reviewFromFailure('provider_error', 'gemini-3.8-flash')).toMatchObject({
      confidence: 'low',
      cards: [],
      message: "Capture didn't get an answer. Nothing was saved.",
    });
    expect(reviewFromFailure('model_unavailable', 'gemini-3.8-flash')).toMatchObject({
      confidence: 'low',
      cards: [],
      message: "Capture's model gemini-3.8-flash is unavailable. Nothing was saved.",
    });
    expect(reviewFromFailure('model_unavailable', 'override-model').message).toBe("Capture's model override-model is unavailable. Nothing was saved.");
    expect(reviewFromFailure('model_unavailable').message).toBe("Capture's model is unavailable. Nothing was saved.");
  });

  it('shows the model the function called, not the upstream body', () => {
    const upstream = {
      error: 'model_unavailable',
      model: 'override-model',
      message: 'This model models/gemini-2.5-flash is no longer available. key sk-live-secret',
    };
    const failure = captureFailure(upstream);
    expect(failure).toEqual({ code: 'model_unavailable', model: 'override-model' });
    const review = reviewFromFailure(failure?.code, failure?.model);
    expect(review.message).toBe("Capture's model override-model is unavailable. Nothing was saved.");
    expect(review.message).not.toContain('sk-live');
    expect(review.message).not.toContain('gemini-2.5-flash');
    expect(review.cards).toEqual([]);
    expect(captureFailure({ error: 'provider_error', model: 'gemini-3.8-flash' })).toEqual({ code: 'provider_error' });
    expect(captureFailure({ summary: 'Hi', confidence: 'low', error: 'model_unavailable', model: 'override-model' })).toBeNull();
  });
});

describe('capture prompt and schema', () => {
  it('tells the model the day, the rules, the tag names, and the note only', () => {
    const prompt = capturePrompt('Pick up the cleaning', { today: TODAY, timeZone: 'America/Los_Angeles', tags: ['errands', 'home'] });
    expect(prompt).toBe(
      ['Today is Wednesday, 2026-11-18. The time zone is America/Los_Angeles.', CAPTURE_RULES, 'Existing tags: errands, home.', '', 'Pick up the cleaning'].join('\n'),
    );
  });

  it('keeps task titles, descriptions, and ids off the request', () => {
    expect(functionSource).toContain('function promptFor(text: string, today: string, timeZone: string, tags: string[])');
    expect(functionSource).not.toContain('body.tasks');
    expect(functionSource).not.toContain('body.board');
    expect(webCaptureSource).toMatch(/functions\.invoke\('parse-capture', \{\s*body: \{ text: trimmed, today, timeZone:/);
    expect(webCaptureSource).not.toMatch(/body:\s*\{[^}]*\btasks\b/);
    expect(cliCaptureSource).toContain('text: string; today: ISODate; timeZone: string; tags: string[]');
    expect(cliCaptureSource).not.toMatch(/body:\s*\{[^}]*\btasks\b/);
  });

  it('keeps the Edge Function on the same rules, cap and schema, with keys only in its environment', () => {
    expect(functionSource).toContain(CAPTURE_SCHEMA_ID);
    expect(functionSource).toContain(CAPTURE_RULES);
    expect(functionSource).toContain(`const MAX_CHARS = ${CAPTURE_MAX_CHARS}`);
    expect(functionSource).not.toContain('VITE_');
    expect(functionSource).not.toContain('console.');
    expect(functionSource).not.toContain('?key=');
    expect(functionSource).toContain('const secrets = [key, `Bearer ${key}`, text, model]');
    expect(functionSource).toContain("model: 'gemini-3.8-flash'");
    expect(functionSource).toContain("model: 'claude-haiku-4-5'");
    expect(functionSource).toContain("model: 'gpt-4.1-mini'");
    expect(functionSource).not.toContain('gemini-2.5-flash');
    expect(functionSource).toContain("resolveGeminiModel(Deno.env.get('GEMINI_MODEL'))");
    expect(functionSource).toContain("return json({ error: 'model_unavailable', model }, 502);");
    const unavailableAt = functionSource.indexOf('error instanceof ModelUnavailable');
    const logAt = functionSource.indexOf('logThrownProviderError(name, error, secrets)');
    expect(unavailableAt).toBeGreaterThan(-1);
    expect(logAt).toBeGreaterThan(unavailableAt);
    expect(functionSource.match(/return readProviderReply\(name, res, secrets\);/g) ?? []).toHaveLength(3);
    expect(functionSource).toContain('logThrownProviderError(name, error, secrets)');
    expect(functionSource.match(/return json\(\{ error: 'provider_error' \}, 502\);/g)).toHaveLength(2);
    const logged = [...providerErrorSource.matchAll(/console\.error\([^;]*\)/g)].map((match) => match[0]);
    expect(logged.length).toBeGreaterThan(0);
    for (const call of logged) {
      expect(call).not.toContain('Authorization');
      expect(call).not.toMatch(/\bkey\b/);
      expect(call).not.toMatch(/\bprompt\b/);
      expect(call).not.toMatch(/\btext\b/);
    }
    expect(functionSchema).toEqual(CAPTURE_RESPONSE_SCHEMA);
  });
});

describe('parse-capture provider errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['gemini', 'claude', 'openai'] as const)('logs a non-OK %s response with the name, status, and body', async (provider) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = `quota exceeded for ${provider}`;
    const reply = await readProviderReply(provider, providerResponse(429, body));
    expect(reply).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(provider, 429, body);
  });

  it('caps the logged response body at 2000 characters', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await readProviderReply('gemini', providerResponse(503, 'a'.repeat(2000)));
    await readProviderReply('claude', providerResponse(503, 'b'.repeat(2001)));
    expect(error).toHaveBeenNthCalledWith(1, 'gemini', 503, 'a'.repeat(2000));
    expect(error).toHaveBeenNthCalledWith(2, 'claude', 503, 'b'.repeat(2000));
  });

  it('logs a response body that is not JSON', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = '<html>unavailable</html>';
    const reply = await readProviderReply('openai', providerResponse(200, body));
    expect(reply).toBeNull();
    expect(error).toHaveBeenCalledWith('openai', 200, body);
  });

  it('logs a model payload the function cannot parse', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] });
    const reply = await readProviderReply('gemini', providerResponse(200, body));
    expect(reply).toBeNull();
    expect(error).toHaveBeenCalledWith('gemini', 200, body);
  });

  it('logs a JSON body that is not a provider reply', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = JSON.stringify({ error: { message: 'schema rejected' } });
    const reply = await readProviderReply('claude', providerResponse(200, body));
    expect(reply).toBeNull();
    expect(error).toHaveBeenCalledWith('claude', 200, body);
  });

  it('does not log a reply it could parse', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const capture = { summary: 'Pick up dry cleaning.', confidence: 'high', actions: [] };
    const gemini = JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(capture) }] } }] });
    const claude = JSON.stringify({ content: [{ type: 'tool_use', input: capture }] });
    const openai = JSON.stringify({ choices: [{ message: { content: JSON.stringify(capture) } }] });
    expect(await readProviderReply('gemini', providerResponse(200, gemini))).toEqual(capture);
    expect(await readProviderReply('claude', providerResponse(200, claude))).toEqual(capture);
    expect(await readProviderReply('openai', providerResponse(200, openai))).toEqual(capture);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs a thrown error message with the provider name, capped at 2000 characters', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logThrownProviderError('openai', new Error('timed out'));
    logThrownProviderError('gemini', new Error('x'.repeat(2005)));
    expect(error).toHaveBeenNthCalledWith(1, 'openai', 'timed out');
    expect(error).toHaveBeenNthCalledWith(2, 'gemini', 'x'.repeat(2000));
  });

  it('strips the API key and the note from what it logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const note = 'Call the clinic about the lab results';
    const key = 'sk-live-secret-value';
    const secrets = [key, `Bearer ${key}`, note];
    const body = `bad request note=${note} Authorization: Bearer ${key} trailing`;
    await readProviderReply('openai', providerResponse(400, body), secrets);
    const logged = String(error.mock.calls[0]?.[2]);
    expect(logged).toBe('bad request note=[redacted] Authorization: [redacted] trailing');
    expect(logged).not.toContain(note);
    expect(logged).not.toContain(key);
    error.mockClear();
    logThrownProviderError('gemini', new Error(`failed for ${note} with ${key}`), secrets);
    const message = String(error.mock.calls[0]?.[1]);
    expect(message).toBe('failed for [redacted] with [redacted]');
    expect(message).not.toContain(note);
    expect(message).not.toContain(key);
  });

  it('lets a failed body read throw so the handler logs the message once', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = { ok: false, status: 500, text: () => Promise.reject(new Error('socket closed')) };
    await expect(readProviderReply('claude', res)).rejects.toThrow('socket closed');
    expect(error).not.toHaveBeenCalled();
  });

  it('uses gemini-3.8-flash unless GEMINI_MODEL is set, and does not log the override', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(resolveGeminiModel(undefined)).toBe('gemini-3.8-flash');
    expect(resolveGeminiModel('')).toBe('gemini-3.8-flash');
    expect(resolveGeminiModel('   ')).toBe('gemini-3.8-flash');
    expect(resolveGeminiModel(' override-model ')).toBe('override-model');
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('logs a retired model once, without the key or the selected model, and keeps both out of the error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = 'sk-live-secret-value';
    const model = 'override-model';
    const body = `This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash key=${key} tried=${model}`;
    let thrown: unknown;
    try {
      await readProviderReply('gemini', providerResponse(404, body), [key, `Bearer ${key}`, model]);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(ModelUnavailable);
    expect((thrown as Error).message).toBe('model_unavailable');
    expect((thrown as Error).message).not.toContain(key);
    expect((thrown as Error).message).not.toContain(body);
    expect(error).toHaveBeenCalledTimes(1);
    const logged = String(error.mock.calls[0]?.[2]);
    expect(error.mock.calls[0]?.[0]).toBe('gemini');
    expect(error.mock.calls[0]?.[1]).toBe(404);
    expect(logged).not.toContain(key);
    expect(logged).not.toContain(model);
    expect(logged).toContain('no longer available');
  });

  it.each([
    [404, 'models/gemini-3.8-flash is not found for API version v1beta'],
    [400, 'This model is no longer available'],
    [404, 'The model `gpt-4.1-mini` does not exist'],
    [404, 'model: claude-haiku-4-5'],
  ] as const)('treats %s %s as a missing model', async (status, body) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readProviderReply('gemini', providerResponse(status, body))).rejects.toBeInstanceOf(ModelUnavailable);
  });

  it('keeps an ordinary failure, including a 404 that names no model', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readProviderReply('gemini', providerResponse(404, JSON.stringify({ error: { code: 404, message: 'Not Found' } })))).toBeNull();
    expect(await readProviderReply('openai', providerResponse(500, 'The service is no longer available'))).toBeNull();
    expect(await readProviderReply('claude', providerResponse(429, 'quota exceeded'))).toBeNull();
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
