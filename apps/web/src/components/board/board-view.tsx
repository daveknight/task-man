import type { Board, BoardSection, ISODate, Section, Task } from '@app/core';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ActionContext } from './row-actions';
import { TaskRow } from './task-row';

export const SECTION_TITLES: Record<Section, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  ready: 'Ready',
  upcoming: 'Upcoming',
  completed: 'Completed',
  trash: 'Trash',
};

/** An inset grouped card whose rows get iOS-style separators inset past the checkbox. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl bg-card',
        '*:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-separator-inset [&>*+*]:before:z-10 [&>*+*]:before:h-px [&>*+*]:before:bg-border',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return <Icon name="expand" weight="bold" className={cn('size-3 transition-transform', open && 'rotate-90')} />;
}

export interface BoardViewProps {
  board: Board;
  today: ISODate;
  /** Sections and the Waiting "later" group start expanded or collapsed as the user last left them. */
  expanded?: Partial<Record<Section | 'waiting_later', boolean>>;
  actionContext?: (task: Task) => ActionContext;
  onOpenTask?: (task: Task) => void;
  /** The task open in the detail pane, highlighted in the list. */
  selectedId?: string;
}

function SectionView({ section, today, expanded, actionContext, onOpenTask, selectedId }: Omit<BoardViewProps, 'board'> & { section: BoardSection }) {
  const [open, setOpen] = useState(expanded?.[section.id] ?? !section.collapsedByDefault);
  const [laterOpen, setLaterOpen] = useState(expanded?.waiting_later ?? false);
  const later = section.later ?? [];
  const row = (task: Task) => <TaskRow key={task.id} task={task} today={today} context={actionContext?.(task)} onOpen={onOpenTask} selected={task.id === selectedId} />;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-section={section.id} className="flex flex-col">
      <CollapsibleTrigger className="flex h-section-header items-center gap-1.5 self-start rounded-md px-row-x text-subhead font-semibold text-section-header outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Caret open={open} />
        <span className="optical-center">{SECTION_TITLES[section.id]}</span>
        <span className="optical-center font-normal text-muted-foreground">{section.count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RowList>
          {section.tasks.map(row)}
          {later.length > 0 && (
            <Collapsible open={laterOpen} onOpenChange={setLaterOpen} data-later>
              <CollapsibleTrigger className="flex min-h-row w-full items-center gap-row-gap px-row-x text-left text-body text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50">
                <span className="flex size-checkbox items-center justify-center">
                  <Icon name="waiting" className="size-icon" />
                </span>
                <span className="optical-center flex-1">
                  {laterOpen ? 'Hide' : 'Show'} {later.length} waiting until later
                </span>
                <Caret open={laterOpen} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="*:relative [&>*]:before:absolute [&>*]:before:top-0 [&>*]:before:right-0 [&>*]:before:left-separator-inset [&>*]:before:z-10 [&>*]:before:h-px [&>*]:before:bg-border">
                  {later.map(row)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </RowList>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The board: sections top to bottom, empty ones left out. */
export function BoardView({ board, ...props }: BoardViewProps) {
  return (
    <div className="flex flex-col gap-section-gap" data-slot="board">
      {board.sections
        .filter((s) => s.count > 0)
        .map((section) => (
          <SectionView key={section.id} section={section} {...props} />
        ))}
    </div>
  );
}
