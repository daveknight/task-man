import type { ActionIcon, ISODate, Preset, PresetEffect } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { fromDate, toDate } from '@/lib/today';
import { cn } from '@/lib/utils';

export interface PresetGroup {
  title: string;
  icon: ActionIcon | IconMeaning;
  presets: Preset[];
}

export type PickEffect = Extract<PresetEffect, { kind: 'pick' }>;

/** A calendar limited to the effect's min and max. */
export function DatePicker({ effect, selected, onPick }: { effect?: Partial<PickEffect>; selected?: ISODate | null; onPick: (date: ISODate) => void }) {
  const disabled = [
    ...(effect?.min ? [{ before: toDate(effect.min) }] : []),
    ...(effect?.max ? [{ after: toDate(effect.max) }] : []),
  ];
  return (
    <Calendar
      mode="single"
      selected={selected ? toDate(selected) : undefined}
      defaultMonth={toDate(selected ?? effect?.min ?? effect?.max ?? fromDate(new Date()))}
      disabled={disabled}
      onSelect={(date) => date && onPick(fromDate(date))}
      className="mx-auto"
    />
  );
}

/**
 * A grid of quick picks, like TickTick's date popover. "Pick date" swaps the grid for a calendar.
 * Used in popovers, the swipe sheets and the Wait until pane. `defaultId` highlights one tile.
 */
export function PresetPanel({
  group,
  defaultId,
  selected,
  initialPick,
  onPreset,
  onPickDate,
  className,
}: {
  group: PresetGroup;
  defaultId?: string;
  selected?: ISODate | null;
  /** Opens straight onto the calendar for this pick preset. */
  initialPick?: Preset;
  /** A preset with a set or skip effect was tapped. */
  onPreset?: (preset: Preset) => void;
  /** A date was picked from the calendar for a pick preset. */
  onPickDate?: (preset: Preset, date: ISODate) => void;
  className?: string;
}) {
  const [picking, setPicking] = useState<Preset | null>(initialPick ?? null);
  return (
    <div className={cn('flex flex-col gap-2', className)} data-slot="preset-panel">
      <div className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-muted-foreground">
        <Icon name={group.icon} className="size-icon" />
        <span className="optical-center flex-1">{picking ? picking.label : group.title}</span>
        {picking && (
          <Button variant="ghost" size="xs" onClick={() => setPicking(null)}>
            Back
          </Button>
        )}
      </div>
      {picking && picking.effect.kind === 'pick' ? (
        <DatePicker effect={picking.effect} selected={selected} onPick={(date) => onPickDate?.(picking, date)} />
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {group.presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-preset={preset.id}
              data-default={preset.id === defaultId || undefined}
              onClick={() => (preset.effect.kind === 'pick' ? setPicking(preset) : onPreset?.(preset))}
              className={cn(
                'flex min-h-control flex-col items-center justify-center gap-0.5 rounded-md bg-muted px-1.5 py-2 text-center outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                preset.id === defaultId && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <Icon name={preset.icon} className={cn('size-icon', preset.id === defaultId ? 'text-primary-foreground' : 'text-foreground')} />
              <span className="text-footnote font-medium leading-tight">{preset.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
