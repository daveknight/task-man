import { readFileSync } from 'node:fs';
import {
  buildBoard,
  buildCompletedLog,
  MAIN_VIEW_ID,
  placementFor,
  subtaskCount,
  type Board,
  type CompletedLog,
  type ISODate,
  type SubtaskCount,
  type Task,
} from '@app/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { check } from './db.ts';
import { drainFileDeletions, loadSnapshot } from '@app/data';
import { planSeed, type SeedFile } from './seed-plan.ts';

export interface ResetResult {
  tasks: number;
  tags: number;
  tombstones: number;
}

/** Wipes every row the user owns. Positions, subtasks, tags links, completions and files cascade from tasks. */
export async function reset(db: SupabaseClient, userId: string): Promise<ResetResult> {
  const tasks = await db.from('tasks').delete({ count: 'exact' }).eq('user_id', userId);
  if (tasks.error) throw new Error(`delete tasks: ${tasks.error.message}`);
  // Task deletes queue the files. Storage only drops the bytes through its API.
  await drainFileDeletions({ db, userId });
  const tags = await db.from('tags').delete({ count: 'exact' }).eq('user_id', userId);
  if (tags.error) throw new Error(`delete tags: ${tags.error.message}`);
  // Last, because deleting tasks and tags writes tombstones.
  const tombstones = await db.from('tombstones').delete({ count: 'exact' }).eq('user_id', userId);
  if (tombstones.error) throw new Error(`delete tombstones: ${tombstones.error.message}`);
  return { tasks: tasks.count ?? 0, tags: tags.count ?? 0, tombstones: tombstones.count ?? 0 };
}

export interface SeedResult {
  today: ISODate;
  file: string;
  reset?: ResetResult;
  tasks: number;
  positions: number;
  subtasks: number;
  tags: number;
  skipped: Record<string, number>;
}

export async function seed(
  db: SupabaseClient,
  userId: string,
  options: { file: string; today: ISODate; reset: boolean },
): Promise<SeedResult> {
  const file = JSON.parse(readFileSync(options.file, 'utf8')) as SeedFile;
  const plan = planSeed(file, options.today, { userId });
  const resetResult = options.reset ? await reset(db, userId) : undefined;

  check(await db.from('tasks').insert(plan.tasks), 'insert tasks');
  if (plan.subtasks.length > 0) check(await db.from('subtasks').insert(plan.subtasks), 'insert subtasks');
  if (plan.tags.length > 0) check(await db.from('tags').insert(plan.tags), 'insert tags');
  if (plan.taskTags.length > 0) check(await db.from('task_tags').insert(plan.taskTags), 'insert task tags');
  if (plan.positions.length > 0) {
    check(
      await db
        .from('task_positions')
        .insert(plan.positions.map((p) => ({ ...p, user_id: userId, view_id: MAIN_VIEW_ID }))),
      'insert positions',
    );
  }
  return {
    today: options.today,
    file: options.file,
    ...(resetResult ? { reset: resetResult } : {}),
    tasks: plan.tasks.length,
    positions: plan.positions.length,
    subtasks: plan.subtasks.length,
    tags: plan.tags.length,
    skipped: plan.skipped,
  };
}

export interface BoardTask extends Task {
  placement: string;
  sortKey: string | null;
  hasDescription: boolean;
  overdue: boolean;
  subtaskCount: SubtaskCount;
}

export async function loadBoard(
  db: SupabaseClient,
  userId: string,
  options: { today: ISODate; completed: boolean; trash: boolean },
): Promise<Board<BoardTask>> {
  const snapshot = await loadSnapshot({ db, userId });
  const tasks: BoardTask[] = snapshot.tasks.map((task) => ({
    ...task,
    placement: placementFor(task, options.today),
    sortKey: snapshot.positions.get(task.id) ?? null,
    hasDescription: (task.description ?? '').trim() !== '',
    overdue: !!task.dueDate && task.dueDate < options.today && !task.completedAt,
    subtaskCount: subtaskCount(task.subtasks),
  }));
  return buildBoard(tasks, snapshot.positions, options.today, {
    showCompleted: options.completed,
    showTrash: options.trash,
  });
}

/** The completed log, grouped the same way the app shows it. */
export async function loadCompletedLog(db: SupabaseClient, userId: string, today: ISODate): Promise<CompletedLog> {
  const snapshot = await loadSnapshot({ db, userId });
  return buildCompletedLog(snapshot.tasks, snapshot.completions, today);
}
