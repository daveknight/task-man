import {
  APP_NAME,
  buildBoard,
  isValidDate,
  localDate,
  MAIN_VIEW_ID,
  type Board,
  type Task,
} from '@app/core';
import { useEffect, useState } from 'react';
import { BoardView } from './components/board/board-view.tsx';
import { Toolbar } from './components/board/toolbar.tsx';
import { ensureDevSession, supabase, supabaseConfigured } from './supabase.ts';

/** Dev-only `?today=YYYY-MM-DD`, matching the CLI's --today. */
function today(): string {
  const param = new URLSearchParams(window.location.search).get('today');
  return import.meta.env.DEV && param && isValidDate(param) ? param : localDate();
}

interface Row {
  id: string;
  title: string;
  description: string;
  status: Task['status'];
  wait_until: string | null;
  flagged: boolean;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_on: string | null;
  deleted_at: string | null;
  deleted_on: string | null;
  created_at: string;
}

async function loadBoard(day: string): Promise<Board> {
  // No user filter: row-level security returns only the signed-in user's rows.
  const [tasks, positions] = await Promise.all([
    supabase.from('tasks').select('*').returns<Row[]>(),
    supabase.from('task_positions').select('task_id,sort_key').eq('view_id', MAIN_VIEW_ID),
  ]);
  if (tasks.error) throw tasks.error;
  if (positions.error) throw positions.error;
  const list: Task[] = tasks.data.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    waitUntil: r.wait_until,
    flagged: r.flagged,
    startDate: r.start_date,
    dueDate: r.due_date,
    completedAt: r.completed_at,
    completedOn: r.completed_on,
    deletedAt: r.deleted_at,
    deletedOn: r.deleted_on,
    createdAt: r.created_at,
  }));
  return buildBoard(list, new Map(positions.data.map((p) => [p.task_id, p.sort_key])), day);
}

export function App() {
  const [day] = useState(today);
  const [user, setUser] = useState<string>();
  const [board, setBoard] = useState<Board>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    document.title = APP_NAME;
    if (!supabaseConfigured) {
      setError('Local Supabase is not running. Start it with `npm run db:start`, then restart the dev server.');
      return;
    }
    ensureDevSession()
      .then((email) => {
        setUser(email);
        return loadBoard(day);
      })
      .then(setBoard)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [day]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-row-x pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Toolbar
        title={APP_NAME}
        subtitle={
          <>
            Read-only · {day}
            {user && <> · {user}</>}
          </>
        }
      />
      {error && <p className="px-row-x text-destructive">{error}</p>}
      {board && <BoardView board={board} today={day} />}
    </main>
  );
}
