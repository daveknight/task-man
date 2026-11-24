import {
  actionsFor,
  planDrop,
  REORDERABLE,
  sectionFor,
  type ActionContext,
  type Board,
  type BoardSection,
  type ISODate,
  type Section,
  type Status,
  type Task,
} from '@app/core';
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePersistedBoolean } from '@/lib/persisted';
import { useLeaving, useLeavingIds, useMoves, type Move } from '@/lib/transient';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { TaskRow, TaskRowContent } from './task-row';

export const SECTION_TITLES: Record<Section, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  ready: 'Ready',
  upcoming: 'Upcoming',
  completed: 'Completed',
  trash: 'Trash',
};

const SECTION_STATUS: Partial<Record<Section, Status>> = { in_progress: 'in_progress', waiting: 'waiting', ready: 'open' };

/** An inset grouped card whose rows get iOS-style separators inset past the checkbox. */
export function RowList({
  children,
  className,
  fields,
  flush,
}: {
  children: ReactNode;
  className?: string;
  /** Field rows (icon and label) instead of task rows, whose separators start further in. */
  fields?: boolean;
  /** Separators run the full width of the list, for plain fields with no icon. */
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl bg-card',
        '*:relative [&>*+*]:before:absolute [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:z-10 [&>*+*]:before:h-px [&>*+*]:before:bg-border',
        flush ? '[&>*+*]:before:left-0' : fields ? '[&>*+*]:before:left-separator-inset' : '[&>*+*]:before:left-task-separator-inset',
        fields && '[&>:first-child]:rounded-t-[inherit] [&>:last-child]:rounded-b-[inherit]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export const FOLD_MOTION = 'duration-200 ease-out motion-reduce:transition-none';

function Caret({ open }: { open: boolean }) {
  return <Icon name="expand" weight="bold" className={cn('size-3 transition-transform', FOLD_MOTION, open && 'rotate-90')} />;
}

/**
 * Collapsible content that folds up into the header above it. The panel's height and the content's
 * offset share one duration and easing, so the content's bottom edge tracks the panel's while the top
 * slides up under the header.
 */
function Fold({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <CollapsibleContent
      className={cn('h-(--collapsible-panel-height) overflow-hidden transition-[height] data-starting-style:h-0 data-ending-style:h-0', FOLD_MOTION, className)}
    >
      <div className={cn('transition-transform [[data-ending-style]>&]:-translate-y-full [[data-starting-style]>&]:-translate-y-full', FOLD_MOTION)}>{children}</div>
    </CollapsibleContent>
  );
}

export interface BoardViewProps {
  board: Board;
  today: ISODate;
  /** Board positions by task id, for drag-and-drop. Without them the board is static (design screens). */
  positions?: ReadonlyMap<string, string>;
  /** Overrides the remembered expanded state (design screens). */
  expanded?: Partial<Record<Section | 'waiting_later', boolean>>;
  actionContext?: (task: Task) => ActionContext;
  selectedId?: string | null;
}

type RowProps = {
  task: Task;
  today: ISODate;
  context?: ActionContext;
  selected?: boolean;
  /** This row is the stand-in for a task that just left the list. It shows the task's new state until it folds away. */
  ghost?: Move;
  /** This row is the same task arriving in its new list, growing in as the ghost folds away. */
  entering?: boolean;
};

/** The handle is the only place a drag starts, so the rest of the row stays free for clicking and editing. */
function DragHandle({
  title,
  attributes,
  listeners,
  activator,
  dragging,
}: {
  title: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  activator: (node: HTMLElement | null) => void;
  dragging: boolean;
}) {
  return (
    <button
      type="button"
      ref={activator}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${title}`}
      data-slot="drag-handle"
      data-dragging={dragging || undefined}
      // A touch on the handle must not start the row's swipe.
      onPointerDown={(e) => e.stopPropagation()}
      // Its column is always reserved, but the grip shows only while the row is hovered, the handle has keyboard focus
      // or it is being dragged. Screens with no hover (phones) show it all the time.
      className="m-1 mr-0 flex flex-1 cursor-grab self-stretch touch-none items-center justify-center rounded-sm text-checkbox opacity-0 transition-opacity duration-150 outline-none group-hover/row:opacity-100 hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:cursor-grabbing data-dragging:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
    >
      <Icon name="reorder" weight="bold" className="size-3.5" />
    </button>
  );
}

/**
 * A row that slides up out of the list when its task is deleted, so what's below follows it. A ghost
 * does the same once its hold is over, and a row arriving from another list grows in the same way.
 */
function LeaveFold({ id, ghost, entering, children }: { id: string; ghost?: Move; entering?: boolean; children: ReactNode }) {
  const deleting = useLeaving(id);
  const leaving = ghost ? ghost.phase === 'leave' : deleting;
  return (
    <div
      data-leaving={leaving || undefined}
      data-entering={entering || undefined}
      data-ghost={ghost ? (ghost.after.completedAt ? 'done' : 'undone') : undefined}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr] transition-[grid-template-rows,opacity] data-leaving:grid-rows-[0fr] data-leaving:opacity-0 data-entering:animate-[row-grow_200ms_ease-out] data-leaving:data-ghost:pointer-events-none motion-reduce:data-entering:animate-none',
        FOLD_MOTION,
      )}
    >
      <div data-leaving={leaving || undefined} data-entering={entering || undefined} className="min-h-0 data-entering:overflow-hidden data-leaving:overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SortableRow({ ghost, entering, ...props }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  const handle = <DragHandle title={props.task.title} attributes={attributes} listeners={listeners} activator={setActivatorNodeRef} dragging={isDragging} />;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'opacity-40')}>
      <LeaveFold id={props.task.id} entering={entering}>
        <TaskRow {...props} handle={handle} />
      </LeaveFold>
    </div>
  );
}

function DraggableRow({ ghost, entering, ...props }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: props.task.id });
  const handle = <DragHandle title={props.task.title} attributes={attributes} listeners={listeners} activator={setActivatorNodeRef} dragging={isDragging} />;
  return (
    <div ref={setNodeRef} className={cn(isDragging && 'opacity-40')}>
      <LeaveFold id={props.task.id} entering={entering}>
        <TaskRow {...props} handle={handle} />
      </LeaveFold>
    </div>
  );
}

function PlainRow({ ghost, entering, ...props }: RowProps) {
  return (
    <div>
      <LeaveFold id={props.task.id} ghost={ghost} entering={entering}>
        <TaskRow {...props} />
      </LeaveFold>
    </div>
  );
}

/** When the last task in a section is deleted or completed, the whole section (heading and gap included) slides away with it. */
function SectionLeave({ section, children }: { section: BoardSection; children: ReactNode }) {
  const leavingIds = useLeavingIds();
  const moves = useMoves();
  const leaving =
    section.tasks.length > 0 &&
    !section.later?.length &&
    section.tasks.every((t) => leavingIds.has(t.id) || (moves.get(t.id)?.from === section.id && moves.get(t.id)?.phase === 'leave'));
  return (
    <div
      data-leaving={leaving || undefined}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr] transition-[grid-template-rows,margin-bottom] data-leaving:-mb-section-gap data-leaving:grid-rows-[0fr]',
        FOLD_MOTION,
      )}
    >
      <div data-leaving={leaving || undefined} className="min-h-0 data-leaving:overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SectionView({
  section,
  today,
  expanded,
  actionContext,
  selectedId,
  dnd,
  dragging,
}: Omit<BoardViewProps, 'board' | 'positions'> & { section: BoardSection; dnd: boolean; dragging: boolean }) {
  const [storedOpen, setOpen] = usePersistedBoolean(`board:open:${section.id}`, !section.collapsedByDefault);
  const [storedLaterOpen, setLaterOpen] = usePersistedBoolean('board:open:waiting_later', false);
  const open = expanded?.[section.id] ?? storedOpen;
  const laterOpen = expanded?.waiting_later ?? storedLaterOpen;
  const later = section.later ?? [];
  const reorderable = dnd && REORDERABLE.includes(section.id);
  // Dropping onto a collapsed section isn't allowed; Upcoming takes drops only when expanded.
  const { setNodeRef, isOver } = useDroppable({ id: `section:${section.id}`, disabled: !dnd || !open || !(reorderable || section.id === 'upcoming') });
  const moves = useMoves();
  const Row = (task: Task, kind: 'sortable' | 'draggable' | 'plain', list: Section | 'waiting_later' = section.id) => {
    const move = moves.get(task.id);
    const ghost = move?.from === list ? move : undefined;
    const props = { task, today, context: actionContext?.(task), selected: task.id === selectedId, ghost, entering: !!move && !ghost && move.phase === 'leave' };
    if (ghost) return <PlainRow key={`ghost:${task.id}`} {...props} />;
    return kind === 'sortable' ? <SortableRow key={task.id} {...props} /> : kind === 'draggable' ? <DraggableRow key={task.id} {...props} /> : <PlainRow key={task.id} {...props} />;
  };
  const draggableKind = dnd && section.id !== 'completed' && section.id !== 'trash' ? 'draggable' : 'plain';
  const rows = section.tasks.map((t) => Row(t, reorderable ? 'sortable' : draggableKind));
  const sortableIds = section.tasks.filter((t) => moves.get(t.id)?.from !== section.id).map((t) => t.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-section={section.id} className="flex flex-col">
      {/* The caret sits in the rows' checkbox column so the title starts where task titles start. Collapsed, the header is a full-width card row.
          It is a row tall either way, so the title and caret stay put when the section opens or closes. */}
      <CollapsibleTrigger
        className={cn(
          'flex min-h-row w-full items-center gap-row-gap rounded-xl max-sm:rounded-none pr-row-x pl-task-lead text-left text-subhead font-semibold text-section-header outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
          FOLD_MOTION,
          !open && 'bg-card hover:bg-card-hover',
        )}
      >
        <span className="flex size-checkbox shrink-0 items-center justify-center">
          <Caret open={open} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="optical-center">{SECTION_TITLES[section.id]}</span>
          <span className="optical-center font-normal text-muted-foreground" data-slot="section-count">
            {section.count}
          </span>
        </span>
      </CollapsibleTrigger>
      {/* The 2px bleed keeps the drop target's ring inside the panel's clip without moving anything. */}
      <Fold className="pointer-events-none -m-0.5 p-0.5 *:pointer-events-auto">
        <div ref={setNodeRef} className={cn('rounded-xl max-sm:rounded-none', isOver && 'ring-2 ring-ring max-sm:ring-inset')} data-drop-target={section.id}>
          <RowList className="max-sm:rounded-none">
            {reorderable ? (
              <SortableContext id={section.id} items={sortableIds} strategy={verticalListSortingStrategy}>
                {rows}
              </SortableContext>
            ) : (
              rows
            )}
            {section.count === 0 && dragging && (
              <div className="flex min-h-row items-center pr-row-x pl-task-lead text-footnote text-muted-foreground">Drop here</div>
            )}
            {later.length > 0 && (
              <Collapsible open={laterOpen} onOpenChange={setLaterOpen} data-later>
                <CollapsibleTrigger className="flex min-h-row w-full items-center gap-row-gap pr-row-x pl-task-lead text-left text-body text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50">
                  <span className="flex size-checkbox items-center justify-center">
                    <Icon name="waiting" className="size-icon" />
                  </span>
                  <span className="optical-center flex-1">
                    {laterOpen ? 'Hide' : 'Show'} {later.length} hidden until later
                  </span>
                  <Caret open={laterOpen} />
                </CollapsibleTrigger>
                <Fold>
                  <div className="*:relative [&>*]:before:absolute [&>*]:before:top-0 [&>*]:before:right-0 [&>*]:before:left-task-separator-inset [&>*]:before:z-10 [&>*]:before:h-px [&>*]:before:bg-border">
                    {later.map((t) => Row(t, draggableKind, 'waiting_later'))}
                  </div>
                </Fold>
              </Collapsible>
            )}
          </RowList>
        </div>
      </Fold>
    </Collapsible>
  );
}

/**
 * The board: sections top to bottom, empty ones left out (empty manual sections show while dragging,
 * as drop targets). Drag to reorder within a section; dragging between In Progress, Waiting and
 * Ready changes the status; dropping into Upcoming asks for the start date.
 */
/** Upcoming has no row slots, so a pointer inside it wins over the nearest row elsewhere. */
const collision: CollisionDetection = (args) => {
  const upcoming = pointerWithin(args).find((c) => c.id === 'section:upcoming');
  return upcoming ? [upcoming] : closestCenter(args);
};

/**
 * The board as the list shows it while tasks are moving between open and completed. Each ghost holds its
 * old place in the list it left, and during the hold the task is kept out of the list it is entering.
 */
function withMoves(board: Board, moves: ReadonlyMap<string, Move>): Board {
  if (moves.size === 0) return board;
  const sections = board.sections.map((s) => ({ ...s, tasks: [...s.tasks], ...(s.later ? { later: [...s.later] } : {}) }));
  for (const move of moves.values()) {
    const id = move.after.id;
    const target = sections.find((s) => s.id === (move.from === 'waiting_later' ? 'waiting' : move.from));
    if (move.phase === 'hold') {
      for (const s of sections) {
        if (s === target) continue;
        s.tasks = s.tasks.filter((t) => t.id !== id);
        if (s.later) s.later = s.later.filter((t) => t.id !== id);
      }
    }
    if (!target) continue;
    const list = move.from === 'waiting_later' ? (target.later ??= []) : target.tasks;
    const at = list.findIndex((t) => t.id === id);
    if (at !== -1) list.splice(at, 1);
    list.splice(Math.min(move.index, list.length), 0, move.after);
  }
  return { ...board, sections };
}

export function BoardView({ board, positions, ...props }: BoardViewProps) {
  const actions = useBoardActions();
  const moves = useMoves();
  const shown = useMemo(() => withMoves(board, moves), [board, moves]);
  const dnd = !!actions && !!positions;
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const all = board.sections.flatMap((s) => [...s.tasks, ...(s.later ?? [])]);
  const listOf = (id: string): Section | 'waiting_later' | null => {
    if (id.startsWith('section:')) return id.slice('section:'.length) as Section;
    for (const s of board.sections) {
      if (s.tasks.some((t) => t.id === id)) return s.id;
      if (s.later?.some((t) => t.id === id)) return 'waiting_later';
    }
    return null;
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    const task = all.find((t) => t.id === a.id);
    if (!task || !over || !actions || !positions) return;
    const from = listOf(String(a.id));
    const to = listOf(String(over.id));
    if (!to || to === 'waiting_later' && from === 'waiting_later') return;
    const target: Section = to === 'waiting_later' ? 'waiting' : to;
    if (target === 'upcoming') {
      if (from !== 'upcoming') actions.pickStart(task, () => undefined);
      return;
    }
    if (!REORDERABLE.includes(target)) return;
    const section = board.sections.find((s) => s.id === target)!;
    const list = section.tasks.filter((t) => t.id !== task.id);
    const overIndex = section.tasks.findIndex((t) => t.id === over.id);
    const index = overIndex === -1 ? list.length : overIndex;
    if (from === target) {
      if (section.tasks[index]?.id === task.id) return;
      actions.reorder(task, planDrop(list, positions, task.id, index));
      return;
    }
    if (from === 'waiting_later' && target === 'waiting') return;
    actions.setStatus(task, SECTION_STATUS[target]!, (after) =>
      sectionFor(after, props.today) === target ? planDrop(list, positions, task.id, index) : undefined,
    );
  };

  const sections = shown.sections.filter((s) => s.count > 0 || s.tasks.length > 0 || !!s.later?.length || (active && REORDERABLE.includes(s.id)));
  const content = (
    // On phones the sections bleed to the screen edges; headers and rows keep their own padding, so titles still line up.
    <div className="flex flex-col gap-section-gap max-sm:-mx-row-x max-sm:overflow-x-clip" data-slot="board">
      {sections.map((section) => (
        <SectionLeave key={section.id} section={section}>
          <SectionView section={section} dnd={dnd} dragging={!!active} {...props} />
        </SectionLeave>
      ))}
    </div>
  );
  if (!dnd) return content;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active: a }: DragStartEvent) => setActive(all.find((t) => t.id === a.id) ?? null)}
      onDragCancel={() => setActive(null)}
      onDragEnd={onDragEnd}
    >
      {content}
      <DragOverlay>
        {active && (
          <div className="overflow-hidden rounded-lg shadow-lg ring-1 ring-border">
            <TaskRowContent
              task={active}
              today={props.today}
              rowActions={actionsFor(active, props.today)}
              handle={
                <span className="flex size-full cursor-grabbing items-center justify-center text-link">
                  <Icon name="reorder" weight="bold" className="size-3.5" />
                </span>
              }
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
