import { addDays, addMonths, nextWeekdayOnOrAfter } from './dates.ts';
import { placementFor } from './sections.ts';
import type { ISODate, Placement, Status, Task } from './types.ts';

/** Icon meanings, named as in `@app/tokens`' icon map. */
export type ActionIcon =
  | 'dueDate'
  | 'startDate'
  | 'waiting'
  | 'hideUntil'
  | 'pickDate'
  | 'clear'
  | 'skip'
  | 'followUp'
  | 'inProgress'
  | 'resume'
  | 'restore'
  | 'trash';

export type DateField = 'due' | 'start' | 'hideUntil';

/** What tapping a preset does. `pick` opens a date picker limited to `min`..`max`. */
export type PresetEffect =
  | { kind: 'set'; field: DateField; date: ISODate | null }
  | { kind: 'pick'; field: DateField; min?: ISODate; max?: ISODate }
  | { kind: 'skip' };

export interface Preset {
  id: string;
  label: string;
  icon: ActionIcon;
  effect: PresetEffect;
}

/** What an action without presets does. */
export type GroupEffect = { kind: 'status'; to: Status } | { kind: 'undone' } | { kind: 'restore' };

export type ActionGroupId = 'due' | 'start' | 'checkBack' | 'moveToWaiting' | 'extendWait' | 'moveToInProgress' | 'startNow' | 'markNotDone' | 'restore';

export interface ActionGroup {
  id: ActionGroupId;
  /** Button, tooltip and menu label. */
  title: string;
  icon: ActionIcon;
  /** Quick picks; empty when the action happens straight away (`effect`). */
  presets: Preset[];
  effect?: GroupEffect;
}

export interface RowActions {
  placement: Placement;
  /** The date button (orange). */
  date: ActionGroup | null;
  /** The state buttons (blue): one, or two for a Waiting task that needs follow-up. */
  state: ActionGroup[];
  delete: { id: 'delete' | 'deleteForever'; title: string };
}

export interface ActionContext {
  recurring?: boolean;
}

const set = (id: string, label: string, icon: ActionIcon, field: DateField, date: ISODate | null): Preset => ({
  id,
  label,
  icon,
  effect: { kind: 'set', field, date },
});

const nextMonday = (today: ISODate) => nextWeekdayOnOrAfter(addDays(today, 1), ['mon']);

function duePresets(task: Task, today: ISODate, context: ActionContext): Preset[] {
  const tomorrow = addDays(today, 1);
  const presets: Preset[] = [];
  // A day after the current due date. Left out when that would be tomorrow or earlier (due today or
  // overdue): the Tomorrow tile covers it, and the due date never moves to a past day.
  if (task.dueDate && task.dueDate > today) presets.push(set('plus1d', '+1 day', 'dueDate', 'due', addDays(task.dueDate, 1)));
  presets.push(
    set('today', 'Today', 'dueDate', 'due', today),
    set('tomorrow', 'Tomorrow', 'dueDate', 'due', tomorrow),
    set('nextMonday', 'Next Monday', 'dueDate', 'due', nextMonday(today)),
    { id: 'pick', label: 'Pick date', icon: 'pickDate', effect: { kind: 'pick', field: 'due' } },
  );
  if (context.recurring) presets.push({ id: 'skip', label: 'Skip this occurrence', icon: 'skip', effect: { kind: 'skip' } });
  if (task.dueDate) presets.push(set('clear', 'No due date', 'clear', 'due', null));
  return presets;
}

/**
 * Hide until, counted from today and not capped by the due date. Saturday is the coming one, left
 * out on Fridays when it would repeat Tomorrow. The same picks show whenever a task's status
 * changes to Waiting, and again as "Hide until" on a task that already needs follow-up.
 */
export function waitPresets(today: ISODate): Preset[] {
  const tomorrow = addDays(today, 1);
  const saturday = nextWeekdayOnOrAfter(tomorrow, ['sat']);
  return [
    set('tomorrow', 'Tomorrow', 'waiting', 'hideUntil', tomorrow),
    ...(saturday === tomorrow ? [] : [set('saturday', 'Saturday', 'waiting', 'hideUntil', saturday)]),
    set('week', '1 week', 'waiting', 'hideUntil', addDays(today, 7)),
    { id: 'pick', label: 'Pick date', icon: 'pickDate', effect: { kind: 'pick', field: 'hideUntil', min: today } },
    set('noDate', "Don't hide", 'clear', 'hideUntil', null),
  ];
}

/** Start presets count from today; ones that would put the start after the due date are hidden. */
/**
 * Dropping a task into Upcoming: a start date from tomorrow on, never after the due date. The task
 * becomes Open with that start. Empty when the task is due today or earlier (see `planUpcomingDrop`).
 */
