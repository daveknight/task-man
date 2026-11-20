import { actionsFor, waitingStateFor, type ActionContext, type ActionGroup, type ISODate, type Preset, type RowActions, type Task } from '@app/core';
import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dayLabel, longDate } from '@/lib/day-label';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useBoardActions, type BoardActions } from './board-actions';
import { PresetPanel } from './preset-panel';
import { SwipeableRow } from './swipe-row';

export interface TaskRowProps {
  task: Task;
  today: ISODate;
  context?: ActionContext;
  className?: string;
  style?: CSSProperties;
  selected?: boolean;
}

function DateMeta({ icon, date, today, tone }: { icon: 'dueDate' | 'startDate' | 'waiting'; date: ISODate; today: ISODate; tone?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-footnote whitespace-nowrap', tone ?? 'text-muted-foreground')}>
      <Icon name={icon} className="size-3.5" />
      <span className="optical-center">{dayLabel(date, today)}</span>
    </span>
  );
}

/** Dates and flag at the end of the row. A task waiting until later shows its check-back date with an hourglass. */
function TrailingMeta({ task, today }: { task: Task; today: ISODate }) {
  const waiting = !task.completedAt && !task.deletedAt && task.status === 'waiting' ? waitingStateFor(task, today) : null;
  const upcoming = !waiting && !task.completedAt && !task.deletedAt && !!task.startDate && task.startDate > today;
  const open = !task.completedAt && !task.deletedAt;
  const overdue = open && !!task.dueDate && task.dueDate < today;
  const dueToday = open && task.dueDate === today;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {waiting === 'later' && task.startDate && <DateMeta icon="waiting" date={task.startDate} today={today} />}
      {upcoming && task.startDate && <DateMeta icon="startDate" date={task.startDate} today={today} />}
      {task.dueDate && (
        <DateMeta icon="dueDate" date={task.dueDate} today={today} tone={overdue ? 'text-overdue font-medium' : dueToday ? 'text-link font-medium' : undefined} />
      )}
      {task.flagged && <Icon name="flag" active className="size-4 text-flag" aria-label="Flagged" />}
    </span>
  );
}

