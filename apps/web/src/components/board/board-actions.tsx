import {
  applyDateEffect,
  changeStatus,
  complete,
  markNotDone,
  planUpcomingDrop,
  restore,
  setDueDate,
  softDelete,
  startPresets,
  waitPresets,
  waitUntil,
  type ActionGroup,
  type ISODate,
  type PositionWrite,
  type Preset,
  type StartDecision,
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
import { StartDecisionPrompt, STATUS_LABELS } from './start-decision-prompt';
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
  /** The status menu and drag-and-drop. Into Waiting always asks for a check-back date. */
  setStatus: (task: Task, to: Status, drop?: DropPlanner) => void;
  /** Dropped into Upcoming: asks for a future start date (first offering to remove a due date of today or earlier), and makes the task Open. */
  pickStart: (task: Task, drop?: DropPlanner) => void;
  setField: (task: Task, field: 'start' | 'due' | 'checkBack', date: ISODate | null) => void;
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
  | { kind: 'decision'; task: Task; to: Status; decision: StartDecision; drop?: DropPlanner }
  | { kind: 'upcomingDecision'; task: Task; decision: UpcomingDropDecision; drop?: DropPlanner }
  /** `upcoming` is a drop into Upcoming: the task as it enters (from `planUpcomingDrop`) and its start presets. */
  | { kind: 'start'; task: Task; to: Status | null; upcoming?: { task: Task; presets: Preset[] }; max?: ISODate; drop?: DropPlanner }
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
      const result = changeStatus(task, to, today);
      if (result.decision) setPending({ kind: 'decision', task, to, decision: result.decision, drop });
      else commit(task, result.task, drop);
    },
    [commit, today],
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
        } else if (field === 'checkBack') commit(task, waitUntil(task, date));
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
      {pending?.kind === 'decision' && (
        <StartDecisionPrompt
          task={pending.task}
          to={pending.to}
          decision={pending.decision}
          today={today}
          open
          onOpenChange={(open) => !open && close()}
          onChoose={(answer) => {
            if (answer === 'set') {
              const due = pending.decision.dueDate;
              setPending({ kind: 'start', task: pending.task, to: pending.to, ...(due ? { max: due } : {}), drop: pending.drop });
              return;
            }
            const result = changeStatus(pending.task, pending.to, today, answer);
            close();
            if (result.task) commit(pending.task, result.task, pending.drop);
          }}
        />
      )}
      {pending?.kind === 'upcomingDecision' && (
        <Surface
          open
          onOpenChange={(open) => !open && close()}
          title={`Start “${pending.task.title}” later`}
          description={`It's due ${pending.decision.dueDate === today ? 'today' : longDate(pending.decision.dueDate, today)}, so it can only start later without a due date.`}
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
        <Surface open onOpenChange={(open) => !open && close()} title={pending.task.title} slot="preset-sheet">
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
  return { kind: 'start', task, to: null, upcoming: { task: planned.task, presets: planned.presets }, ...(due ? { max: due } : {}), drop };
}

/** Wait until: shown whenever a task's status changes to Waiting (status menu or drag). No date is the default. */
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
    task.startDate && task.startDate > today
      ? [{ id: 'keep', label: `Keep ${shortDate(task.startDate, today)}`, icon: 'startDate', effect: { kind: 'set', field: 'checkBack', date: task.startDate } }]
      : [];
  const group: PresetGroup = { title: 'Wait until', icon: 'waiting', presets: [...waitPresets(today), ...keep] };
  const choose = (date: ISODate | null) => {
    onClose();
    commit(task, waitUntil(task, date), drop);
  };
  return (
    <Surface
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Move “${task.title}” to Waiting`}
      description="When should it come back for follow-up? The check-back date is its start date while it waits."
      slot="wait-pane"
    >
      <PresetPanel
        group={group}
        defaultId="noDate"
        onPreset={(p) => p.effect.kind === 'set' && choose(p.effect.date)}
        onPickDate={(_, date) => choose(date)}
      />
    </Surface>
  );
}

/** Pick a start date: dropping into Upcoming, or "Pick a start date…" when leaving Waiting. */
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
  const { task, to, upcoming, max, drop } = pending;
  const capped = { ...task, dueDate: max ?? null, status: 'open' as const };
  const presets: Preset[] = upcoming
    ? upcoming.presets
    : startPresets(capped, today)
        .filter((p) => p.id !== 'clear')
        .map((p) => (p.effect.kind === 'pick' ? { ...p, effect: { ...p.effect, min: today } } : p));
  const choose = (date: ISODate) => {
    onClose();
    if (upcoming) {
      commit(task, { ...upcoming.task, startDate: date }, drop);
      return;
    }
    const result = changeStatus(task, to ?? task.status, today, { set: date });
    if (result.task) commit(task, result.task, drop);
  };
  return (
    <Surface
      open
      onOpenChange={(open) => !open && onClose()}
      title={upcoming ? `Start “${task.title}” later` : `Move “${task.title}” to ${STATUS_LABELS[to ?? 'open']}`}
      description={
        max
          ? `On or before the due date, ${longDate(max, today)}.`
          : task.dueDate && upcoming && !upcoming.task.dueDate
            ? 'Its due date is removed when you pick a start date.'
            : undefined
      }
      slot="start-pane"
    >
      <PresetPanel
        group={{ title: 'Start', icon: 'startDate', presets }}
        onPreset={(p) => p.effect.kind === 'set' && p.effect.date && choose(p.effect.date)}
        onPickDate={(_, date) => choose(date)}
      />
    </Surface>
  );
}
