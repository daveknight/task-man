import { APP_NAME, sortSubtasks, subtaskCount, weekdayOf, type Board, type ISODate, type Section, type Subtask, type Task } from '@app/core';
import type { BoardTask } from './commands.ts';

const SECTION_TITLES: Record<Section, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  ready: 'Ready',
  upcoming: 'Upcoming',
  completed: 'Completed',
  trash: 'Trash',
};

const WEEKDAY_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' } as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(date: ISODate, today: ISODate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const label = `${MONTHS[m - 1]} ${d}`;
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${y}`;
}

function details(task: BoardTask, today: ISODate): string {
  const parts: string[] = [];
  if (task.subtaskCount.total > 0) parts.push(`subtasks ${task.subtaskCount.done}/${task.subtaskCount.total}`);
  if (task.tags?.length) parts.push(`tags ${task.tags.map((t) => t.name).join(', ')}`);
  if (task.hideUntil && task.placement.startsWith('waiting')) parts.push(`hide until ${shortDate(task.hideUntil, today)}`);
  if (task.startDate && task.placement === 'upcoming') parts.push(`starts ${shortDate(task.startDate, today)}`);
  if (task.dueDate) parts.push(`due ${shortDate(task.dueDate, today)}${task.overdue ? ' (overdue)' : task.dueDate === today ? ' (today)' : ''}`);
  if (task.completedOn) parts.push(`done ${shortDate(task.completedOn, today)}`);
  if (task.deletedOn) parts.push(`deleted ${shortDate(task.deletedOn, today)}`);
  return parts.join(' · ');
}

function line(task: BoardTask, today: ISODate, indent: string): string {
  const flag = task.flagged ? '⚑ ' : '';
  const note = task.hasDescription ? ' ≡' : '';
  const info = details(task, today);
  return `${indent}${task.id.slice(0, 8)}  ${flag}${task.title}${note}${info ? `  — ${info}` : ''}`;
}

const PLACEMENT_TITLES: Record<string, string> = {
  ...SECTION_TITLES,
  waiting: 'Waiting (needs follow-up)',
  waiting_later: 'Hidden until later',
  deleted_forever: 'deleted forever',
};

/** One task with where it now shows: `abcd1234  Title  — due Nov 20 · [Ready]`. */
export function formatTask({ task, placement }: { task: Task; placement: string }, today: ISODate): string {
  const info = details(
    {
      ...task,
      placement,
      sortKey: null,
      hasDescription: (task.description ?? '').trim() !== '',
      overdue: !!task.dueDate && task.dueDate < today && !task.completedAt,
      subtaskCount: subtaskCount(task.subtasks),
    },
    today,
  );
  return `${task.id.slice(0, 8)}  ${task.flagged ? '⚑ ' : ''}${task.title}${info ? `  — ${info}` : ''}  [${PLACEMENT_TITLES[placement] ?? placement}]`;
}

export function formatBoard(board: Board<BoardTask>): string {
  const { today } = board;
  const out = [`${APP_NAME} · ${WEEKDAY_NAMES[weekdayOf(today)]} ${today}`, ''];
  for (const section of board.sections) {
    const collapsed = section.collapsedByDefault ? ' · collapsed by default' : '';
    out.push(`${SECTION_TITLES[section.id]} (${section.count})${collapsed}`);
    for (const task of section.tasks) out.push(line(task, today, '  '));
    if (section.later && section.later.length > 0) {
      out.push(`  Show ${section.later.length} hidden until later`);
      for (const task of section.later) out.push(line(task, today, '    '));
    }
    out.push('');
  }
  return out.join('\n');
}

/** The subtasks, numbered the way `--done-subtask 2` and the other subtask flags count them. */
export function formatSubtasks(subtasks: readonly Subtask[] | undefined): string[] {
  const list = sortSubtasks(subtasks);
  if (list.length === 0) return [];
  const { done, total } = subtaskCount(list);
  return [`  subtasks ${done} of ${total}`, ...list.map((s, i) => `    ${i + 1}. [${s.done ? 'x' : ' '}] ${s.title}`)];
}