/** A group's quick picks in a popover, which closes once one is picked. */
export function PresetPopover({
  task,
  group,
  align,
  trigger,
  children,
  tooltip,
}: {
  task: Task;
  group: ActionGroup;
  align: 'start' | 'end';
  trigger: ReactElement;
  children: ReactNode;
  /** Replaces a native title. Composed onto the same button as the popover trigger. */
  tooltip?: string;
}) {
  const actions = useBoardActions();
  const [open, setOpen] = useState(false);
  const popoverTrigger = tooltip ? (
    <Tooltip>
      <TooltipTrigger render={<PopoverTrigger render={trigger} />}>{children}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    <PopoverTrigger render={trigger}>{children}</PopoverTrigger>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {popoverTrigger}
      <PopoverContent align={align} className="w-80">
        <PresetPanel
          group={group}
          onPreset={(p) => {
            setOpen(false);
            actions?.preset(task, p);
          }}
          onPickDate={(p, date) => {
            setOpen(false);
            actions?.preset(task, p, date);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A group's button: a popover of quick picks, or the action itself when it has none. */
function GroupButton({
  task,
  group,
  tone,
  actions,
  tooltip,
}: {
  task: Task;
  group: ActionGroup;
  tone: string;
  actions: BoardActions | null;
  /** Styled tooltip. Without one, the button keeps a native title. */
  tooltip?: string;
}) {
  const button = (
    <Button variant="ghost" size="icon-sm" aria-label={group.title} title={tooltip ? undefined : group.title} className={tone} />
  );
  if (group.presets.length === 0) {
    const onClick = () => actions?.group(task, group);
    if (!tooltip) {
      return (
        <Button variant="ghost" size="icon-sm" aria-label={group.title} title={group.title} className={tone} onClick={onClick}>
          <Icon name={group.icon} />
        </Button>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={group.title} className={tone} onClick={onClick} />}>
          <Icon name={group.icon} />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <PresetPopover task={task} group={group} align="end" tooltip={tooltip} trigger={button}>
      <Icon name={group.icon} />
    </PresetPopover>
  );
}

/** What the always-visible Waiting buttons do. A check-back date is "Hide until", not a second name for waiting. */
function followUpTooltip(group: ActionGroup): string {
  if (group.id === 'extendWait') return 'Hide until a later date';
  return group.title;
}

/**
 * Blue once the row is hovered or focused. The resting color is inherited foreground from the
 * wrapper: a `text-foreground` utility on the button itself loses to Tailwind's `:where()`
 * group-hover variant. `hover:` and `aria-expanded:` override the ghost button.
 */
const followUpTone = 'group-hover/row:text-link group-focus-within/row:text-link hover:text-link aria-expanded:text-link';

/** Extend wait and Move to In Progress as icon buttons. Rows on phones leave them to the swipe actions and the sheet. */
function FollowUpButtons({ task, actions, rowActions }: { task: Task; actions: BoardActions | null; rowActions: RowActions }) {
  return (
    <span data-slot="follow-up-buttons" className="flex shrink-0 items-center gap-0.5 text-foreground max-sm:hidden pointer-coarse:hidden">
      {rowActions.state.map((g) => (
        <GroupButton key={g.id} task={task} group={g} tone={followUpTone} actions={actions} tooltip={followUpTooltip(g)} />
      ))}
    </span>
  );
}

/** Desktop hover buttons: the same date and state groups as the swipe buttons. */
function HoverActions({ task, actions, rowActions }: { task: Task; actions: BoardActions | null; rowActions: RowActions }) {
  return (
    <span
      data-slot="row-hover-actions"
      className="absolute inset-y-0 right-row-x hidden items-center gap-0.5 bg-card pl-2 group-hover/row:flex group-focus-within/row:flex has-data-popup-open:flex pointer-coarse:hidden!"
    >
      {rowActions.date && <GroupButton task={task} group={rowActions.date} tone="text-flag" actions={actions} />}
      {rowActions.state.map((g) => (
        <GroupButton key={g.id} task={task} group={g} tone="text-link" actions={actions} />
      ))}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={rowActions.delete.title}
        title={rowActions.delete.title}
        className="text-destructive"
        onClick={() => (rowActions.delete.id === 'delete' ? actions?.remove(task) : actions?.removeForever(task))}
      >
        <Icon name="trash" />
      </Button>
    </span>
  );
}

function presetCaption(p: Preset, today: ISODate): string | null {
  return p.effect.kind === 'set' && p.effect.date ? longDate(p.effect.date, today) : null;
}

function MenuGroup({ task, group, actions, today }: { task: Task; group: ActionGroup; actions: BoardActions | null; today: ISODate }) {
  if (group.presets.length === 0) {
    return (
      <ContextMenuItem onClick={() => actions?.group(task, group)}>
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
        {group.presets.map((p) => {
          const caption = presetCaption(p, today);
          return (
            <ContextMenuItem
              key={p.id}
              onClick={() => (p.effect.kind === 'pick' ? actions?.showPresets(task, group, p) : actions?.preset(task, p))}
            >
              <Icon name={p.icon} />
              <span className="optical-center flex-1">{p.label}</span>
              {caption && <span className="optical-center ml-4 text-footnote text-muted-foreground">{caption}</span>}
            </ContextMenuItem>
          );
        })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

export function RowContextMenu({ task, rowActions, today, children }: { task: Task; rowActions: RowActions; today: ISODate; children: ReactNode }) {
  const actions = useBoardActions();
  const active = rowActions.placement !== 'completed' && rowActions.placement !== 'trash';
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {active && (
          <>
            <ContextMenuItem onClick={() => actions?.complete(task)}>
              <Icon name="complete" />
              Complete
            </ContextMenuItem>
            <ContextMenuItem onClick={() => actions?.toggleFlag(task)}>
              <Icon name="flag" active={!!task.flagged} className="text-flag" />
              {task.flagged ? 'Unflag' : 'Flag'}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {rowActions.date && <MenuGroup task={task} group={rowActions.date} actions={actions} today={today} />}
        {rowActions.state.map((g) => (
          <MenuGroup key={g.id} task={task} group={g} actions={actions} today={today} />
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => (rowActions.delete.id === 'delete' ? actions?.remove(task) : actions?.removeForever(task))}
        >
          <Icon name="trash" />
          {rowActions.delete.title}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** One task in a section: the checkbox and title, with icons for flag and dates. */
export function TaskRowContent({
  task,
  today,
  className,
  style,
  selected,
  rowActions,
  hover,
}: TaskRowProps & { rowActions: RowActions; hover?: boolean }) {
  const actions = useBoardActions();
  const followUp = rowActions.placement === 'waiting';
  const done = !!task.completedAt;
  return (
    <div
      data-slot="task-row"
      data-task-id={task.id}
      data-selected={selected || undefined}
      className={cn(
        'group/row relative flex min-h-row items-center gap-row-gap bg-card px-row-x outline-none data-selected:bg-accent',
        className,
      )}
      style={style}
    >
      <Checkbox
        aria-label={`Complete ${task.title}`}
        checked={done}
        disabled={!!task.deletedAt}
        onCheckedChange={(checked) => (checked ? actions?.complete(task) : actions?.markNotDone(task))}
      />
      <button
        type="button"
        onClick={() => actions?.open(task)}
        className="flex min-h-row min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span data-slot="task-title" className={cn('min-w-0 flex-1 truncate text-body optical-center', done && 'text-muted-foreground line-through')}>{task.title}</span>
        <TrailingMeta task={task} today={today} />
      </button>
      {followUp && <FollowUpButtons task={task} actions={actions} rowActions={rowActions} />}
      {hover && !followUp && <HoverActions task={task} actions={actions} rowActions={rowActions} />}
    </div>
  );
}

/** A row: swipe actions on touch screens; right-click menu and hover buttons with a mouse. */
export function TaskRow(props: TaskRowProps) {
  const rowActions = actionsFor(props.task, props.today, props.context);
  const touch = useMediaQuery('(pointer: coarse)');
  if (touch) return <SwipeableRow {...props} rowActions={rowActions} />;
  return (
    <RowContextMenu task={props.task} rowActions={rowActions} today={props.today}>
      <TaskRowContent {...props} rowActions={rowActions} hover />
    </RowContextMenu>
  );
}
