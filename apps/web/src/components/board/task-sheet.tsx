import { actionsFor, listEnter, listIndent, type ISODate, type Status, type Task } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { longDate } from '@/lib/day-label';
import { useOnline } from '@/lib/online';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { FOLD_MOTION, RowList } from './board-view';
import { DatePicker } from './preset-panel';
import { PresetPopover } from './task-row';
import { WIDE_QUERY } from './surface';

const STATUS: Record<Status, { label: string; icon: IconMeaning }> = {
  open: { label: 'Open', icon: 'complete' },
  in_progress: { label: 'In Progress', icon: 'inProgress' },
  waiting: { label: 'Waiting', icon: 'waiting' },
};

function FieldRow({ icon, label, children, tone }: { icon: IconMeaning; label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex min-h-row items-center gap-row-gap px-row-x">
      <Icon name={icon} className="size-icon shrink-0 text-muted-foreground" />
      <span className="optical-center flex-1 text-body">{label}</span>
      <span className={cn('optical-center text-body text-muted-foreground', tone)}>{children}</span>
    </div>
  );
}

function DateField({
  icon,
  label,
  date,
  today,
  tone,
  min,
  max,
  clearLabel = 'Clear',
  onChange,
}: {
  icon: IconMeaning;
  label: string;
  clearLabel?: string;
  date?: ISODate | null;
  today: ISODate;
  tone?: string;
  min?: ISODate;
  max?: ISODate;
  onChange?: (date: ISODate | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="w-full text-left outline-none hover:bg-muted focus-visible:bg-muted" data-field={label}>
        <FieldRow icon={icon} label={label} tone={date ? tone : undefined}>
          {date ? longDate(date, today) : 'None'}
        </FieldRow>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <DatePicker
          effect={{ ...(min ? { min } : {}), ...(max ? { max } : {}) }}
          selected={date ?? today}
          onPick={(d) => {
            setOpen(false);
            onChange?.(d);
          }}
        />
        {date && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              onChange?.(null);
            }}
          >
            <Icon name="clear" data-icon="inline-start" />
            {clearLabel}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function StatusMenu({ status, disabled, onChange }: { status: Status; disabled?: boolean; onChange?: (s: Status) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger disabled={disabled} render={<Button variant="secondary" size="sm" data-slot="status-menu" />}>
        <Icon name={STATUS[status].icon} data-icon="inline-start" />
        {STATUS[status].label}
        <Icon name="collapse" data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => {
            setOpen(false);
            onChange?.(value as Status);
          }}
        >
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              <Icon name={STATUS[s].icon} />
              {STATUS[s].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A text field that saves when it loses focus (and the title on Enter). Follows outside changes while not focused. */
function useDraft(value: string, save: (value: string) => void) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      if (draft !== value) save(draft);
    },
    set: setDraft,
  };
}

/** Everything in the sheet: header actions, title, the Waiting actions, dates and the description. */
export function TaskEditor({ task, today, onClose }: { task: Task; today: ISODate; onClose?: () => void }) {
  const actions = useBoardActions();
  const online = useOnline();
  const rowActions = actionsFor(task, today);
  const waiting = rowActions.placement === 'waiting' || rowActions.placement === 'waiting_later';
  const inTrash = !!task.deletedAt;
  const done = !!task.completedAt;
  const open = !done && !inTrash;
  const overdue = open && !!task.dueDate && task.dueDate < today;
  const { set: setTitle, ...title } = useDraft(task.title, (value) => (value.trim() ? actions?.edit(task, { title: value.trim() }) : setTitle(task.title)));
  const { set: setDescription, ...description } = useDraft(task.description ?? '', (value) => actions?.edit(task, { description: value }));

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null) return;
    descriptionRef.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [description.value]);

  const onDescriptionKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const edit = e.key === 'Enter' && !e.shiftKey ? listEnter(el.value, el.selectionStart) : e.key === 'Tab' ? listIndent(el.value, el.selectionStart, e.shiftKey) : null;
    if (!edit) return;
    e.preventDefault();
    if (edit.value === el.value) return;
    caret.current = edit.caret;
    setDescription(edit.value);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-slot="task-editor" data-task-id={task.id}>
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label="Complete"
          checked={done}
          disabled={inTrash}
          onCheckedChange={(checked) => (checked ? actions?.complete(task) : actions?.markNotDone(task))}
        />
        <StatusMenu status={task.status} disabled={!open} onChange={(s) => actions?.setStatus(task, s)} />
        <span className="flex-1" />
        <Toggle
          aria-label="Flag"
          pressed={!!task.flagged}
          onPressedChange={() => actions?.toggleFlag(task)}
          className="text-muted-foreground data-pressed:bg-transparent data-pressed:text-flag"
        >
          <Icon name="flag" active={!!task.flagged} className="size-5" />
        </Toggle>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More" />}>
            <Icon name="more" weight="bold" className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {rowActions.state
              .filter((g) => g.presets.length === 0 && (g.id === 'markNotDone' || g.id === 'restore'))
              .map((g) => (
                <DropdownMenuItem key={g.id} onClick={() => actions?.group(task, g)}>
                  <Icon name={g.icon} />
                  {g.title}
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (inTrash) {
                  onClose?.();
                  actions?.removeForever(task);
                } else actions?.remove(task);
              }}
            >
              <Icon name="trash" />
              {rowActions.delete.title}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" className="size-5" />
          </Button>
        )}
      </div>

      <Textarea
        {...title}
        aria-label="Title"
        readOnly={!online}
        rows={1}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={cn(
          'field-sizing-content min-h-0 resize-none rounded-none border-0 bg-transparent! px-0 py-0 text-title font-semibold shadow-none focus-visible:ring-0 md:text-title',
          done && 'text-muted-foreground line-through',
        )}
      />

      {waiting && open && (
        <div className="flex flex-wrap gap-2" data-slot="waiting-actions">
          {rowActions.state.map((g) =>
            g.presets.length ? (
              <PresetPopover key={g.id} task={task} group={g} align="start" trigger={<Button variant="outline" size="sm" />}>
                <Icon name={g.icon} data-icon="inline-start" />
                {g.title}
              </PresetPopover>
            ) : (
              <Button key={g.id} variant="outline" size="sm" onClick={() => actions?.group(task, g)}>
                <Icon name={g.icon} data-icon="inline-start" />
                {g.title}
              </Button>
            ),
          )}
        </div>
      )}

      <RowList className="ring-1 ring-border/60">
        {task.status === 'waiting' ? (
          <DateField icon="waiting" label="Hide until" date={task.startDate} today={today} min={today} onChange={(d) => actions?.setField(task, 'checkBack', d)} />
        ) : (
          <DateField
            icon="startDate"
            label="Start"
            date={task.startDate}
            today={today}
            {...(task.dueDate ? { max: task.dueDate } : {})}
            onChange={(d) => actions?.setField(task, 'start', d)}
          />
        )}
        <DateField icon="dueDate" label="Due" clearLabel="No due date" date={task.dueDate} today={today} tone={overdue ? 'text-overdue' : undefined} onChange={(d) => actions?.setField(task, 'due', d)} />
      </RowList>

      <Textarea
        {...description}
        ref={descriptionRef}
        onKeyDown={onDescriptionKey}
        placeholder="Description"
        aria-label="Description"
        readOnly={!online}
        className="min-h-40 flex-1 resize-none rounded-xl border-0 bg-card text-body shadow-none ring-1 ring-border/60 md:text-body dark:bg-card"
      />
    </div>
  );
}

