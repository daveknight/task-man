import { planSeed, type SeedFile } from '@app/cli/seed-plan';
import { taskFromRow } from '@app/data';
import { buildBoard, isValidDate, type Board, type ISODate, type Task } from '@app/core';
import seedFile from '../../../../seed/tasks.json';

/** The pinned Wednesday CI seeds at, so the design screens match `cli board --today 2026-11-18`. */
export const DESIGN_TODAY = '2026-11-18';

export function designToday(): ISODate {
  const param = new URLSearchParams(window.location.search).get('today');
  return param && isValidDate(param) ? param : DESIGN_TODAY;
}

export interface SeedBoard {
  board: Board;
  /** Completed and Trash too, for the action presets of those states. */
  everything: Board;
  recurring: (task: Task) => boolean;
  byTitle: (prefix: string) => Task;
}

export function seedBoard(today: ISODate): SeedBoard {
  let n = 0;
  const file = seedFile as SeedFile;
  const plan = planSeed(file, today, {
    userId: 'design',
    now: new Date(`${today}T08:00:00Z`),
    newId: () => `seed-${String(++n).padStart(2, '0')}`,
  });
  const tasks = plan.tasks.map((row) => taskFromRow({ ...row, updated_at: row.created_at }));
  const positions = new Map(plan.positions.map((p) => [p.task_id, p.sort_key]));
  const repeating = new Set(file.tasks.filter((t) => t.repeat).map((t) => t.title));
  return {
    board: buildBoard(tasks, positions, today),
    everything: buildBoard(tasks, positions, today, { showCompleted: true, showTrash: true }),
    recurring: (task) => repeating.has(task.title),
    byTitle: (prefix) => {
      const task = tasks.find((t) => t.title.startsWith(prefix));
      if (!task) throw new Error(`No seed task starts with "${prefix}"`);
      return task;
    },
  };
}
