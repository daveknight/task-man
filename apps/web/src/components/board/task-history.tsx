import { taskHistory, type ISODate, type Task, type TaskHistoryEntry } from '@app/core';
import { CaretLeftIcon } from '@phosphor-icons/react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { longDate } from '@/lib/day-label';
import { useOnline } from '@/lib/online';
import { useSnapshot } from '@/data/board-data';
import { useBoardActions } from './board-actions';
import { RowList } from './board-view';

/**
 * One task's completions and skips. Opened from the sheet's More menu, so the task
 * itself stays the fields, dates and description. Newest first, the reverse of the stored order.
 */
export function TaskHistory({ task, today, onBack, onClose }: { task: Task; today: ISODate; onBack: () => void; onClose?: () => void }) {
  const snapshot = useSnapshot().data;
  const actions = useBoardActions();
  const online = useOnline();
  const entries = [
    ...taskHistory(task, snapshot?.completions ?? [], snapshot?.positions.get(task.id) ?? null),
  ].reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-slot="task-history" data-task-id={task.id}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" className="flex items-center gap-0.5 justify-self-start text-body text-primary" onClick={onBack}>
          <CaretLeftIcon className="size-4" />
          <span className="optical-center">Task</span>
        </button>
        <h2 className="text-center text-body font-semibold">History</h2>
        {onClose ? (
          <Button variant="ghost" size="icon" aria-label="Close" className="justify-self-end" onClick={onClose}>
            <Icon name="close" className="size-5" />
          </Button>
        ) : (
          <span />
        )}
      </div>

      <p className="text-title font-semibold">{task.title}</p>

      {entries.length === 0 ? (
        <p data-slot="history-empty" className="text-body text-muted-foreground">
          No history.
        </p>
      ) : (
        <div role="list" aria-label="History">
          <RowList fields className="ring-1 ring-border/60">
            {entries.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} today={today} undoDisabled={!online} onUndo={() => actions?.undoLatest(task)} />
            ))}
          </RowList>
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  today,
  undoDisabled,
  onUndo,
}: {
  entry: TaskHistoryEntry;
  today: ISODate;
  undoDisabled: boolean;
  onUndo: () => void;
}) {
  return (
    <div role="listitem" data-slot="history-row" data-kind={entry.kind} data-occurrence={entry.occurrenceDue} className="flex min-h-8 items-center gap-2 px-3">
      <Icon name={entry.kind === 'skip' ? 'skip' : 'complete'} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="optical-center flex-1 text-body">{entry.label}</span>
      <span className="optical-center text-footnote whitespace-nowrap text-muted-foreground">{longDate(entry.occurrenceDue, today)}</span>
      {entry.undoable && (
        <Button variant="ghost" size="sm" disabled={undoDisabled} onClick={onUndo}>
          Undo
        </Button>
      )}
    </div>
  );
}
