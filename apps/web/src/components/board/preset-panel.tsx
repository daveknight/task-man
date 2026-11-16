import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon';
import type { ActionGroup } from './row-actions';

/** A grid of quick picks, like TickTick's date popover. Used in popovers and the swipe sheets. */
export function PresetPanel({ group, className }: { group: ActionGroup; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} data-slot="preset-panel">
      <div className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-muted-foreground">
        <Icon name={group.icon} className="size-icon" />
        {group.title}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {group.presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="flex min-h-control flex-col items-center justify-center gap-0.5 rounded-md bg-muted px-1.5 py-2 text-center outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Icon name={preset.icon} className="size-icon text-foreground" />
            <span className="text-footnote font-medium leading-tight">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
