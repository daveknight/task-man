import {
  applyDateEffect,
  changeStatus,
  complete,
  markNotDone,
  planUpcomingDrop,
  restore,
  setDueDate,
  softDelete,
  waitPresets,
  waitUntil,
  type ActionGroup,
  type ISODate,
  type PositionWrite,
  type Preset,
  type Status,
  type Task,
  type UpcomingDropDecision,
} from '@app/core';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TaskWrites } from '@/data/board-data';
import { longDate, shortDate } from '@/lib/day-label';
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
  /** Dropped into Upcoming: asks for a future start date (first offering to remove a due date of today or earlier), and makes the task Open. */
  pickStart: (task: Task, drop?: DropPlanner) => void;
  setField: (task: Task, field: 'start' | 'due' | 'hideUntil', date: ISODate | null) => void;
  edit: (task: Task, fields: Partial<Pick<Task, 'title' | 'description' | 'flagged'>>) => void;
  reorder: (task: Task, drop: PositionWrite[]) => void;
  remove: (task: Task) => void;
  removeForever: (task: Task) => void;
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
    (before: Task, after: Task, drop?: DropPlanner, note?: string) => {
      writes.change(before, after, { drop: drop?.(after) }).then(() => {
        if (note) toast(note, { action: { label: 'Undo', onClick: () => void writes.change(after, before).catch(quiet) } });
      }, quiet);
    },
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

  const actions = useMemo<BoardActions>(() => {
    const preset = (task: Task, p: Preset, picked?: ISODate) => {
      const effect = p.effect;
      if (effect.kind === 'skip') {
        toast('Skip this occurrence arrives with repeats in Phase 2');
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
        const after = complete(task, new Date().toISOString(), today);
        writes.change(task, after).then(
          () => toast(`Completed “${task.title}”`, { action: { label: 'Undo', onClick: () => void writes.change(after, markNotDone(after)).catch(quiet) } }),
          quiet,
        );
      },
      markNotDone: (task) => commit(task, markNotDone(task)),
      toggleFlag: (task) => commit(task, { ...task, flagged: !task.flagged }),
      preset,
      group: (task, group) => {
        const effect = group.effect;
        if (!effect) return;
        if (effect.kind === 'undone') commit(task, markNotDone(task));
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
          const result = setDueDate(task, date);
          commit(task, result.task, undefined, result.startMoved ? `Start moved to ${shortDate(result.startMoved.to, today)}` : undefined);
        } else if (field === 'hideUntil') commit(task, waitUntil(task, date));
        else commit(task, { ...task, startDate: date });
      },
      edit: (task, fields) => commit(task, { ...task, ...fields }),
      reorder: (task, drop) => commit(task, task, () => drop),
      remove: (task) => {
        const after = softDelete(task, new Date().toISOString(), today);
        writes.change(task, after).then(
          () => toast(`Moved “${task.title}” to Trash`, { action: { label: 'Undo', onClick: () => void writes.change(after, restore(after)).catch(quiet) } }),
          quiet,
        );
      },
      removeForever: (task) => void writes.remove(task).catch(quiet),
    };
  }, [commit, onOpen, setStatus, today, writes]);

  return (
    <BoardActionsContext.Provider value={actions}>
      {children}
      {pending?.kind === 'wait' && <WaitPane pending={pending} today={today} onClose={close} commit={commit} />}
      {pending?.kind === 'upcomingDecision' && (
        <Surface
          open
          onOpenChange={(open) => !open && close()}
          title="Start later"
          description={`Upcoming tasks start after today, and a start can't be after the due date. It's due ${pending.decision.dueDate === today ? 'today' : longDate(pending.decision.dueDate, today)}. Remove the due date to start it later.`}
          slot="upcoming-drop-prompt"
        >
          <div className="flex flex-col gap-2">
            <Button
              data-choice="clear_due"
              onClick={() => {
                const result = planUpcomingDrop(pending.task, today, 'clear_due');
                if (result.task) setPending(upcomingStart(pending.task, result, pending.drop));
              }}
            >
              Remove due date
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
  const keep: Preset[] =
    task.hideUntil && task.hideUntil > today
      ? [{ id: 'keep', label: `Keep ${shortDate(task.hideUntil, today)}`, icon: 'hideUntil', effect: { kind: 'set', field: 'hideUntil', date: task.hideUntil } }]
      : [];
  const group: PresetGroup = { title: 'Hide until', icon: 'waiting', presets: [...waitPresets(today), ...keep] };
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
