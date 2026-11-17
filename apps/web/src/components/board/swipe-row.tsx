import type { IconMeaning } from '@app/tokens';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';
import { rowActionsFor } from './row-actions';
import { TaskRowContent, type TaskRowProps } from './task-row';

export type SwipeReveal = 'left' | 'right';

const GAP = 'var(--space-unit) * 1.5';
const PAD = 'var(--space-unit) * 2';

function SwipeButton({ icon, label, className, active }: { icon: IconMeaning; label: string; className: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex size-swipe-button items-center justify-center rounded-lg text-swipe-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <Icon name={icon} active={active} weight={active ? 'fill' : 'bold'} className="size-icon" />
    </button>
  );
}

/** A row held open mid-swipe. Swipe left shows date, state (two for a follow-up: Extend wait and Move to In Progress) and Delete; swipe right toggles the flag. */
export function SwipeRow({ reveal, ...props }: TaskRowProps & { reveal: SwipeReveal }) {
  const actions = rowActionsFor(props.task, props.today, props.context);
  const buttons = reveal === 'right' ? 1 : (actions.date ? 1 : 0) + actions.state.length + 1;
  const tray = `calc(${buttons} * var(--size-swipe-button) + ${buttons - 1} * ${GAP} + 2 * ${PAD})`;

  return (
    <div className="relative overflow-hidden bg-card" data-slot="swipe-row" data-reveal={reveal}>
      <div
        className={cn('absolute inset-y-0 flex items-center gap-1.5 px-2', reveal === 'left' ? 'right-0' : 'left-0')}
        style={{ width: tray }}
      >
        {reveal === 'left' ? (
          <>
            {actions.date && <SwipeButton icon={actions.date.icon} label={actions.date.title} className="bg-swipe-date" />}
            {actions.state.map((g) => (
              <SwipeButton key={g.title} icon={g.icon} label={g.title} className="bg-swipe-state" />
            ))}
            <SwipeButton icon="trash" label={actions.delete} className="bg-swipe-delete" />
          </>
        ) : (
          <SwipeButton icon="flag" active={!props.task.flagged} label={props.task.flagged ? 'Unflag' : 'Flag'} className="bg-swipe-flag" />
        )}
      </div>
      <TaskRowContent
        {...props}
        className="shadow-[0_0_0_0.5px_var(--border)]"
        style={{ transform: `translateX(calc(${reveal === 'left' ? -1 : 1} * ${tray}))` }}
      />
    </div>
  );
}
