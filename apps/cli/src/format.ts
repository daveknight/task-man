import { addDays, APP_NAME, isOccurrenceHistory, localDate, repeatLabel, sortSubtasks, startOfWeek, subtaskCount, weekdayOf, HISTORY_ZONE, type Board, type CompletedLog, type ISODate, type RepeatRule, type Section, type Subtask, type Task, type TaskHistoryEntry } from '@app/core';
import type { BoardTask } from './commands.ts';

const SECTION_TITLES: Record<Section, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  ready: 'Ready',
  upcoming: 'Upcoming',
  completed: 'Completed',
  trash: 'Recently deleted',
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

/** The same phrase the repeat field shows, for `show`. Pass the due date so "Weekly on Thu" can read it. */
export function formatRepeat(rule: RepeatRule, due?: ISODate | null): string {
  return repeatLabel(rule, due);
}

/** This week and last week by name; any older week is its Monday–Sunday range. */
function weekLabel(start: ISODate, end: ISODate, today: ISODate): string {
  const current = startOfWeek(today);
  if (start === current) return 'This week';
  if (start === addDays(current, -7)) return 'Last week';
  return `${shortDate(start, today)} – ${shortDate(end, today)}`;
}

/** The completed log, newest week and day first. Matches the screen's grouping. */
export function formatCompletedLog(log: CompletedLog): string {
  const { today } = log;
  const out = [`Completed log · ${WEEKDAY_NAMES[weekdayOf(today)]} ${today}`, ''];
  if (log.weeks.length === 0) {
    out.push('Nothing finished yet.');
    return out.join('\n');
  }
  for (const week of log.weeks) {
    const collapsed = week.collapsedByDefault ? ' · collapsed by default' : '';
    out.push(`${weekLabel(week.start, week.end, today)} (${week.count})${collapsed}`);
    for (const day of week.days) {
      out.push(`  ${WEEKDAY_NAMES[weekdayOf(day.date)]} ${day.date}`);
      for (const entry of day.entries) {
        const due = entry.occurrenceDue ? `  — due ${shortDate(entry.occurrenceDue, today)}` : '';
        out.push(`    ${entry.id.slice(0, 8)}  ${entry.title}${due}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}

export function formatHistory(rows: readonly TaskHistoryEntry[]): string {
  if (rows.length === 0) return 'No history.';
  return rows
    .map((row) => {
      if (isOccurrenceHistory(row)) return `${row.completedOn}  ${row.kind}  due ${row.occurrenceDue}`;
      const day = localDate(new Date(row.at), HISTORY_ZONE);
      return `${day}  ${row.verb}${row.detail ? `  ${row.detail}` : ''}`;
    })
    .join('\n');
}

/** The subtasks, numbered the way `--done-subtask 2` and the other subtask flags count them. */
export function formatSubtasks(subtasks: readonly Subtask[] | undefined): string[] {
  const list = sortSubtasks(subtasks);
  if (list.length === 0) return [];
  const { done, total } = subtaskCount(list);
  return [`  subtasks ${done} of ${total}`, ...list.map((s, i) => `    ${i + 1}. [${s.done ? 'x' : ' '}] ${s.title}`)];
}
