import {
  applyDateEffect,
  buildBoard,
  changeStatus,
  complete,
  markNotDone,
  planOccurrence,
  planUndoOccurrence,
  isOccurrenceHistory,
  taskHistory,
  planCreateTag,
  planDeleteTag,
  planRenameTag,
  planUpcomingDrop,
  restore,
  setDueDate,
  softDelete,
  startForDue,
  waitPresets,
  waitUntil,
  withRepeat,
  type ActionGroup,
  type ISODate,
  type PositionWrite,
  type Preset,
  type Status,
  type SubtaskChange,
  type Tag,
  type OccurrencePlan,
  type RepeatRule,
  type Task,
  type UpcomingDropDecision,
} from '@app/core';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TaskWrites } from '@/data/board-data';
import { longDate, shortDate } from '@/lib/day-label';
import { cancelMove, canAnimateMoves, flashDropped, hasMove, leaveThen, pulse, startMove, type MoveSource } from '@/lib/transient';
import { PresetPanel, type PresetGroup } from './preset-panel';
import { Surface } from './surface';

/** Where a dragged task lands, worked out once the status change has settled. */
export type DropPlanner = (after: Task) => PositionWrite[] | undefined;

export interface BoardActions {
  today: ISODate;
  open: (task: Task) => void;
  complete: (task: Task) => void;
  markNotDone: (task: Task) => void;
  toggleFlag: (task: Task) => void;
  /** A tapped preset (set or skip), or a date picked for a "Pick date" preset. */
  preset: (task: Task, preset: Preset, picked?: ISODate) => void;
  /** An action without presets: Move to In Progress, Start now, Mark not done, Restore. */
  group: (task: Task, group: ActionGroup) => void;
  /** Opens the quick picks for a group in a sheet (phones, where there's no hover popover). */
  showPresets: (task: Task, group: ActionGroup, pick?: Preset) => void;
  /** The status menu and drag-and-drop. Into Waiting always asks for a hide-until date. */
  setStatus: (task: Task, to: Status, drop?: DropPlanner) => void;
  /** Dropped into Upcoming: asks for a future start date. A task due today or earlier is asked to remove its start date instead, and stays put. */
  pickStart: (task: Task, drop?: DropPlanner) => void;
  setField: (task: Task, field: 'start' | 'due' | 'hideUntil', date: ISODate | null) => void;
  /** Sets or clears the repeat. A rule with no due date is anchored to today. */
  setRepeat: (task: Task, rule: RepeatRule | null) => void;
  /** Resolves once the write has settled, whether or not it succeeded. */
  edit: (task: Task, fields: Partial<Pick<Task, 'title' | 'description' | 'flagged'>>) => Promise<void>;
  reorder: (task: Task, drop: PositionWrite[]) => void;
  /** One subtask add, edit, move or remove. Resolves once the write has settled, whether or not it succeeded. */
  changeSubtasks: (task: Task, change: SubtaskChange) => Promise<void>;
  /** Puts a tag on or off a task. Resolves once the write has settled, whether or not it succeeded. */
  setTag: (task: Task, tag: Tag, on: boolean) => Promise<void>;
  /** A tag typed in the picker: made (or, if one has that name ignoring case, reused) and put on the task. */
  createTag: (task: Task, name: string) => Promise<void>;
  /** Renames a tag on every task at once. */
  renameTag: (tag: Tag, name: string) => Promise<void>;
  /** Deletes a tag and removes it from every task. */
  deleteTag: (tag: Tag) => Promise<void>;
  remove: (task: Task) => void;
  removeForever: (task: Task) => void;
  /** Advances a repeating task past this occurrence without finishing it. */
  skip: (task: Task) => void;
  /** Undoes the latest completion or skip, when the task hasn't been edited since. */
  undoLatest: (task: Task) => void;
}

const BoardActionsContext = createContext<BoardActions | null>(null);

/** The actions, or null in the static design screens, where rows render without handlers. */
export function useBoardActions(): BoardActions | null {
  return useContext(BoardActionsContext);
}

type Pending =
  | { kind: 'wait'; task: Task; drop?: DropPlanner }
  | { kind: 'upcomingDecision'; task: Task; decision: UpcomingDropDecision; drop?: DropPlanner }
  /** `upcoming` is a drop into Upcoming: the task as it enters (from `planUpcomingDrop`) and its start presets. */
  | { kind: 'start'; task: Task; upcoming: { task: Task; presets: Preset[] }; max?: ISODate; drop?: DropPlanner }
  | { kind: 'presets'; task: Task; group: ActionGroup; pick?: Preset };

