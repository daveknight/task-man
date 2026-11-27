import { historyCards, historyWhen, taskHistory, type ISODate, type Task } from '@app/core';
import { CaretLeftIcon } from '@phosphor-icons/react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { useAccountName } from '@/auth/auth-gate';
import { longDate } from '@/lib/day-label';
import { useOnline } from '@/lib/online';
import { useSnapshot } from '@/data/board-data';
import { useBoardActions } from './board-actions';

/**
 * One task's activity timeline. Opened from the sheet's More menu, so the task
 * itself stays the fields, dates and description. Newest first, the reverse of the stored order.
 * Occurrence cards keep Undo on the latest row only. A field edit has no undo.
 */
export function TaskHistory({ task, today, onBack, onClose }: { task: Task; today: ISODate; onBack: () => void; onClose?: () => void }) {
  const snapshot = useSnapshot().data;
  const actions = useBoardActions();
  const online = useOnline();
  const account = useAccountName();
  const actor = account.trim() || 'You';
  const cards = historyCards(
    taskHistory(task, snapshot?.completions ?? [], snapshot?.positions.get(task.id) ?? null, snapshot?.activities ?? []),
  )
    .slice()
    .reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-slot="task-history" data-task-id={task.id}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" className="flex items-center gap-0.5 justify-self-start text-body text-primary" onClick={onBack}>
          <CaretLeftIcon className="size-4" />
          <span className="optical-center">Task</span>
        </button>
        <h2 className="text-center text-body font-semibold">Task Activities</h2>
        {onClose ? (
          <Button variant="ghost" size="icon" aria-label="Close" className="justify-self-end" onClick={onClose}>
            <Icon name="close" className="size-5" />
          </Button>
        ) : (
          <span />
        )}
      </div>

      {cards.length === 0 ? (
        <p data-slot="history-empty" className="text-body text-muted-foreground">
          No history.
        </p>
      ) : (
        <div role="list" aria-label="Task activities" className="relative flex flex-col gap-3">
          {cards.length > 1 && <div aria-hidden className="absolute top-3 bottom-3 left-[4px] w-px bg-border" />}
          {cards.map((card) => (
            <div
              role="listitem"
              key={card.id}
              data-slot="history-card"
              {...(card.field ? { 'data-field': card.field } : {})}
              {...(card.occurrence ? { 'data-kind': card.occurrence.kind, 'data-occurrence': card.occurrence.occurrenceDue } : {})}
              className="relative pl-6"
            >
              <span aria-hidden className="absolute top-3.5 left-0 size-2.5 rounded-full bg-muted-foreground ring-2 ring-background" />
              <div data-slot="history-card-body" className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-border/60">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="optical-center min-w-0 text-body">
                    {actor} {card.verb}
                  </p>
                  <time dateTime={card.at} className="optical-center shrink-0 text-footnote whitespace-nowrap text-muted-foreground">
                    {historyWhen(card.at)}
                  </time>
                </div>
                {card.occurrence ? (
                  <p className="mt-1 text-footnote text-muted-foreground">{longDate(card.occurrence.occurrenceDue, today)}</p>
                ) : (
                  card.lines.map((line) => (
                    <p key={line.detail} className="mt-1 text-footnote break-words text-muted-foreground">
                      {line.detail}
                    </p>
                  ))
                )}
                {card.undoable && (
                  <div className="mt-1 flex justify-end">
                    <Button variant="ghost" size="sm" disabled={!online} onClick={() => actions?.undoLatest(task)}>
                      Undo
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
