import { addDays, addMonths, nextWeekdayOnOrAfter, placementFor, type ISODate, type Placement, type Task } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import { longDate } from '@/lib/day-label';

export interface Preset {
  label: string;
  icon: IconMeaning;
  /** The day it lands on, shown under the label. */
  caption?: string;
  destructive?: boolean;
}

export interface ActionGroup {
  /** Button and menu label, e.g. "Due", "Wait until". */
  title: string;
  icon: IconMeaning;
  presets: Preset[];
}

export interface RowActions {
  placement: Placement;
  date: ActionGroup | null;
  state: ActionGroup[];
  delete: 'Delete' | 'Delete forever';
}

export interface ActionContext {
  recurring?: boolean;
}

function at(label: string, icon: IconMeaning, date: ISODate, today: ISODate): Preset {
  return { label, icon, caption: longDate(date, today) };
}

const nextMonday = (today: ISODate) => nextWeekdayOnOrAfter(addDays(today, 1), ['mon']);

function duePresets(task: Task, today: ISODate, context: ActionContext): Preset[] {
  const presets: Preset[] = [];
  if (task.dueDate && task.dueDate < today) presets.push(at('+1 day', 'dueDate', addDays(task.dueDate, 1), today));
  presets.push(
    at('Today', 'dueDate', today, today),
    at('Tomorrow', 'dueDate', addDays(today, 1), today),
    at('Next Monday', 'dueDate', nextMonday(today), today),
    { label: 'Pick date', icon: 'pickDate' },
  );
  if (context.recurring) presets.push({ label: 'Skip this occurrence', icon: 'skip' });
  if (task.dueDate) presets.push({ label: 'Clear', icon: 'clear' });
  return presets;
}

/** Wait until and Extend wait. Saturday is the coming one, left out on Fridays when it would repeat Tomorrow. */
function waitPicks(today: ISODate): Preset[] {
  const tomorrow = addDays(today, 1);
  const saturday = nextWeekdayOnOrAfter(tomorrow, ['sat']);
  return [
    at('Tomorrow', 'waiting', tomorrow, today),
    ...(saturday === tomorrow ? [] : [at('Saturday', 'waiting', saturday, today)]),
    at('1 week', 'waiting', addDays(today, 7), today),
    { label: 'Pick date', icon: 'pickDate' },
    { label: 'No date', icon: 'clear' },
  ];
}

/** Start presets that would put the start after the due date are hidden. */
function startPresets(task: Task, today: ISODate): Preset[] {
  const fits = (date: ISODate) => !task.dueDate || date <= task.dueDate;
  const presets: Preset[] = [at('Start today', 'startDate', today, today)];
  const week = addDays(today, 7);
  const month = addMonths(today, 1);
  if (fits(week)) presets.push(at('+1 week', 'startDate', week, today));
  if (fits(month)) presets.push(at('Next month', 'startDate', month, today));
  presets.push({ label: 'Pick date', icon: 'pickDate' }, { label: 'Clear', icon: 'clear' });
  return presets;
}

/** What the swipe buttons, right-click menu and hover buttons offer for a task. */
export function rowActionsFor(task: Task, today: ISODate, context: ActionContext = {}): RowActions {
  const placement = placementFor(task, today);
  const due: ActionGroup = { title: 'Due', icon: 'dueDate', presets: duePresets(task, today, context) };
  const resume: ActionGroup = { title: 'Resume', icon: 'inProgress', presets: [] };
  switch (placement) {
    case 'ready':
    case 'in_progress':
      return {
        placement,
        date: due,
        state: [{ title: 'Wait until', icon: 'waiting', presets: waitPicks(today) }],
        delete: 'Delete',
      };
    case 'waiting':
      return {
        placement,
        date: due,
        state: [{ title: 'Extend wait', icon: 'waiting', presets: waitPicks(today) }, resume],
        delete: 'Delete',
      };
    case 'waiting_later':
      return {
        placement,
        date: {
          title: 'Check back',
          icon: 'waiting',
          presets: [
            at('Tomorrow', 'waiting', addDays(today, 1), today),
            at('+3 days', 'waiting', addDays(today, 3), today),
            at('+1 week', 'waiting', addDays(today, 7), today),
            { label: 'Pick date', icon: 'pickDate' },
            { label: 'Now', icon: 'followUp' },
          ],
        },
        state: [resume],
        delete: 'Delete',
      };
    case 'upcoming':
      return {
        placement,
        date: { title: 'Start', icon: 'startDate', presets: startPresets(task, today) },
        state: [{ title: 'Start now', icon: 'inProgress', presets: [] }],
        delete: 'Delete',
      };
    case 'completed':
      return { placement, date: null, state: [{ title: 'Mark not done', icon: 'restore', presets: [] }], delete: 'Delete' };
    case 'trash':
      return { placement, date: null, state: [{ title: 'Restore', icon: 'restore', presets: [] }], delete: 'Delete forever' };
  }
}

