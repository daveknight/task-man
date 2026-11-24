import { applyPlan, applySubtaskChange, applyTagChange, applyTaskTagChange, planChange, planNewTask, type ISODate, type PositionWrite, type SubtaskChange, type TagChange, type Task, type TaskTagChange } from '@app/core';
import { deleteForever, insertTask, loadSnapshot, searchTasks, writeChange, writeSubtaskChange, writeTagChange, writeTaskTagChange, type Scope, type SearchOptions, type Snapshot } from '@app/data';
import { keepPreviousData, notifyManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { currentSession, supabase, supabaseConfigured } from '@/supabase';

const SNAPSHOT_KEY = ['snapshot'] as const;

// React Query hands cache changes to components on a zero-delay timer by default. A dropped row would then
// render in its old place first, and the drag overlay's drop animation, which measures that render, would
// fly back to it. Delivering changes in the same tick keeps the board in step with the user's action.
notifyManager.setScheduler((callback) => callback());

/** The signed-in user's scope; every query runs as that user, through row-level security. */
async function scope(): Promise<Scope> {
  return { db: supabase, userId: (await currentSession()).userId };
}

export function useSnapshot() {
  return useQuery({
    queryKey: SNAPSHOT_KEY,
    enabled: supabaseConfigured,
    queryFn: async () => loadSnapshot(await scope()),
  });
}

/** Full-text search on the server, which also finds completed tasks the board leaves out. Never Trash. */
export function useSearch(query: string, options: SearchOptions, enabled: boolean) {
  return useQuery({
    queryKey: ['search', query, options],
    enabled: supabaseConfigured && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => searchTasks(await scope(), query, options),
  });
}

export interface ChangeOptions {
  /** A drag-and-drop placement, which wins over the transition table. */
  drop?: PositionWrite[];
}

/**
 * Writes through `@app/data` with an optimistic update: the board changes at once, and a failed
 * write rolls back with an error toast. Offline, nothing is written: the board is read-only.
 */
export function useTaskWrites(today: ISODate) {
  const client = useQueryClient();

  const current = useCallback((): Snapshot => client.getQueryData<Snapshot>(SNAPSHOT_KEY) ?? { tasks: [], positions: new Map(), tags: [] }, [client]);

  const run = useCallback(
    async (optimistic: Snapshot, write: (s: Scope) => Promise<unknown>) => {
      if (!navigator.onLine) {
        toast("You're offline. Changes are paused until you're back online.");
        throw new Error('offline');
      }
      const previous = current();
      // The board must change in the same tick as the user's action. A drag's drop animation measures
      // where the row ended up the moment the drag ends, so awaiting before this would send the
      // overlay back to the row's old place. Cancelling without reverting keeps the optimistic data.
      const cancelled = client.cancelQueries({ queryKey: SNAPSHOT_KEY }, { revert: false });
      client.setQueryData(SNAPSHOT_KEY, optimistic);
      await cancelled;
      try {
        await write(await scope());
      } catch (error) {
        client.setQueryData(SNAPSHOT_KEY, previous);
        toast.error(`Couldn't save: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      } finally {
        void client.invalidateQueries({ queryKey: SNAPSHOT_KEY });
        void client.invalidateQueries({ queryKey: ['search'] });
      }
    },
    [client, current],
  );

  const change = useCallback(
    async (before: Task, after: Task, options: ChangeOptions = {}) => {
      const snapshot = current();
      const plan = planChange(snapshot.tasks, snapshot.positions, before, after, today, options.drop);
      await run({ ...applyPlan(snapshot.tasks, snapshot.positions, after, plan), tags: snapshot.tags }, (s) => writeChange(s, after.id, plan));
    },
    [current, run, today],
  );

  const add = useCallback(
    async (task: Task) => {
      const snapshot = current();
      const positions = planNewTask(snapshot.tasks, snapshot.positions, task, today);
      const next = new Map(snapshot.positions);
      for (const w of positions) next.set(w.taskId, w.sortKey);
      const optimistic = { ...task, createdAt: new Date().toISOString() };
      await run({ tasks: [...snapshot.tasks, optimistic], positions: next, tags: snapshot.tags }, (s) => insertTask(s, task, positions));
    },
    [current, run, today],
  );

  /** One subtask write. It builds on the task as the board has it now, so quick edits one after another all land. */
  const subtask = useCallback(
    async (task: Task, change: SubtaskChange) => {
      const snapshot = current();
      const tasks = snapshot.tasks.map((t) => (t.id === task.id ? { ...t, subtasks: applySubtaskChange(t.subtasks, change) } : t));
      await run({ ...snapshot, tasks }, (s) => writeSubtaskChange(s, task.id, change));
    },
    [current, run],
  );

  /**
   * Puts one tag on or off a task. `create` is a new tag made in the same step (typed in the picker),
   * written first so the link has something to point at.
   */
  const taskTag = useCallback(
    async (task: Task, change: TaskTagChange, create?: TagChange) => {
      const snapshot = current();
      const tags = create ? applyTagChange({ tags: snapshot.tags, tasks: [] }, create).tags : snapshot.tags;
      const tasks = snapshot.tasks.map((t) => (t.id === task.id ? { ...t, tags: applyTaskTagChange(t.tags, change) } : t));
      await run({ ...snapshot, tasks, tags }, async (s) => {
        if (create) await writeTagChange(s, create);
        await writeTaskTagChange(s, task.id, change);
      });
    },
    [current, run],
  );

  /** Creates, renames or deletes a tag. A rename or delete shows on every task that has it at once. */
  const tagList = useCallback(
    async (change: TagChange) => {
      const snapshot = current();
      const next = applyTagChange({ tags: snapshot.tags, tasks: snapshot.tasks }, change);
      await run({ ...snapshot, tasks: next.tasks, tags: next.tags }, (s) => writeTagChange(s, change));
    },
    [current, run],
  );

  const remove = useCallback(
    async (task: Task) => {
      const snapshot = current();
      const positions = new Map(snapshot.positions);
      positions.delete(task.id);
      await run({ ...snapshot, tasks: snapshot.tasks.filter((t) => t.id !== task.id), positions }, (s) => deleteForever(s, task.id));
    },
    [current, run],
  );

  return useMemo(() => ({ change, add, subtask, taskTag, tagList, remove, current }), [change, add, subtask, taskTag, tagList, remove, current]);
}

export type TaskWrites = ReturnType<typeof useTaskWrites>;
