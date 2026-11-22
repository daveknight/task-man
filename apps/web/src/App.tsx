import { APP_NAME, buildBoard, type Task } from '@app/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardActionsProvider } from './components/board/board-actions.tsx';
import { BoardView, RowList } from './components/board/board-view.tsx';
import { SearchDialog } from './components/board/search-dialog.tsx';
import { TWO_PANE_QUERY } from './components/board/surface.tsx';
import { TaskPane, TaskSheet } from './components/board/task-sheet.tsx';
import { AddTaskFab, FAB_CLEARANCE, Toolbar } from './components/board/toolbar.tsx';
import { Icon } from './components/icon.tsx';
import { Toaster } from './components/ui/sonner.tsx';
import { useSnapshot, useTaskWrites, type TaskWrites } from './data/board-data.ts';
import { longDate } from './lib/day-label.ts';
import { usePersistedBoolean } from './lib/persisted.ts';
import { useToday } from './lib/today.ts';
import { useOnline } from './lib/online.ts';
import { useMediaQuery } from './lib/use-media-query.ts';
import { supabaseConfigured } from './supabase.ts';

/** The quick-add row at the top of the board. New tasks go to the top of Ready; Enter adds and stays open for the next one. */
function QuickAdd({ writes, onClose }: { writes: TaskWrites; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const add = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle('');
    void writes
      .add({ id: crypto.randomUUID(), title: trimmed, description: '', status: 'open', flagged: false, startDate: null, hideUntil: null, dueDate: null })
      .catch(() => {});
  };
  return (
    <RowList className="mb-section-gap max-sm:-mx-row-x max-sm:rounded-none">
      <label className="flex min-h-row items-center gap-row-gap pr-row-x pl-task-lead">
        <span className="flex size-checkbox items-center justify-center text-link">
          <Icon name="add" weight="bold" className="size-icon" />
        </span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') onClose();
          }}
          onBlur={() => !title.trim() && onClose()}
          placeholder="New task"
          aria-label="New task"
          className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
        />
      </label>
    </RowList>
  );
}

export function App() {
  const today = useToday();
  const snapshot = useSnapshot();
  const writes = useTaskWrites(today);
  const twoPane = useMediaQuery(TWO_PANE_QUERY);
  const online = useOnline();
  const [view, setView] = useState<'board' | 'trash'>('board');
  const [showCompleted, setShowCompleted] = usePersistedBoolean('board:showCompleted', false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Floating layers (menus, dialogs, toasts) are portaled outside the app container, so they never count as off the list.
  const paneOpen = twoPane && !!selectedId;
  useEffect(() => {
    if (!paneOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (e.button !== 0 || !e.isPrimary || !appRef.current?.contains(target) || target.closest('[data-slot=task-row], [data-slot=task-pane]')) return;
      setSelectedId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [paneOpen]);

  const data = snapshot.data;
  const board = useMemo(
    () => (data ? buildBoard(data.tasks, data.positions, today, view === 'trash' ? { showTrash: true } : { showCompleted }) : null),
    [data, today, view, showCompleted],
  );
  const shown = useMemo(() => (board && view === 'trash' ? { ...board, sections: board.sections.filter((s) => s.id === 'trash') } : board), [board, view]);
  const selected = data?.tasks.find((t) => t.id === selectedId) ?? null;

  const open = useCallback((task: Task) => {
    setSelectedId(task.id);
    setSheetOpen(true);
  }, []);

  const error = !supabaseConfigured
    ? 'Local Supabase is not running. Start it with `npm run db:start`, then restart the dev server.'
    : snapshot.error && !data
      ? snapshot.error.message
      : null;
  const empty = shown && shown.sections.every((s) => s.count === 0);

  return (
    <BoardActionsProvider today={today} writes={writes} onOpen={open}>
      <div ref={appRef} className="flex min-h-dvh">
        <main className={`mx-auto flex min-h-dvh w-full max-w-2xl min-w-0 flex-col px-row-x pb-[max(2rem,env(safe-area-inset-bottom))] ${view === 'board' ? FAB_CLEARANCE : ''}`}>
          {view === 'trash' ? (
            <Toolbar title="Trash" subtitle="Deleted tasks are removed for good after 30 days." onBack={() => setView('board')} />
          ) : (
            <Toolbar
              title={APP_NAME}
              subtitle={longDate(today, today)}
              onSearch={() => setSearching(true)}
              onAdd={() => setAdding(true)}
              addDisabled={!online}
              menu={{ showCompleted, onShowCompletedChange: setShowCompleted, onTrash: () => setView('trash') }}
            />
          )}
          <div className="pt-2">
            {!online && (
              <p className="mb-3 flex items-center gap-row-gap rounded-xl bg-notice px-row-x py-2.5 text-body text-notice-foreground" role="status" data-slot="offline-banner">
                <Icon name="offline" weight="bold" className="size-5 shrink-0 text-flag" />
                <span>
                  <strong className="font-semibold">You're offline.</strong> This is the board as last loaded; changes are paused until you're back online.
                </span>
              </p>
            )}
            {error && <p className="px-row-x text-destructive">{error}</p>}
            {view === 'board' && adding && online && <QuickAdd writes={writes} onClose={() => setAdding(false)} />}
            {empty && (
              <p className="px-row-x py-8 text-center text-muted-foreground" data-slot="empty">
                {view === 'trash' ? 'Trash is empty' : 'No tasks yet.'}
              </p>
            )}
            {shown && data && <BoardView board={shown} today={today} positions={online ? data.positions : undefined} selectedId={twoPane || sheetOpen ? selectedId : null} />}
          </div>
        </main>
        {/* The pane's room is always reserved, so the list stays put when a task is selected. */}
        {twoPane && (
          <div className="flex w-[400px] shrink-0 justify-end">
            <TaskPane task={selected} today={today} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
      {view === 'board' && <AddTaskFab disabled={!online} onAdd={() => setAdding(true)} />}
      {!twoPane && <TaskSheet task={selected} today={today} open={sheetOpen && !!selected} onOpenChange={setSheetOpen} />}
      <SearchDialog open={searching} onOpenChange={setSearching} today={today} onOpen={open} />
      <Toaster position="bottom-center" />
    </BoardActionsProvider>
  );
}
