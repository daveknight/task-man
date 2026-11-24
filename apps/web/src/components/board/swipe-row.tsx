import { actionsFor, type ActionGroup, type RowActions, type Task } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '@/components/icon';
import { useOnline } from '@/lib/online';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { openDueGroup, TaskRowContent, type TaskRowProps } from './task-row';

export type SwipeReveal = 'left' | 'right';

const GAP = 'var(--space-unit) * 1.5';
const PAD = 'var(--space-unit) * 2';

function SwipeButton({
  icon,
  label,
  className,
  active,
  disabled,
  onClick,
}: {
  icon: IconMeaning;
  label: string;
  className: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-swipe-button items-center justify-center rounded-lg text-swipe-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40',
        className,
      )}
    >
      <Icon name={icon} active={active} weight={active ? 'fill' : 'bold'} className="size-icon" />
    </button>
  );
}

function trayWidth(buttons: number): string {
  return `calc(${buttons} * var(--size-swipe-button) + ${buttons - 1} * ${GAP} + 2 * ${PAD})`;
}

/** The date groups after the state buttons: the row's own (Start, Hide until) if it isn't Due, then Due itself. */
function dateGroups(rowActions: RowActions, due: ActionGroup | null): ActionGroup[] {
  const own = rowActions.date && rowActions.date.id !== 'due' ? [rowActions.date] : [];
  return [...own, ...(due ? [due] : [])];
}

function leftButtons(rowActions: RowActions, due: ActionGroup | null): number {
  return 1 + rowActions.state.length + dateGroups(rowActions, due).length;
}

/** The buttons a swipe reveals. Left, in the same order as the desktop quick actions: Delete (red), state (blue; two for a follow-up), date (orange). Right: Flag. */
function Tray({ task, rowActions, due, reveal, onDone }: { task: Task; rowActions: RowActions; due: ActionGroup | null; reveal: SwipeReveal; onDone?: () => void }) {
  const actions = useBoardActions();
  const online = useOnline();
  const run = (fn: () => void) => () => {
    onDone?.();
    fn();
  };
  const group = (g: ActionGroup) => run(() => (g.presets.length ? actions?.showPresets(task, g) : actions?.group(task, g)));
  const buttons = reveal === 'right' ? 1 : leftButtons(rowActions, due);
  return (
    <div
      className={cn('absolute inset-y-0 flex items-center gap-1.5 px-2', reveal === 'left' ? 'right-0' : 'left-0')}
      style={{ width: trayWidth(buttons) }}
      data-slot="swipe-tray"
      data-reveal={reveal}
    >
      {reveal === 'left' ? (
        <>
          <SwipeButton
            icon="trash"
            label={rowActions.delete.title}
            className="bg-swipe-delete"
            disabled={!online}
            onClick={run(() => (rowActions.delete.id === 'delete' ? actions?.remove(task) : actions?.removeForever(task)))}
          />
          {rowActions.state.map((g) => (
            <SwipeButton key={g.id} icon={g.icon} label={g.title} className="bg-swipe-state" disabled={!online} onClick={group(g)} />
          ))}
          {dateGroups(rowActions, due).map((g) => (
            <SwipeButton key={g.id} icon={g.icon} label={g.title} className="bg-swipe-date" disabled={!online} onClick={group(g)} />
          ))}
        </>
      ) : (
        <SwipeButton
          icon="flag"
          active={!task.flagged}
          label={task.flagged ? 'Remove flag' : 'Flag'}
          className="bg-swipe-flag"
          disabled={!online}
          onClick={run(() => actions?.toggleFlag(task))}
        />
      )}
    </div>
  );
}

/** A row held open mid-swipe, for the design screens. */
export function SwipeRow({ reveal, ...props }: TaskRowProps & { reveal: SwipeReveal }) {
  const rowActions = actionsFor(props.task, props.today, props.context);
  const due = openDueGroup(props.task, props.today, props.context);
  const tray = trayWidth(reveal === 'right' ? 1 : leftButtons(rowActions, due));
  return (
    <div className="relative overflow-hidden bg-card" data-slot="swipe-row" data-reveal={reveal}>
      <Tray task={props.task} rowActions={rowActions} due={due} reveal={reveal} />
      <TaskRowContent
        {...props}
        rowActions={rowActions}
        className="shadow-[0_0_0_0.5px_var(--border)]"
        style={{ transform: `translateX(calc(${reveal === 'left' ? -1 : 1} * ${tray}))` }}
      />
    </div>
  );
}

const OPEN_EVENT = 'swipe-row-open';

/**
 * Swipe actions for touch screens: swipe left for date, state and Delete, swipe right for Flag.
 * There's no full-swipe complete; the checkbox completes. One row is open at a time.
 */
export function SwipeableRow({ rowActions, ...props }: TaskRowProps & { rowActions: RowActions }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<SwipeReveal | null>(null);
  const due = openDueGroup(props.task, props.today, props.context);

  const width = (reveal: SwipeReveal) => {
    const tray = ref.current?.querySelector<HTMLElement>(`[data-reveal="${reveal}"]`);
    return tray?.offsetWidth ?? 0;
  };

  useEffect(() => {
    const close = (e: Event) => {
      if ((e as CustomEvent).detail !== props.task.id) {
        setOpen(null);
        setOffset(0);
      }
    };
    window.addEventListener(OPEN_EVENT, close);
    return () => window.removeEventListener(OPEN_EVENT, close);
  }, [props.task.id]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, base: offset };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!dragging) {
      if (Math.abs(dy) > 10) {
        start.current = null;
        return;
      }
      if (Math.abs(dx) < 10) return;
      setDragging(true);
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: props.task.id }));
    }
    const max = width('right');
    const min = -width('left');
    setOffset(Math.max(min - 24, Math.min(max + 24, s.base + dx)));
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    if (!dragging) return;
    setDragging(false);
    if (offset < -width('left') / 2) {
      setOpen('left');
      setOffset(-width('left'));
    } else if (offset > width('right') / 2) {
      setOpen('right');
      setOffset(width('right'));
    } else {
      setOpen(null);
      setOffset(0);
    }
  };
  const close = () => {
    setOpen(null);
    setOffset(0);
  };

  const reveal: SwipeReveal | null = offset < 0 ? 'left' : offset > 0 ? 'right' : null;
  return (
    <div
      ref={ref}
      className="relative touch-pan-y overflow-hidden bg-card"
      data-slot="swipe-row"
      data-open={open ?? undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (open && !(e.target as HTMLElement).closest('[data-slot="swipe-tray"]')) {
          e.stopPropagation();
          e.preventDefault();
          close();
        }
      }}
    >
      <div className={cn(reveal !== 'left' && 'invisible')}>
        <Tray task={props.task} rowActions={rowActions} due={due} reveal="left" onDone={close} />
      </div>
      <div className={cn(reveal !== 'right' && 'invisible')}>
        <Tray task={props.task} rowActions={rowActions} due={due} reveal="right" onDone={close} />
      </div>
      <TaskRowContent
        {...props}
        rowActions={rowActions}
        className={cn(offset !== 0 && 'shadow-[0_0_0_0.5px_var(--border)]', !dragging && 'transition-transform duration-200')}
        style={{ ...props.style, transform: offset ? `translateX(${offset}px)` : undefined }}
      />
    </div>
  );
}
