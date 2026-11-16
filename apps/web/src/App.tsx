import {
  APP_NAME,
  buildBoard,
  isValidDate,
  localDate,
  MAIN_VIEW_ID,
  type Board,
  type Section,
  type Task,
} from '@app/core';
import { useEffect, useState } from 'react';
import { ensureDevSession, supabase, supabaseConfigured } from './supabase.ts';

const TITLES: Record<Section, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  ready: 'Ready',
  upcoming: 'Upcoming',
  completed: 'Completed',
  trash: 'Trash',
};

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
  waiting_on: string | null;
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
    waitingOn: r.waiting_on,
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

function TaskRow({ task, day }: { task: Task; day: string }) {
  const overdue = task.dueDate && task.dueDate < day;
  return (
    <li>
      {task.flagged && <span className="flag">⚑ </span>}
      {task.title}
      {task.waitingOn && <span className="meta"> · {task.waitingOn}</span>}
      {task.dueDate && <span className={overdue ? 'meta overdue' : 'meta'}> · due {task.dueDate}</span>}
    </li>
  );
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
    <main>
      <header>
        <h1>{APP_NAME}</h1>
        <p className="meta">
          Phase 0 placeholder · {day}
          {user && <> · signed in as {user}</>}
        </p>
      </header>
      {error && <p className="error">{error}</p>}
      {board?.sections.map((section) => (
        <details key={section.id} open={!section.collapsedByDefault} data-section={section.id}>
          <summary>
            {TITLES[section.id]} <span className="meta">({section.count})</span>
          </summary>
          <ul>
            {section.tasks.map((t) => (
              <TaskRow key={t.id} task={t} day={day} />
            ))}
          </ul>
          {section.later && section.later.length > 0 && (
            <details className="later">
              <summary>Show {section.later.length} waiting until later</summary>
              <ul>
                {section.later.map((t) => (
                  <TaskRow key={t.id} task={t} day={day} />
                ))}
              </ul>
            </details>
          )}
        </details>
      ))}
    </main>
  );
}