const quiet = () => {};

/** Runs a rule that throws for input it refuses (a bad tag name), showing why in a toast instead of a console error. */
function attempt<T>(plan: () => T): T | null {
  try {
    return plan();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Where a task sits in the board, Completed included, so a ghost can hold its place while it leaves. */
function placementOf(task: Task, snapshot: ReturnType<TaskWrites['current']>, today: ISODate): { from: MoveSource; index: number } | null {
  const board = buildBoard(snapshot.tasks, snapshot.positions, today, { showCompleted: true });
  for (const section of board.sections) {
    const index = section.tasks.findIndex((t) => t.id === task.id);
    if (index !== -1) return { from: section.id, index };
    const later = section.later?.findIndex((t) => t.id === task.id) ?? -1;
    if (later !== -1) return { from: 'waiting_later', index: later };
  }
  return null;
}

export function BoardActionsProvider({
  today,
  writes,
  onOpen,
  children,
}: {
  today: ISODate;
  writes: TaskWrites;
  onOpen: (task: Task) => void;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const close = () => setPending(null);

  const commit = useCallback(
    (before: Task, after: Task, drop?: DropPlanner, note?: string) =>
      writes.change(before, after, { drop: drop?.(after) }).then(() => {
        if (drop) flashDropped(after.id);
        if (note) toast(note, { action: { label: 'Undo', onClick: () => void writes.change(after, before).catch(quiet) } });
      }, quiet),
    [writes],
  );

  const setStatus = useCallback(
    (task: Task, to: Status, drop?: DropPlanner) => {
      if (task.status === to) return;
      if (to === 'waiting') {
        setPending({ kind: 'wait', task, drop });
        return;
      }
      commit(task, changeStatus(task, to), drop);
    },
    [commit],
  );

  /**
   * Completing and un-completing. The change is written at once, so nothing waits on the animation: the
   * row stays where it was for a moment, then folds away as it grows into its new list. Toggling the same
   * row again, or a write that fails, drops the animation and the list shows the data.
   */
  const flip = useCallback(
    (before: Task, after: Task, onSaved?: () => void, write?: () => Promise<void>) => {
      const rapid = hasMove(before.id);
      const place = !rapid && canAnimateMoves() ? placementOf(before, writes.current(), today) : null;
      if (rapid) cancelMove(before.id);
      if (place) startMove({ after, ...place });
      const run = write ?? (() => writes.change(before, after));
      void run().then(onSaved, () => cancelMove(before.id));
    },
    [today, writes],
  );

  const undoOccurrence = useCallback(
    (taskId: string, record: OccurrencePlan['record'], historyCount: number) => {
      const snap = writes.current();
      const task = snap.tasks.find((t) => t.id === taskId);
      if (!task) return;
      try {
        const plan = planUndoOccurrence(task, record, historyCount, snap.positions.get(taskId) ?? null);
        const write = () => writes.undoOccurrence(task, plan);
        if (task.completedAt) flip(task, plan.task, undefined, write);
        else void write().catch(quiet);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [flip, writes],
  );

  const occur = useCallback(
    (task: Task, kind: 'done' | 'skip') => {
      const snap = writes.current();
      const prior = snap.completions.filter((c) => c.taskId === task.id);
      const historyCount = prior.length;
      let planned: OccurrencePlan;
      try {
        planned = planOccurrence({
          id: crypto.randomUUID(),
          task,
          kind,
          on: today,
          now: new Date().toISOString(),
          historyCount,
          sortKey: snap.positions.get(task.id) ?? null,
          prior,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return;
      }
      const message = kind === 'skip' ? `Skipped “${task.title}”` : `Completed “${task.title}”`;
      const saved = () => toast(message, { action: { label: 'Undo', onClick: () => undoOccurrence(task.id, planned.record, historyCount) } });
      const write = () => writes.occur(task, planned);
      if (planned.outcome === 'end') flip(task, planned.task, saved, write);
      else void write().then(saved, quiet);
    },
    [flip, today, undoOccurrence, writes],
  );

  const actions = useMemo<BoardActions>(() => {
    const preset = (task: Task, p: Preset, picked?: ISODate) => {
      const effect = p.effect;
      if (effect.kind === 'skip') {
        occur(task, 'skip');
        return;
      }
      const date = effect.kind === 'pick' ? picked : effect.date;
      if (date === undefined) return;
      const result = applyDateEffect(task, { kind: 'set', field: effect.field, date });
      commit(task, result.task, undefined, result.startMoved ? `Start moved to ${shortDate(result.startMoved.to, today)}` : undefined);
    };
    return {
      today,
      open: onOpen,
      complete: (task) => {
        if (task.repeat) {
          pulse();
          occur(task, 'done');
          return;
        }
        const after = complete(task, new Date().toISOString(), today);
        pulse();
        flip(task, after, () => toast(`Completed “${task.title}”`, { action: { label: 'Undo', onClick: () => flip(after, markNotDone(after)) } }));
      },
      markNotDone: (task) => {
        const latest = writes.current().completions.filter((c) => c.taskId === task.id).at(-1);
        if (latest) undoOccurrence(task.id, latest, writes.current().completions.filter((c) => c.taskId === task.id).length - 1);
        else flip(task, markNotDone(task));
      },
      toggleFlag: (task) => commit(task, { ...task, flagged: !task.flagged }),
      preset,
      group: (task, group) => {
        const effect = group.effect;
        if (!effect) return;
        if (effect.kind === 'undone') {
          const rows = writes.current().completions.filter((c) => c.taskId === task.id);
          if (rows.at(-1)) undoOccurrence(task.id, rows.at(-1)!, rows.length - 1);
          else flip(task, markNotDone(task));
        }
        else if (effect.kind === 'restore') commit(task, restore(task));
        else setStatus(task, effect.to);
      },
      showPresets: (task, group, pick) => setPending({ kind: 'presets', task, group, ...(pick ? { pick } : {}) }),
      setStatus,
      pickStart: (task, drop) => {
        const result = planUpcomingDrop(task, today);
        if (result.decision) setPending({ kind: 'upcomingDecision', task, decision: result.decision, drop });
        else setPending(upcomingStart(task, result, drop));
      },
      setField: (task, field, date) => {
        if (field === 'due') {
          if (date === null && task.repeat) {
            toast('A repeat needs a due date');
            return;
          }
          const result = setDueDate(task, date);
          let next = result.task;
          if (next.status === 'open' && next.repeat && next.dueDate) next = { ...next, startDate: startForDue(next.dueDate, next.repeat) };
          const startNote = next.startDate && next.startDate !== (task.startDate ?? null) ? `Start moved to ${shortDate(next.startDate, today)}` : undefined;
          commit(task, next, undefined, startNote);
        } else if (field === 'hideUntil') commit(task, waitUntil(task, date));
        else commit(task, { ...task, startDate: date });
      },
      setRepeat: (task, rule) => {
        try {
          commit(task, withRepeat(task, rule, today));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      },
      edit: (task, fields) => commit(task, { ...task, ...fields }),
      reorder: (task, drop) => commit(task, task, () => drop),
      changeSubtasks: (task, change) => writes.subtask(task, change).then(quiet, quiet),
      setTag: (task, tag, on) => writes.taskTag(task, on ? { kind: 'attach', tag } : { kind: 'detach', tagId: tag.id }).then(quiet, quiet),
      createTag: async (task, name) => {
        const planned = attempt(() => planCreateTag(writes.current().tags, { id: crypto.randomUUID(), name }));
        if (planned) await writes.taskTag(task, { kind: 'attach', tag: planned.tag }, planned.change ?? undefined).then(quiet, quiet);
      },
      renameTag: async (tag, name) => {
        const change = attempt(() => planRenameTag(writes.current().tags, tag.id, name));
        if (change) await writes.tagList(change).then(quiet, quiet);
      },
      deleteTag: async (tag) => {
        const change = attempt(() => planDeleteTag(writes.current().tags, tag.id));
        if (change) await writes.tagList(change).then(quiet, quiet);
      },
      remove: (task) => {
        const after = softDelete(task, new Date().toISOString(), today);
        void leaveThen(task.id, () =>
          writes.change(task, after).then(
            () => toast(`Moved “${task.title}” to Recently deleted`, { action: { label: 'Undo', onClick: () => void writes.change(after, restore(after)).catch(quiet) } }),
            quiet,
          ),
        );
      },
      removeForever: (task) => void leaveThen(task.id, () => writes.remove(task).catch(quiet)),
      skip: (task) => occur(task, 'skip'),
      undoLatest: (task) => {
        const snap = writes.current();
        const records = snap.completions.filter((row) => row.taskId === task.id);
        const history = taskHistory(task, records, snap.positions.get(task.id) ?? null, snap.activities ?? []);
        const occurrences = history.filter(isOccurrenceHistory);
        const index = occurrences.findIndex((row) => row.undoable);
        const record = index < 0 ? undefined : records.find((row) => row.id === occurrences[index]!.id);
        if (record) undoOccurrence(task.id, record, index);
      },
    };
  }, [commit, flip, occur, onOpen, setStatus, today, undoOccurrence, writes]);

  return (
    <BoardActionsContext.Provider value={actions}>
      {children}
      {pending?.kind === 'wait' && <WaitPane pending={pending} today={today} onClose={close} commit={commit} />}
      {pending?.kind === 'upcomingDecision' && (
        <Surface
          open
          onOpenChange={(open) => !open && close()}
          title="Move and remove start date?"
          description="Upcoming tasks cannot have a start date after a due date which this task currently has."
          slot="upcoming-drop-prompt"
        >
          <div className="flex flex-col gap-2">
            <Button
              data-choice="clear_start"
              onClick={() => {
                const task = pending.task;
                close();
                // The due date stays. Clearing the start date does not move the task into Upcoming.
                if (task.startDate) commit(task, { ...task, startDate: null });
              }}
            >
              Remove start date
            </Button>
            <Button variant="ghost" data-choice="cancel" onClick={close}>
              Cancel
            </Button>
          </div>
        </Surface>
      )}
      {pending?.kind === 'start' && <StartPane pending={pending} today={today} onClose={close} commit={commit} />}
      {pending?.kind === 'presets' && (
        <Surface
          open
          onOpenChange={(open) => !open && close()}
          title={pending.group.title}
          description={pending.task.title}
          descriptionClassName="sr-only"
          slot="preset-sheet"
        >
          <PresetPanel
            group={pending.group}
            initialPick={pending.pick}
            onPreset={(p) => {
              close();
              actions.preset(pending.task, p);
            }}
            onPickDate={(p, date) => {
              close();
              actions.preset(pending.task, p, date);
            }}
          />
        </Surface>
      )}
    </BoardActionsContext.Provider>
  );
}

function upcomingStart(task: Task, planned: { task: Task; presets: Preset[] }, drop?: DropPlanner): Pending {
  const due = planned.task.dueDate;
  return { kind: 'start', task, upcoming: { task: planned.task, presets: planned.presets }, ...(due ? { max: due } : {}), drop };
}

/** Hide until: shown whenever a task's status changes to Waiting (status menu or drag). Don't hide is the default. */
function WaitPane({
  pending,
  today,
  onClose,
  commit,
}: {
  pending: Extract<Pending, { kind: 'wait' }>;
  today: ISODate;
  onClose: () => void;
  commit: (before: Task, after: Task, drop?: DropPlanner) => void;
}) {
  const { task, drop } = pending;
  const group: PresetGroup = { title: 'Hide until', icon: 'waiting', presets: waitPresets(today) };
  const choose = (date: ISODate | null) => {
    onClose();
    commit(task, waitUntil(task, date), drop);
  };
  return (
    <Surface
      open
      onOpenChange={(open) => !open && onClose()}
      title="Hide until"
      description={task.title}
      descriptionClassName="sr-only"
      slot="wait-pane"
    >
      <PresetPanel
        group={group}
        defaultId="noDate"
        hideHeader
        onPreset={(p) => p.effect.kind === 'set' && choose(p.effect.date)}
        onPickDate={(_, date) => choose(date)}
      />
    </Surface>
  );
}

/** Pick a start date for a drop into Upcoming. */
function StartPane({
  pending,
  today,
  onClose,
  commit,
}: {
  pending: Extract<Pending, { kind: 'start' }>;
  today: ISODate;
  onClose: () => void;
  commit: (before: Task, after: Task, drop?: DropPlanner) => void;
}) {
  const { task, upcoming, max, drop } = pending;
  const description = max
    ? `On or before the due date, ${longDate(max, today)}.`
    : task.dueDate && !upcoming.task.dueDate
      ? 'Its due date is removed when you pick a start date.'
      : undefined;
  const choose = (date: ISODate) => {
    onClose();
    commit(task, { ...upcoming.task, startDate: date }, drop);
  };
  return (
    <Surface
      open
      onOpenChange={(open) => !open && onClose()}
      title="Start later"
      description={description ?? task.title}
      descriptionClassName={description ? undefined : 'sr-only'}
      slot="start-pane"
    >
      <PresetPanel
        group={{ title: 'Start', icon: 'startDate', presets: upcoming.presets }}
        onPreset={(p) => p.effect.kind === 'set' && p.effect.date && choose(p.effect.date)}
        onPickDate={(_, date) => choose(date)}
      />
    </Surface>
  );
}
