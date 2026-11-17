import { applyPlan, planChange, planNewTask, type ISODate, type PositionWrite, type Task } from '@app/core';
import { deleteForever, insertTask, loadSnapshot, searchTasks, writeChange, type Scope, type SearchOptions, type Snapshot } from '@app/data';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ensureDevSession, supabase, supabaseConfigured } from '@/supabase';

const SNAPSHOT_KEY = ['snapshot'] as const;

let scopePromise: Promise<Scope> | null = null;

/** The signed-in user's scope. Locally, signs in as the dev user. */
function scope(): Promise<Scope> {
  scopePromise ??= ensureDevSession().then((session) => ({ db: supabase, userId: session.userId }));
  return scopePromise;
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
 * write rolls back with an error toast.
 */
export function useTaskWrites(today: ISODate) {
  const client = useQueryClient();

  const current = useCallback((): Snapshot => client.getQueryData<Snapshot>(SNAPSHOT_KEY) ?? { tasks: [], positions: new Map() }, [client]);

  const run = useCallback(
    async (optimistic: Snapshot, write: (s: Scope) => Promise<unknown>) => {
      const previous = current();
      await client.cancelQueries({ queryKey: SNAPSHOT_KEY });
      client.setQueryData(SNAPSHOT_KEY, optimistic);
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
      await run(applyPlan(snapshot.tasks, snapshot.positions, after, plan), (s) => writeChange(s, after.id, plan));
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
      await run({ tasks: [...snapshot.tasks, optimistic], positions: next }, (s) => insertTask(s, task, positions));
    },
    [current, run, today],
  );

  const remove = useCallback(
    async (task: Task) => {
      const snapshot = current();
      const positions = new Map(snapshot.positions);
      positions.delete(task.id);
      await run({ tasks: snapshot.tasks.filter((t) => t.id !== task.id), positions }, (s) => deleteForever(s, task.id));
    },
    [current, run],
  );

  return useMemo(() => ({ change, add, remove, current }), [change, add, remove, current]);
}

export type TaskWrites = ReturnType<typeof useTaskWrites>;
