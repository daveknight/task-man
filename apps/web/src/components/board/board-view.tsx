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
import { CSS } from '@dnd-kit/utilities';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePersistedBoolean } from '@/lib/persisted';
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
  /** Board positions by task id, for drag-and-drop. Without them the board is static (design screens). */
  positions?: ReadonlyMap<string, string>;
  /** Overrides the remembered expanded state (design screens). */
  expanded?: Partial<Record<Section | 'waiting_later', boolean>>;
  actionContext?: (task: Task) => ActionContext;
  selectedId?: string | null;
}

type RowProps = { task: Task; today: ISODate; context?: ActionContext; selected?: boolean };

function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'opacity-40')} {...attributes} {...listeners}>
      <TaskRow {...props} />
    </div>
  );
}

function DraggableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id });
  return (
    <div ref={setNodeRef} className={cn(isDragging && 'opacity-40')} {...attributes} {...listeners}>
      <TaskRow {...props} />
    </div>
  );
}

function PlainRow(props: RowProps) {
  return (
    <div>
      <TaskRow {...props} />
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
  const Row = (task: Task, kind: 'sortable' | 'draggable' | 'plain') => {
    const props = { task, today, context: actionContext?.(task), selected: task.id === selectedId };
    return kind === 'sortable' ? <SortableRow key={task.id} {...props} /> : kind === 'draggable' ? <DraggableRow key={task.id} {...props} /> : <PlainRow key={task.id} {...props} />;
  };
  const draggableKind = dnd && section.id !== 'completed' && section.id !== 'trash' ? 'draggable' : 'plain';
  const rows = section.tasks.map((t) => Row(t, reorderable ? 'sortable' : draggableKind));

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-section={section.id} className="flex flex-col">
      <CollapsibleTrigger className="flex h-section-header items-center gap-1.5 self-start rounded-md px-row-x text-subhead font-semibold text-section-header outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Caret open={open} />
        <span className="optical-center">{SECTION_TITLES[section.id]}</span>
        <span className="optical-center font-normal text-muted-foreground" data-slot="section-count">
          {section.count}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div ref={setNodeRef} className={cn('rounded-xl', isOver && 'ring-2 ring-ring')} data-drop-target={section.id}>
          <RowList>
            {reorderable ? (
              <SortableContext id={section.id} items={section.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {rows}
              </SortableContext>
            ) : (
              rows
            )}
            {section.count === 0 && dragging && (
              <div className="flex min-h-row items-center px-row-x text-footnote text-muted-foreground">Drop here</div>
            )}
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
                    {later.map((t) => Row(t, draggableKind))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </RowList>
        </div>
      </CollapsibleContent>
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

export function BoardView({ board, positions, ...props }: BoardViewProps) {
  const actions = useBoardActions();
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
      if (from !== 'upcoming') actions.pickStart(task);
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

  const sections = board.sections.filter((s) => s.count > 0 || (active && REORDERABLE.includes(s.id)));
  const content = (
    <div className="flex flex-col gap-section-gap" data-slot="board">
      {sections.map((section) => (
        <SectionView key={section.id} section={section} dnd={dnd} dragging={!!active} {...props} />
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
            <TaskRowContent task={active} today={props.today} rowActions={actionsFor(active, props.today)} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