/**
 * The detail pane beside the board on wide screens. It slides in from the right when a task is selected
 * and out again when the selection clears, showing the last task meanwhile. Nothing renders when closed.
 */
export function TaskPane({ task, today, onClose }: { task: Task | null; today: ISODate; onClose: () => void }) {
  const [shown, setShown] = useState(task);
  if (task && task !== shown) setShown(task);
  const open = !!task;
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    // Commit the collapsed width first, so a freshly mounted pane has something to transition from.
    if (open) ref.current?.getBoundingClientRect();
    setExpanded(open);
  }, [open, !!shown]);

  useLayoutEffect(() => {
    // Reduced motion has no transition to end, so there's no transitionend to wait for.
    if (expanded || open || !ref.current) return;
    const { transitionProperty, transitionDuration } = getComputedStyle(ref.current);
    if (transitionProperty === 'none' || parseFloat(transitionDuration) === 0) setShown(null);
  }, [expanded, open]);

  if (!shown) return null;
  return (
    <aside
      ref={ref}
      data-slot="task-pane"
      className={cn('sticky top-0 h-dvh shrink-0 overflow-hidden bg-background transition-[width]', FOLD_MOTION, expanded ? 'w-[400px]' : 'w-0')}
      onTransitionEnd={(e) => e.target === e.currentTarget && !open && setShown(null)}
    >
      <div className="flex h-full w-[400px] flex-col border-l border-border" inert={!open}>
        <TaskEditor key={shown.id} task={shown} today={today} onClose={onClose} />
      </div>
    </aside>
  );
}

/**
 * The task sheet when there's no room for the second pane: a side sheet over the board on
 * mid-width windows, and a bottom sheet on phones.
 */
export function TaskSheet({ task, today, open, onOpenChange }: { task: Task | null; today: ISODate; open: boolean; onOpenChange: (open: boolean) => void }) {
  const wide = useMediaQuery(WIDE_QUERY);
  if (!task) return null;
  if (wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-background sm:max-w-md">
          <SheetTitle className="sr-only">{task.title}</SheetTitle>
          <TaskEditor key={task.id} task={task} today={today} onClose={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="bg-background">
        <DrawerTitle className="sr-only">{task.title}</DrawerTitle>
        <TaskEditor key={task.id} task={task} today={today} />
      </DrawerContent>
    </Drawer>
  );
}