export function upcomingDropPresets(task: Task, today: ISODate): Preset[] {
  const fits = (date: ISODate) => !task.dueDate || date <= task.dueDate;
  const tomorrow = addDays(today, 1);
  if (!fits(tomorrow)) return [];
  const presets = [
    set('tomorrow', 'Tomorrow', 'startDate', 'start', tomorrow),
    set('week', '+1 week', 'startDate', 'start', addDays(today, 7)),
    set('twoWeeks', '+2 weeks', 'startDate', 'start', addDays(today, 14)),
  ].filter((p) => p.effect.kind === 'set' && p.effect.date !== null && fits(p.effect.date));
  presets.push({ id: 'pick', label: 'Pick date', icon: 'pickDate', effect: { kind: 'pick', field: 'start', min: tomorrow, ...(task.dueDate ? { max: task.dueDate } : {}) } });
  return presets;
}

export function startPresets(task: Task, today: ISODate): Preset[] {
  const fits = (date: ISODate) => !task.dueDate || date <= task.dueDate;
  const presets: Preset[] = [];
  if (fits(today)) presets.push(set('today', 'Start today', 'startDate', 'start', today));
  const week = addDays(today, 7);
  const month = addMonths(today, 1);
  if (fits(week)) presets.push(set('week', '+1 week', 'startDate', 'start', week));
  if (fits(month)) presets.push(set('month', 'Next month', 'startDate', 'start', month));
  presets.push(
    { id: 'pick', label: 'Pick date', icon: 'pickDate', effect: { kind: 'pick', field: 'start', ...(task.dueDate ? { max: task.dueDate } : {}) } },
    set('clear', 'No start date', 'clear', 'start', null),
  );
  return presets;
}

/** Hide until presets for a task hidden until later, counted from today. Now makes it need follow-up. */
function checkBackPresets(today: ISODate): Preset[] {
  return [
    set('tomorrow', 'Tomorrow', 'waiting', 'hideUntil', addDays(today, 1)),
    set('plus3d', '+3 days', 'waiting', 'hideUntil', addDays(today, 3)),
    set('week', '+1 week', 'waiting', 'hideUntil', addDays(today, 7)),
    { id: 'pick', label: 'Pick date', icon: 'pickDate', effect: { kind: 'pick', field: 'hideUntil', min: today } },
    set('now', 'Now', 'followUp', 'hideUntil', today),
  ];
}

/** Shared label for the extendWait and checkBack groups, which only Waiting tasks offer. The ids stay distinct. */
export const HIDE_UNTIL = 'Hide until';

export const MOVE_TO_IN_PROGRESS = 'Move to In Progress';

export const MOVE_TO_WAITING = 'Move to Waiting';

/** A status change, so the app opens the Hide until picker, like every other way into Waiting. */
const moveToWaiting: ActionGroup = {
  id: 'moveToWaiting',
  title: MOVE_TO_WAITING,
  icon: 'waiting',
  presets: [],
  effect: { kind: 'status', to: 'waiting' },
};

const moveToInProgress: ActionGroup = {
  id: 'moveToInProgress',
  title: MOVE_TO_IN_PROGRESS,
  icon: 'resume',
  presets: [],
  effect: { kind: 'status', to: 'in_progress' },
};

const DELETE = { id: 'delete', title: 'Delete' } as const;

/**
 * What the swipe buttons, right-click menu and hover buttons offer for a task. One function for
 * every client, so they always match.
 */
export function actionsFor(task: Task, today: ISODate, context: ActionContext = {}): RowActions {
  const placement = placementFor(task, today);
  const due: ActionGroup = { id: 'due', title: 'Due', icon: 'dueDate', presets: duePresets(task, today, context) };
  switch (placement) {
    case 'ready':
    case 'in_progress':
      return { placement, date: due, state: [moveToWaiting], delete: DELETE };
    case 'waiting':
      return {
        placement,
        date: due,
        state: [{ id: 'extendWait', title: HIDE_UNTIL, icon: 'hideUntil', presets: waitPresets(today) }, moveToInProgress],
        delete: DELETE,
      };
    case 'waiting_later':
      return {
        placement,
        date: { id: 'checkBack', title: HIDE_UNTIL, icon: 'hideUntil', presets: checkBackPresets(today) },
        state: [moveToInProgress],
        delete: DELETE,
      };
    case 'upcoming':
      return {
        placement,
        date: { id: 'start', title: 'Start', icon: 'startDate', presets: startPresets(task, today) },
        state: [{ id: 'startNow', title: 'Start now', icon: 'inProgress', presets: [], effect: { kind: 'status', to: 'in_progress' } }],
        delete: DELETE,
      };
    case 'completed':
      return { placement, date: null, state: [{ id: 'markNotDone', title: 'Mark not done', icon: 'restore', presets: [], effect: { kind: 'undone' } }], delete: DELETE };
    case 'trash':
      return {
        placement,
        date: null,
        state: [{ id: 'restore', title: 'Restore', icon: 'restore', presets: [], effect: { kind: 'restore' } }],
        delete: { id: 'deleteForever', title: 'Delete forever' },
      };
  }
}
