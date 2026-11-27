import { addDays, startOfWeek, type CompletedLog, type CompletedLogEntry, type CompletedLogWeek, type ISODate, type Task } from '@app/core';
import { useId, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { dayLabel, paneDate, shortDate } from '@/lib/day-label';
import { usePersistedBoolean } from '@/lib/persisted';
import { cn } from '@/lib/utils';
import { FOLD_MOTION, RowList } from './board-view';

/** This week and last week by name; any older week is its Monday–Sunday range. */
function weekLabel(week: Pick<CompletedLogWeek, 'start' | 'end'>, today: ISODate): string {
  const current = startOfWeek(today);
  if (week.start === current) return 'This week';
  if (week.start === addDays(current, -7)) return 'Last week';
  return `${shortDate(week.start, today)} – ${shortDate(week.end, today)}`;
}

function Caret({ open }: { open: boolean }) {
  return <Icon name="expand" weight="bold" className={cn('size-3 transition-transform', FOLD_MOTION, open && 'rotate-90')} />;
}

function Fold({ children }: { children: ReactNode }) {
  return (
    <CollapsibleContent className={cn('h-(--collapsible-panel-height) overflow-hidden transition-[height] data-starting-style:h-0 data-ending-style:h-0', FOLD_MOTION)}>
      <div className={cn('transition-transform [[data-ending-style]>&]:-translate-y-full [[data-starting-style]>&]:-translate-y-full', FOLD_MOTION)}>{children}</div>
    </CollapsibleContent>
  );
}

function LogCheck() {
  return (
    <span aria-hidden data-slot="log-check" className="flex size-checkbox shrink-0 items-center justify-center rounded-full border-[1.5px] border-primary bg-primary text-primary-foreground">
      <Icon name="complete" weight="bold" className="size-[calc(var(--size-checkbox)*0.65)]" />
    </span>
  );
}

function LogRow({ entry, task, today }: { entry: CompletedLogEntry; task: Task | undefined; today: ISODate }) {
  const due = entry.source === 'occurrence' ? entry.occurrenceDue : (task?.dueDate ?? null);
  return (
    <div role="listitem" data-slot="log-row" data-source={entry.source} data-task-id={entry.taskId} data-occurrence-due={entry.occurrenceDue ?? undefined} className="flex min-h-row items-center gap-row-gap bg-card pr-row-x">
      <span data-slot="drag-handle-area" className="flex w-handle shrink-0 self-stretch" />
      <LogCheck />
      <span className="sr-only">
        Completed {entry.title}
        {due ? `, due ${dayLabel(due, today)}` : ''}
        {task?.flagged ? ', flagged' : ''}
      </span>
      <span data-slot="task-title" aria-hidden className="optical-center min-w-0 flex-1 truncate text-body text-muted-foreground line-through">
        {entry.title}
      </span>
    </div>
  );
}

function DayGroup({ date, entries, today, tasks }: { date: ISODate; entries: CompletedLogEntry[]; today: ISODate; tasks: ReadonlyMap<string, Task> }) {
  const labelId = useId();
  return (
    <div data-log-day={date}>
      <p id={labelId} className="flex items-center gap-row-gap pb-1 pl-task-lead text-footnote font-semibold text-section-header">
        <span className="size-checkbox shrink-0" aria-hidden />
        <span className="optical-center">{paneDate(date, today)}</span>
      </p>
      <RowList role="list" aria-labelledby={labelId} className="max-sm:rounded-none">
        {entries.map((entry) => (
          <LogRow key={entry.id} entry={entry} task={tasks.get(entry.taskId)} today={today} />
        ))}
      </RowList>
    </div>
  );
}

function WeekGroup({ week, today, tasks }: { week: CompletedLogWeek; today: ISODate; tasks: ReadonlyMap<string, Task> }) {
  const [storedOpen, setOpen] = usePersistedBoolean(`log:open:${week.start}`, !week.collapsedByDefault);
  const label = weekLabel(week, today);
  return (
    <Collapsible open={storedOpen} onOpenChange={setOpen} data-log-week={week.start} className="flex flex-col">
      <CollapsibleTrigger
        className={cn(
          'flex min-h-row w-full items-center gap-row-gap rounded-xl pr-row-x pl-task-lead text-left text-subhead font-semibold text-section-header outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:rounded-none',
          FOLD_MOTION,
          !storedOpen && 'bg-card hover:bg-card-hover',
        )}
      >
        <span className="flex size-checkbox shrink-0 items-center justify-center">
          <Caret open={storedOpen} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="optical-center">{label}</span>
          <span className="optical-center font-normal text-muted-foreground" data-slot="log-count">
            {week.count}
          </span>
        </span>
      </CollapsibleTrigger>
      <Fold>
        <div className="flex flex-col gap-3 pt-1">
          {week.days.map((day) => (
            <DayGroup key={day.date} date={day.date} entries={day.entries} today={today} tasks={tasks} />
          ))}
        </div>
      </Fold>
    </Collapsible>
  );
}

/** The completed log. Rows are a record of what was finished: the title only, with no checkbox, drag, menu, or date. */
export function CompletedLogView({ log, today, tasks }: { log: CompletedLog; today: ISODate; tasks: readonly Task[] }) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return (
    <div className="flex flex-col gap-section-gap max-sm:-mx-row-x max-sm:overflow-x-clip" data-slot="completed-log">
      {log.weeks.map((week) => (
        <WeekGroup key={week.start} week={week} today={today} tasks={byId} />
      ))}
    </div>
  );
}
