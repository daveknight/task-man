import { planAddSubtask, planEditSubtask, planMoveSubtask, planRemoveSubtask, sortSubtasks, subtaskCount, type Subtask, type Task } from '@app/core';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useOnline } from '@/lib/online';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { DragHandle, RowList } from './board-view';

type Editing = { kind: 'new'; nonce: number } | { kind: 'edit'; id: string } | null;

/** How a subtask field ended: Return saves and goes on to the next, leaving the field saves and finishes. */
type Submit = 'next' | 'blur';

/**
 * The field a subtask is typed into. Return saves it and asks for another, Escape drops what was typed
 * and finishes, and leaving the field saves it. Whichever comes first wins, so a Return that unmounts the
 * field can't also count as a blur.
 */
function SubtaskInput({
  initial,
  label,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  onSubmit: (text: string, how: Submit) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const settled = useRef(false);
  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };
  return (
    <input
      autoFocus
      data-slot="subtask-input"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          settle(() => onSubmit(text, 'next'));
        } else if (e.key === 'Escape') {
          // Finishing the list isn't closing the sheet.
          e.preventDefault();
          e.stopPropagation();
          settle(onCancel);
        }
      }}
      onBlur={() => settle(() => onSubmit(text, 'blur'))}
      className="h-7 min-w-0 flex-1 rounded-md border border-ring bg-background px-2 text-body ring-3 ring-ring/30 outline-none placeholder:text-muted-foreground"
    />
  );
}

