import { waitingStateFor, type ISODate, type Task } from '@app/core';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dayLabel, shortDate } from '@/lib/day-label';
import { cn } from '@/lib/utils';
import { PresetPanel } from './preset-panel';
import { rowActionsFor, type ActionContext, type ActionGroup, type RowActions } from './row-actions';

export interface TaskRowProps {
  task: Task;
  today: ISODate;
  context?: ActionContext;
  onOpen?: (task: Task) => void;
  className?: string;
}

function DateMeta({ icon, date, today, tone }: { icon: 'dueDate' | 'startDate'; date: ISODate; today: ISODate; tone?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-footnote whitespace-nowrap', tone ?? 'text-muted-foreground')}>
      <Icon name={icon} className="size-3.5" />
      {dayLabel(date, today)}
    </span>
  );
}

/** Description, flag and dates at the end of the title line. */
function TrailingMeta({ task, today, upcoming }: { task: Task; today: ISODate; upcoming: boolean }) {
  const overdue = !!task.dueDate && task.dueDate < today;
  const dueToday = task.dueDate === today;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {task.description && <Icon name="description" className="size-3.5 text-muted-foreground" aria-label="Has description" />}
      {upcoming && task.startDate && <DateMeta icon="startDate" date={task.startDate} today={today} />}
      {task.dueDate && (
        <DateMeta icon="dueDate" date={task.dueDate} today={today} tone={overdue ? 'text-overdue font-medium' : dueToday ? 'text-link font-medium' : undefined} />
      )}
      {task.flagged && <Icon name="flag" active className="size-4 text-flag" aria-label="Flagged" />}
    </span>
  );
}

function FollowUpButtons() {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button variant="outline" size="xs">
        <Icon name="waiting" data-icon="inline-start" />
        Wait again
      </Button>
      <Button variant="outline" size="xs">
        <Icon name="inProgress" data-icon="inline-start" />
        Resume
      </Button>
      <Button variant="outline" size="xs">
        <Icon name="complete" data-icon="inline-start" />
        Done
      </Button>
    </span>
  );
}

function GroupPopoverButton({ group, tone }: { group: ActionGroup; tone: string }) {
  if (group.presets.length === 0) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={group.title} title={group.title} className={tone}>
        <Icon name={group.icon} />
      </Button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={group.title} title={group.title} className={tone} />}>
        <Icon name={group.icon} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PresetPanel group={group} />
      </PopoverContent>
    </Popover>
  );
}

/** Desktop hover buttons: the same date and state groups as the swipe buttons. */
function HoverActions({ actions }: { actions: RowActions }) {
  return (
    <span
      data-slot="row-hover-actions"
      className="absolute inset-y-0 right-row-x hidden items-center gap-0.5 bg-card pl-2 group-hover/row:flex group-focus-within/row:flex pointer-coarse:hidden!"
    >
      {actions.date && <GroupPopoverButton group={actions.date} tone="text-follow-up" />}
      {actions.state.map((g) => (
        <GroupPopoverButton key={g.title} group={g} tone="text-link" />
      ))}
      <Button variant="ghost" size="icon-sm" aria-label={actions.delete} title={actions.delete} className="text-destructive">
        <Icon name="trash" />
      </Button>
    </span>
  );
}

function MenuGroup({ group }: { group: ActionGroup }) {
  if (group.presets.length === 0) {
    return (
      <ContextMenuItem>
        <Icon name={group.icon} />
        {group.title}
      </ContextMenuItem>
    );
  }
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Icon name={group.icon} />
        {group.title}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {group.presets.map((p) => (
          <ContextMenuItem key={p.label}>
            <Icon name={p.icon} />
            <span className="flex-1">{p.label}</span>
            {p.caption && <span className="ml-4 text-footnote text-muted-foreground">{p.caption}</span>}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

export function RowContextMenu({ task, actions, children }: { task: Task; actions: RowActions; children: ReactNode }) {
  const done = actions.placement === 'completed' || actions.placement === 'trash';
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {!done && (
          <>
            <ContextMenuItem>
              <Icon name="complete" />
              Complete
            </ContextMenuItem>
            <ContextMenuItem>
              <Icon name="flag" active={!!task.flagged} className="text-flag" />
              {task.flagged ? 'Unflag' : 'Flag'}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {actions.date && <MenuGroup group={actions.date} />}
        {actions.state.map((g) => (
          <MenuGroup key={g.title} group={g} />
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <Icon name="trash" />
          {actions.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** One task in a section: title only, with icons for description, flag and dates. */
export function TaskRowContent({ task, today, onOpen, className, hoverActions }: TaskRowProps & { hoverActions?: RowActions }) {
  const waiting = !task.completedAt && !task.deletedAt && task.status === 'waiting' ? waitingStateFor(task, today) : null;
  const followUp = waiting === 'needs_follow_up';
  const later = waiting === 'later';
  const followUpDue = followUp && !!task.waitUntil && task.waitUntil <= today;
  const upcoming = !!task.startDate && task.startDate > today;
  const subtitle = [task.waitingOn, later && task.waitUntil ? shortDate(task.waitUntil, today) : null].filter(Boolean).join(' · ');

  return (
    <div
      data-slot="task-row"
      data-task-id={task.id}
      className={cn('group/row relative flex min-h-row items-start gap-row-gap bg-card px-row-x', className)}
    >
      <span className="flex h-row items-center">
        <Checkbox aria-label={`Complete ${task.title}`} checked={!!task.completedAt} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col py-[calc((var(--size-row)-var(--line-height-body))/2)]">
        <button
          type="button"
          onClick={() => onOpen?.(task)}
          className="flex items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className={cn('min-w-0 flex-1 truncate text-body', task.completedAt && 'text-muted-foreground line-through')}>{task.title}</span>
          <TrailingMeta task={task} today={today} upcoming={upcoming} />
        </button>
        {(followUp || later) && (followUpDue || subtitle) && (
          <span className="mt-1 flex items-center gap-1.5 text-footnote text-muted-foreground">
            {followUpDue && (
              <Badge className="bg-follow-up-muted px-1.5 text-follow-up">
                <Icon name="followUp" />
                Follow up
              </Badge>
            )}
            {subtitle && <Icon name={later ? 'waiting' : 'waitingOn'} className="size-3.5 shrink-0" />}
            <span className="truncate">{subtitle}</span>
          </span>
        )}
        {followUp && (
          <span className="mt-2 flex sm:hidden">
            <FollowUpButtons />
          </span>
        )}
      </div>
      {followUp && (
        <span className="flex h-row items-center max-sm:hidden">
          <FollowUpButtons />
        </span>
      )}
      {hoverActions && !followUp && <HoverActions actions={hoverActions} />}
    </div>
  );
}

/** A row with its right-click menu and desktop hover buttons. */
export function TaskRow(props: TaskRowProps) {
  const actions = rowActionsFor(props.task, props.today, props.context);
  return (
    <RowContextMenu task={props.task} actions={actions}>
      <TaskRowContent {...props} hoverActions={actions} />
    </RowContextMenu>
  );
}
