import type { IconMeaning } from '@app/tokens';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';
import { rowActionsFor } from './row-actions';
import { TaskRowContent, type TaskRowProps } from './task-row';

export type SwipeReveal = 'left' | 'right' | 'complete';

function SwipeButton({ icon, label, className, active }: { icon: IconMeaning; label: string; className: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={cn('flex w-swipe-button flex-col items-center justify-center gap-1 text-swipe-foreground outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/70', className)}
    >
      <Icon name={icon} active={active} className="size-5" />
      <span className="text-caption font-medium">{label}</span>
    </button>
  );
}

/**
 * A row held open mid-swipe. Swipe left shows date, state and Delete; a short swipe right shows Flag;
 * a full swipe right completes.
 */
export function SwipeRow({ reveal, ...props }: TaskRowProps & { reveal: SwipeReveal }) {
  const actions = rowActionsFor(props.task, props.today, props.context);
  const state = actions.state[0]!;
  const leftButtons = (actions.date ? 3 : 2) as 2 | 3;
  const offset = {
    left: leftButtons === 3 ? '-translate-x-[calc(3*var(--size-swipe-button))]' : '-translate-x-[calc(2*var(--size-swipe-button))]',
    right: 'translate-x-(--size-swipe-button)',
    complete: 'translate-x-[72%]',
  }[reveal];

  return (
    <div className="relative overflow-hidden bg-card" data-slot="swipe-row" data-reveal={reveal}>
      <div className="absolute inset-0 flex">
        {reveal === 'left' && (
          <div className="ml-auto flex">
            {actions.date && <SwipeButton icon={actions.date.icon} label={actions.date.title} className="bg-swipe-date" />}
            <SwipeButton icon={state.icon} label={state.title} className="bg-swipe-state" />
            <SwipeButton icon="trash" label={actions.delete} className="bg-swipe-delete" />
          </div>
        )}
        {reveal === 'right' && (
          <SwipeButton icon="flag" active={!props.task.flagged} label={props.task.flagged ? 'Unflag' : 'Flag'} className="bg-swipe-flag" />
        )}
        {reveal === 'complete' && (
          <div className="flex flex-1 items-center gap-2 bg-swipe-complete px-row-x text-swipe-foreground">
            <Icon name="complete" weight="bold" className="size-5" />
            <span className="text-subhead font-semibold">Complete</span>
          </div>
        )}
      </div>
      <TaskRowContent {...props} className={cn('shadow-[0_0_0_0.5px_var(--border)]', offset)} />
    </div>
  );
}