function SubtaskRow({
  subtask,
  editing,
  locked,
  onToggle,
  onEdit,
  onDelete,
  onSubmit,
  onCancel,
}: {
  subtask: Subtask;
  editing: boolean;
  locked: boolean;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSubmit: (text: string, how: Submit) => void;
  onCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: subtask.id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      data-slot="subtask-row"
      data-subtask-id={subtask.id}
      data-done={subtask.done || undefined}
      // Only vertical movement, and the dragged row stays opaque above its neighbours.
      style={{ transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null), transition }}
      className={cn('group/row relative flex min-h-subtask items-center gap-row-gap bg-card px-row-x', isDragging && 'z-20 shadow-md ring-1 ring-border')}
    >
      {/* The grip sits in the padding, clear of the checkbox, so the circle lines up with the card icon and the title with the other field labels. It stays above the checkbox's expanded hit area, which reaches back into that padding. */}
      {!locked && (
        <span
          className="absolute inset-y-0 left-0 z-10 flex items-center justify-center"
          style={{ width: 'calc(var(--space-row-x) - (var(--size-checkbox) - var(--size-icon)) / 2 - 1px)' }}
        >
          <DragHandle
            title={subtask.title}
            attributes={attributes}
            listeners={listeners}
            activator={setActivatorNodeRef}
            dragging={isDragging}
            className="m-0 h-full w-full flex-none"
          />
        </span>
      )}
      <span className="flex size-icon shrink-0 items-center justify-center">
        <Checkbox aria-label={subtask.title} checked={subtask.done} disabled={locked} onCheckedChange={(checked) => onToggle(checked)} />
      </span>
      {editing ? (
        <SubtaskInput initial={subtask.title} label="Subtask title" onSubmit={onSubmit} onCancel={onCancel} />
      ) : (
        <button
          type="button"
          data-slot="subtask-title"
          disabled={locked}
          onClick={onEdit}
          className={cn(
            'flex min-h-subtask min-w-0 flex-1 items-center rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50',
            subtask.done && 'text-muted-foreground line-through',
          )}
        >
          <span className="optical-center min-w-0 flex-1 truncate text-body">{subtask.title}</span>
        </button>
      )}
      {!locked && !editing && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${subtask.title}`}
          title="Delete subtask"
          onClick={onDelete}
          className="sr-only text-foreground group-hover/row:not-sr-only group-has-focus-visible/row:not-sr-only hover:text-destructive focus-visible:text-destructive max-sm:hidden pointer-coarse:hidden"
        >
          <Icon name="trash" />
        </Button>
      )}
    </div>
  );
}

/**
 * The Subtasks card between a task's dates and its description: a header with the done count and a grey
 * "+ Add" link, then the subtasks in order (tick, rename in place, drag the handle to reorder). Return in
 * the field saves and asks for another. A task in Recently deleted shows its subtasks as they were, unchanged.
 */
export function SubtasksCard({ task }: { task: Task }) {
  const actions = useBoardActions();
  const online = useOnline();
  const [editing, setEditing] = useState<Editing>(null);
  const subtasks = sortSubtasks(task.subtasks);
  const { done, total } = subtaskCount(subtasks);
  const locked = !!task.deletedAt || !online || !actions;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const write = (change: ReturnType<typeof planAddSubtask> | null) => {
    if (change) void actions?.changeSubtasks(task, change);
  };

  const submitNew = (text: string, how: Submit) => {
    if (text.trim() === '') return setEditing(null);
    write(planAddSubtask(subtasks, { id: crypto.randomUUID(), title: text }));
    setEditing(how === 'next' ? { kind: 'new', nonce: Date.now() } : null);
  };

  const submitEdit = (subtask: Subtask, text: string, how: Submit) => {
    // Clearing the field deletes the subtask, which is how touch screens delete one.
    write(text.trim() === '' ? planRemoveSubtask(subtasks, subtask.id) : planEditSubtask(subtasks, subtask.id, { title: text }));
    setEditing(how === 'next' ? { kind: 'new', nonce: Date.now() } : null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    write(planMoveSubtask(subtasks, String(active.id), subtasks.findIndex((s) => s.id === over.id)));
  };

  return (
    <div data-slot="subtasks-card" className="flex flex-col gap-2" data-base-ui-swipe-ignore>
      <RowList fields className="ring-1 ring-border/60">
        <div className="flex min-h-row items-center gap-row-gap px-row-x" data-slot="subtasks-header">
          <Icon name="subtasks" className="size-icon shrink-0 text-muted-foreground" />
          <span className="optical-center flex-1 text-body">Subtasks</span>
          {total > 0 && (
            <span className="optical-center text-body text-muted-foreground" data-slot="subtasks-progress">
              {done} of {total}
            </span>
          )}
          {!task.deletedAt && (
            <button
              type="button"
              data-slot="subtask-add"
              disabled={locked}
              onClick={() => setEditing({ kind: 'new', nonce: Date.now() })}
              className="inline-flex shrink-0 items-center self-stretch rounded-sm text-body text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <span className="optical-center">+ Add</span>
            </button>
          )}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {subtasks.map((s) => (
              <SubtaskRow
                key={s.id}
                subtask={s}
                locked={locked}
                editing={editing?.kind === 'edit' && editing.id === s.id}
                onToggle={(next) => write(planEditSubtask(subtasks, s.id, { done: next }))}
                onEdit={() => setEditing({ kind: 'edit', id: s.id })}
                onDelete={() => write(planRemoveSubtask(subtasks, s.id))}
                onSubmit={(text, how) => submitEdit(s, text, how)}
                onCancel={() => setEditing(null)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {!task.deletedAt && editing?.kind === 'new' && (
          <div className="flex min-h-subtask items-center gap-row-gap px-row-x" data-slot="subtask-new">
            <Icon name="add" className="size-icon shrink-0 text-muted-foreground" />
            <SubtaskInput key={editing.nonce} initial="" label="New subtask" placeholder="Add subtask" onSubmit={submitNew} onCancel={() => setEditing(null)} />
          </div>
        )}
      </RowList>
      {editing && (
        <p className="px-row-x text-footnote text-muted-foreground" data-slot="subtasks-hint">
          Return saves and adds another. Escape finishes.
        </p>
      )}
    </div>
  );
}
