import { actionsFor, listEnter, listIndent, type ISODate, type Status, type Task } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
import { paneDate } from '@/lib/day-label';
import { useOnline } from '@/lib/online';
import { useLiveTitle } from '@/lib/transient';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { FOLD_MOTION, RowList } from './board-view';
import { TaskHistory } from './task-history';
import { DatePicker } from './preset-panel';
import { RepeatField } from './repeat-picker';
import { FilesCard } from './files-card';
import { SubtasksCard } from './subtasks-card';
import { TagsField } from './tag-picker';
import { PresetPopover } from './task-row';
import { WIDE_QUERY } from './surface';
import { sheetFillsScreen } from './task-sheet-frame';

/** The sheet's content height, ignoring a stretched scrolling box. */
function editorContentHeight(editor: HTMLElement): number {
  const style = getComputedStyle(editor);
  const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 0;
  const kids = [...editor.children] as HTMLElement[];
  const gaps = Math.max(0, kids.length - 1) * gap;
  return kids.reduce((sum, kid) => sum + kid.offsetHeight, 0) + gaps + pad;
}

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
  clearLabel,
  disabled,
  clearable = true,
  onChange,
}: {
  icon: IconMeaning;
  label: string;
  clearLabel: string;
  date?: ISODate | null;
  today: ISODate;
  tone?: string;
  min?: ISODate;
  max?: ISODate;
  /** Offline: the field shows its date but can't open. */
  disabled?: boolean;
  /** A repeat needs its due date, so that field hides "No due date" while one is set. */
  clearable?: boolean;
  onChange?: (date: ISODate | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={disabled} className="w-full text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-60" data-field={label}>
        <FieldRow icon={icon} label={label} tone={date ? tone : undefined}>
          {date ? paneDate(date, today) : 'None'}
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
        {clearable && date && (
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
            <DropdownMenuRadioItem key={s} value={s}>{STATUS[s].label}</DropdownMenuRadioItem>
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
export function TaskEditor({ task, today, onClose, sheet = false }: { task: Task; today: ISODate; onClose?: () => void; sheet?: boolean }) {
  const actions = useBoardActions();
  const online = useOnline();
  const rowActions = actionsFor(task, today, { recurring: task.repeat != null });
  const waiting = rowActions.placement === 'waiting' || rowActions.placement === 'waiting_later';
  const inTrash = !!task.deletedAt;
  const done = !!task.completedAt;
  const open = !done && !inTrash;
  const overdue = open && !!task.dueDate && task.dueDate < today;
  const { set: setTitle, ...title } = useDraft(task.title, (value) => (value.trim() ? actions?.edit(task, { title: value.trim() }) : setTitle(task.title)));
  const typedInList = useLiveTitle(task.id);
  const { set: setDescription, ...description } = useDraft(task.description ?? '', (value) => actions?.edit(task, { description: value }));

  const [showHistory, setShowHistory] = useState(false);
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

  if (showHistory) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-slot="task-editor" data-task-id={task.id}>
        <TaskHistory task={task} today={today} onBack={() => setShowHistory(false)} {...(onClose ? { onClose } : {})} />
      </div>
    );
  }

  return (
    // Sections keep their height. A card with overflow hidden would otherwise shrink to nothing
    // once the sheet is taller than the drawer, and the editor scrolls instead.
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 *:shrink-0" data-slot="task-editor" data-task-id={task.id}>
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label="Complete"
          checked={done}
          disabled={inTrash || !online}
          onCheckedChange={(checked) => (checked ? actions?.complete(task) : actions?.markNotDone(task))}
        />
        <StatusMenu status={task.status} disabled={!open || !online} onChange={(s) => actions?.setStatus(task, s)} />
        <span className="flex-1" />
        <Toggle
          aria-label="Flag"
          pressed={!!task.flagged}
          disabled={!online}
          onPressedChange={() => actions?.toggleFlag(task)}
          className="text-muted-foreground data-pressed:bg-transparent data-pressed:text-flag"
        >
          <Icon name="flag" active={!!task.flagged} className="size-5" />
        </Toggle>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More" disabled={!online} />}>
            <Icon name="more" weight="bold" className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setShowHistory(true)}>
              <Icon name="history" />
              History
            </DropdownMenuItem>
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
        value={typedInList ?? title.value}
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

      {(open && task.repeat) || (waiting && open) ? (
        <div className="flex flex-wrap gap-2" data-slot={waiting && open ? 'waiting-actions' : 'sheet-actions'}>
          {open && task.repeat && (
            <Button variant="outline" size="sm" disabled={!online} onClick={() => actions?.skip(task)}>
              <Icon name="skip" data-icon="inline-start" />
              Skip this occurrence
            </Button>
          )}
          {waiting && open &&
            rowActions.state.map((g) =>
              g.presets.length ? (
                <PresetPopover key={g.id} task={task} group={g} align="start" trigger={<Button variant="outline" size="sm" disabled={!online} />}>
                  <Icon name={g.icon} data-icon="inline-start" />
                  {g.title}
                </PresetPopover>
              ) : (
                <Button key={g.id} variant="outline" size="sm" disabled={!online} onClick={() => actions?.group(task, g)}>
                  <Icon name={g.icon} data-icon="inline-start" />
                  {g.title}
                </Button>
              ),
            )}
        </div>
      ) : null}

      <RowList fields className="ring-1 ring-border/60">
        {task.status === 'waiting' && (
          <DateField icon="waiting" label="Hide until" clearLabel="Don't hide" disabled={!online} date={task.hideUntil} today={today} min={today} onChange={(d) => actions?.setField(task, 'hideUntil', d)} />
        )}
        {task.status === 'open' && (
          <DateField
            icon="startDate"
            label="Start"
            clearLabel="No start date"
            disabled={!online}
            date={task.startDate}
            today={today}
            {...(task.dueDate ? { max: task.dueDate } : {})}
            onChange={(d) => actions?.setField(task, 'start', d)}
          />
        )}
        <DateField icon="dueDate" label="Due" clearLabel="No due date" disabled={!online} clearable={!task.repeat} date={task.dueDate} today={today} tone={overdue ? 'text-overdue' : undefined} onChange={(d) => actions?.setField(task, 'due', d)} />
        <RepeatField task={task} today={today} />
        <TagsField task={task} />
      </RowList>

      <SubtasksCard task={task} />

      <FilesCard task={task} />

      <Textarea
        {...description}
        ref={descriptionRef}
        onKeyDown={onDescriptionKey}
        placeholder="Description"
        aria-label="Description"
        readOnly={!online}
        className={cn(
          'resize-none rounded-xl border-0 bg-card text-body shadow-none ring-1 ring-border/60 md:text-body dark:bg-card',
          // The pane fills leftover room. A phone sheet sizes to the note, so a short task can stay under 75% of the screen.
          sheet ? 'field-sizing-content min-h-16' : 'min-h-40 flex-1',
        )}
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
 * mid-width windows, and a bottom sheet on phones. A phone sheet whose content is taller
 * than 75% of the screen fills it instead.
 */
export function TaskSheet({ task, today, open, onOpenChange }: { task: Task | null; today: ISODate; open: boolean; onOpenChange: (open: boolean) => void }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [fill, setFill] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);

  // The drawer mounts its popup after open, so a layout effect on this component can miss it.
  const watchPopup = useCallback((popup: HTMLDivElement | null) => {
    stopWatch.current?.();
    stopWatch.current = null;
    if (!popup || wide || !open) return;
    let editor: Element | null = null;
    const measure = () => {
      const nextEditor = popup.querySelector('[data-slot=task-editor]') as HTMLElement | null;
      if (nextEditor && nextEditor !== editor) {
        if (editor) resize.unobserve(editor);
        editor = nextEditor;
        resize.observe(editor);
      }
      const handle = popup.querySelector('[data-slot=drawer-swipe-handle]') as HTMLElement | null;
      // The editor stretches once the sheet fills the screen, so its own box is not the content height.
      const natural = (nextEditor ? editorContentHeight(nextEditor) : 0) + (handle?.offsetHeight ?? 0);
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const next = sheetFillsScreen(natural, viewport);
      setFill((prev) => (prev === next ? prev : next));
    };
    const resize = new ResizeObserver(measure);
    const mutations = new MutationObserver(measure);
    mutations.observe(popup, { childList: true, subtree: true });
    measure();
    const onViewport = () => measure();
    window.visualViewport?.addEventListener('resize', onViewport);
    stopWatch.current = () => {
      resize.disconnect();
      mutations.disconnect();
      window.visualViewport?.removeEventListener('resize', onViewport);
    };
  }, [wide, open, task?.id]);

  useEffect(() => () => stopWatch.current?.(), []);

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
      <DrawerContent
        ref={watchPopup}
        data-fill={fill ? 'full' : 'sheet'}
        className="bg-background data-[fill=full]:h-dvh data-[fill=full]:max-h-dvh data-[fill=full]:rounded-none data-[fill=full]:border-t-0 data-[fill=full]:pt-[env(safe-area-inset-top)]"
      >
        <DrawerTitle className="sr-only">{task.title}</DrawerTitle>
        <TaskEditor key={task.id} task={task} today={today} sheet onClose={fill ? () => onOpenChange(false) : undefined} />
      </DrawerContent>
    </Drawer>
  );
}
