import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon';
import type { ActionGroup } from './row-actions';

/** A grid of quick picks, like TickTick's date popover. Used in popovers and the swipe sheets. */
export function PresetPanel({ group, className, hideTitle }: { group: ActionGroup; className?: string; hideTitle?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} data-slot="preset-panel">
      {!hideTitle && (
        <div className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-muted-foreground">
          <Icon name={group.icon} className="size-icon" />
          <span className="optical-center">{group.title}</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {group.presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.caption}
            data-default={preset.default || undefined}
            autoFocus={preset.default}
            className={cn(
              'flex min-h-control flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-2 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              preset.default ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted hover:bg-accent dark:bg-accent dark:hover:bg-input',
            )}
          >
            <Icon name={preset.icon} className="size-icon" />
            <span className="text-footnote font-medium leading-tight">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
