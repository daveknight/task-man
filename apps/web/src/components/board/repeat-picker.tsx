import {
  addMonths,
  matchingPreset,
  nthOfDate,
  ordinal,
  repeatDetail,
  repeatHint,
  repeatLabel,
  repeatPresets,
  seedRepeatDate,
  validateRepeat,
  weekdayOf,
  type ISODate,
  type MonthlyRule,
  type RepeatFreq,
  type RepeatMode,
  type RepeatRule,
  type Task,
  type Weekday,
} from '@app/core';
import { CaretLeftIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { shortDate } from '@/lib/day-label';
import { useOnline } from '@/lib/online';
import { fromDate, toDate } from '@/lib/today';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useBoardActions } from './board-actions';
import { DatePicker } from './preset-panel';
import { WIDE_QUERY } from './surface';

/** A portaled menu sits outside the popover and the phone sheet, so their outside-press must not close them. */
function keepMenuOpen(next: boolean, details: { reason: string; event: Event; cancel: () => void }): boolean {
  if (next || (details.reason !== 'outside-press' && details.reason !== 'focus-out')) return false;
  const related = 'relatedTarget' in details.event ? (details.event as FocusEvent).relatedTarget : null;
  const inside = [details.event.target, related].some((node) => {
    const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    return !!el?.closest('[data-slot=dropdown-menu-content]');
  });
  if (inside) details.cancel();
  return inside;
}

const WEEK_ORDER: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHOWN: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LETTER: Record<Weekday, string> = { sun: 'S', mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S' };
const FULL: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};
const FREQS: readonly RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const TYPES: readonly { id: RepeatMode; label: string }[] = [
  { id: 'schedule', label: 'By due date' },
  { id: 'after_completion', label: 'After completion' },
  { id: 'dates', label: 'On specific dates' },
];
const UNIT: Record<RepeatFreq, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

function sortDays(days: readonly Weekday[]): Weekday[] {
  return [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

function unitWord(freq: RepeatFreq, interval: number): string {
  const [one, many] = UNIT[freq];
  return interval === 1 ? one : many;
}

function dayNumber(date: ISODate): number {
  return Number(date.slice(8, 10));
}

function draftFrom(rule: RepeatRule | null, anchor: ISODate): RepeatRule {
  if (!rule) return { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: [weekdayOf(anchor)] };
  const next: RepeatRule = {
    ...rule,
    ...(rule.byWeekday ? { byWeekday: [...rule.byWeekday] } : {}),
    ...(rule.dates ? { dates: [...rule.dates] } : {}),
    ...(rule.monthly ? { monthly: { ...rule.monthly } } : {}),
    ...(rule.ends ? { ends: { ...rule.ends } } : {}),
  };
  // A weekly or monthly rule can leave its day unnamed; the engine then uses the due date.
  // The editor shows that day so Done doesn't look like it cleared the choice.
  if (next.mode === 'schedule' && next.freq === 'weekly' && !next.byWeekday?.length) next.byWeekday = [weekdayOf(anchor)];
  if (next.mode === 'schedule' && next.freq === 'monthly' && !next.monthly) next.monthly = { day: dayNumber(anchor) };
  return next;
}

function withFreq(rule: RepeatRule, freq: RepeatFreq, anchor: ISODate): RepeatRule {
  const mode = rule.mode === 'dates' ? 'schedule' : rule.mode;
  const next: RepeatRule = { mode, freq, interval: rule.interval ?? 1 };
  if (rule.ends) next.ends = rule.ends;
  if (rule.startOffsetDays != null) next.startOffsetDays = rule.startOffsetDays;
  if (mode === 'schedule' && freq === 'weekly') next.byWeekday = rule.byWeekday?.length ? sortDays(rule.byWeekday) : [weekdayOf(anchor)];
  if (mode === 'schedule' && freq === 'monthly') next.monthly = rule.monthly ?? { day: dayNumber(anchor) };
  return next;
}

function withMode(rule: RepeatRule, mode: RepeatMode, anchor: ISODate): RepeatRule {
  if (mode === 'dates') {
    const next: RepeatRule = { mode: 'dates', dates: rule.dates?.length ? [...rule.dates] : [seedRepeatDate(anchor)] };
    if (rule.startOffsetDays != null) next.startOffsetDays = rule.startOffsetDays;
    return next;
  }
  return withFreq({ ...rule, mode, freq: rule.freq ?? 'weekly' }, rule.freq ?? 'weekly', anchor);
}

function setEnds(rule: RepeatRule, ends: RepeatRule['ends'] | null): RepeatRule {
  const { ends: _ends, ...rest } = rule;
  return ends ? { ...rest, ends } : rest;
}

function setOffset(rule: RepeatRule, days: number | null): RepeatRule {
  const { startOffsetDays: _offset, ...rest } = rule;
  return days == null ? rest : { ...rest, startOffsetDays: days };
}

function endsKind(rule: RepeatRule): 'never' | 'onDate' | 'afterCount' {
  if (!rule.ends || 'never' in rule.ends) return 'never';
  return 'onDate' in rule.ends ? 'onDate' : 'afterCount';
}

function sameMonthly(a: MonthlyRule | undefined, b: MonthlyRule): boolean {
  if (!a) return false;
  if ('day' in b) return 'day' in a && a.day === b.day;
  return 'nth' in a && a.nth === b.nth && a.weekday === b.weekday;
}

function monthlyOptions(anchor: ISODate): { key: string; label: string; monthly: MonthlyRule }[] {
  const day = dayNumber(anchor);
  const weekday = weekdayOf(anchor);
  const nth = nthOfDate(anchor);
  return [
    { key: 'day', label: `On day ${day}`, monthly: { day } },
    { key: 'nth', label: `On the ${nth === -1 ? 'last' : ordinal(nth)} ${FULL[weekday]}`, monthly: { nth, weekday } },
    { key: 'last', label: 'On the last day', monthly: { day: -1 } },
  ];
}

function Stepper({ value, min = 1, label, onChange }: { value: number; min?: number; label: string; onChange: (value: number) => void }) {
  return (
    <span className="inline-flex h-7 items-center rounded-lg bg-muted" data-slot={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} className="flex size-7 items-center justify-center text-foreground disabled:opacity-40" onClick={() => onChange(value - 1)}>
        <MinusIcon className="size-3.5" />
      </button>
      <span className="w-6 text-center text-body font-medium tabular-nums">{value}</span>
      <button type="button" aria-label={`Increase ${label}`} className="flex size-7 items-center justify-center text-foreground" onClick={() => onChange(value + 1)}>
        <PlusIcon className="size-3.5" />
      </button>
    </span>
  );
}

function MiniMenu({ label, value, onChange, options, labelledBy }: { label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; labelledBy: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={labelledBy} className="inline-flex h-7 items-center gap-1 rounded-lg bg-muted pr-2 pl-2.5 text-body outline-none hover:bg-muted/80">
        <span className="optical-center whitespace-nowrap">{label}</span>
        <Icon name="collapse" className="size-2.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => next && onChange(next)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className={cn('relative h-5 w-[34px] shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-muted-foreground/30')}>
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow-sm', on ? 'left-4' : 'left-0.5')} />
    </button>
  );
}

function Note({ children, sheet }: { children: string; sheet?: boolean }) {
  return (
    <p data-slot="repeat-note" className={cn('text-footnote text-muted-foreground', sheet ? 'px-4 pt-3' : 'px-1.5')}>
      {children}
    </p>
  );
}

function RepeatEditor({
  task,
  today,
  screen,
  sheet,
  onScreen,
  onClose,
}: {
  task: Task;
  today: ISODate;
  screen: 'presets' | 'custom';
  sheet?: boolean;
  onScreen: (screen: 'presets' | 'custom') => void;
  onClose: () => void;
}) {
  const actions = useBoardActions();
  const anchor = task.dueDate ?? today;
  const [draft, setDraft] = useState<RepeatRule>(() => draftFrom(task.repeat ?? null, anchor));
  const presets = repeatPresets(anchor);
  const current = task.repeat ? matchingPreset(task.repeat, anchor) : null;
  const hint = task.repeat ? repeatHint(task.repeat, anchor, today) : null;

  const apply = (rule: RepeatRule | null) => actions?.setRepeat(task, rule);
  const openCustom = () => {
    setDraft(draftFrom(task.repeat ?? null, anchor));
    onScreen('custom');
  };

  const rowClass = sheet
    ? 'flex h-[46px] w-full items-center gap-2 px-4 text-left text-body'
    : 'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body hover:bg-muted';

  if (screen === 'presets') {
    const divider = sheet ? <Separator className="ml-4 w-auto" /> : <div className="px-1 py-1"><Separator /></div>;
    const rows = (
      <>
        {presets.map((preset, index) => (
          <div key={preset.id}>
            {index > 0 && sheet && divider}
            <button type="button" className={rowClass} data-preset={preset.id} aria-pressed={current === preset.id} onClick={() => apply(preset.rule)}>
              <span className="optical-center min-w-0 flex-1 truncate">{preset.label}</span>
              {current === preset.id && <Icon name="complete" className="size-4 shrink-0 text-primary" />}
            </button>
          </div>
        ))}
        {divider}
        <button type="button" className={rowClass} data-preset="custom" onClick={openCustom}>
          <span className="optical-center flex-1">Custom…</span>
          <Icon name="expand" className="size-4 text-muted-foreground" />
        </button>
        {divider}
        <button type="button" className={rowClass} data-preset="none" aria-pressed={!task.repeat} onClick={() => apply(null)}>
          <span className="optical-center flex-1">No repeat</span>
        </button>
      </>
    );
    return (
      <div data-slot="repeat-picker">
        {sheet && (
          <div className="relative flex min-h-12 items-center justify-center px-4">
            <DrawerTitle className="text-body font-semibold">Repeat</DrawerTitle>
            <Button variant="ghost" size="icon" aria-label="Close" className="absolute right-2" onClick={onClose}>
              <Icon name="close" className="size-5" />
            </Button>
          </div>
        )}
        <div className={cn(sheet ? 'px-4 pb-6' : 'px-1 pt-1 pb-3')}>
          {sheet ? <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60">{rows}</div> : rows}
          {hint && <Note sheet={sheet}>{hint}</Note>}
        </div>
      </div>
    );
  }

  const freq = draft.freq ?? 'weekly';
  const interval = draft.interval ?? 1;
  const kind = endsKind(draft);
  const endDate = draft.ends && 'onDate' in draft.ends ? draft.ends.onDate : null;
  const endCount = draft.ends && 'afterCount' in draft.ends ? draft.ends.afterCount : 1;
  const early = draft.startOffsetDays != null;
  const dates = draft.dates ?? [];
  const invalid = validateRepeat(draft).length > 0;
  const note = invalid ? (draft.mode === 'dates' ? 'Add at least one date.' : '') : repeatDetail(draft, anchor, today);
  const setting = sheet ? 'min-h-[46px] px-4' : 'h-[38px] px-3';

  const save = () => {
    if (invalid) return;
    apply({
      ...draft,
      ...(draft.byWeekday ? { byWeekday: sortDays(draft.byWeekday) } : {}),
      ...(draft.dates ? { dates: [...draft.dates].sort() } : {}),
    });
    onClose();
  };

  return (
    <div data-slot="repeat-custom" className={cn('flex flex-col gap-3', sheet ? 'px-4 pb-6' : 'max-h-[70vh] overflow-y-auto p-3')}>
      <div className={cn('grid grid-cols-3 items-center', sheet && 'min-h-12')}>
        <button type="button" className="flex items-center gap-0.5 justify-self-start text-body text-primary" onClick={() => onScreen('presets')}>
          <CaretLeftIcon className="size-4" />
          <span className="optical-center">Repeat</span>
        </button>
        {sheet ? <DrawerTitle className="text-center text-body font-semibold">Custom</DrawerTitle> : <span className="text-center text-body font-semibold">Custom</span>}
        <button type="button" className="justify-self-end text-body font-semibold text-primary disabled:opacity-40" disabled={invalid} onClick={save}>
          Done
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
        <div className={cn('flex items-center gap-2.5', setting)}>
          <span className="optical-center flex-1 text-body">Repeat type</span>
          <MiniMenu
            labelledBy="Repeat type"
            label={TYPES.find((type) => type.id === draft.mode)?.label ?? 'By due date'}
            value={draft.mode}
            onChange={(value) => setDraft(withMode(draft, value as RepeatMode, anchor))}
            options={TYPES.map((type) => ({ value: type.id, label: type.label }))}
          />
        </div>
        {draft.mode !== 'dates' && (
          <>
            <Separator className="ml-3 w-auto" />
            <div className={cn('flex items-center gap-2.5', setting)}>
              <span className="optical-center flex-1 text-body">Every</span>
              <span className="flex items-center gap-1.5">
                <Stepper label="interval" value={interval} onChange={(value) => setDraft({ ...draft, interval: value })} />
                <MiniMenu
                  labelledBy="Frequency"
                  label={unitWord(freq, interval)}
                  value={freq}
                  onChange={(value) => setDraft(withFreq(draft, value as RepeatFreq, anchor))}
                  options={FREQS.map((item) => ({ value: item, label: unitWord(item, interval) }))}
                />
              </span>
            </div>
          </>
        )}
        {draft.mode === 'schedule' && freq === 'weekly' && (
          <>
            <Separator className="ml-3 w-auto" />
            <div className={cn('flex items-center justify-between', sheet ? 'px-4 py-2.5' : 'px-3 py-2')}>
              {SHOWN.map((day) => {
                const on = draft.byWeekday?.includes(day) ?? false;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={FULL[day]}
                    aria-pressed={on}
                    data-weekday={day}
                    onClick={() => {
                      const days = draft.byWeekday ?? [];
                      if (on && days.length === 1) return;
                      setDraft({ ...draft, byWeekday: sortDays(on ? days.filter((item) => item !== day) : [...days, day]) });
                    }}
                    className={cn('flex items-center justify-center rounded-full text-[13px] font-medium', sheet ? 'size-[38px]' : 'size-[30px]', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}
                  >
                    {LETTER[day]}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {draft.mode === 'schedule' && freq === 'monthly' &&
          monthlyOptions(anchor).map((option, index) => {
            const on = sameMonthly(draft.monthly, option.monthly);
            return (
              <div key={option.key}>
                {index === 0 && <Separator className="ml-3 w-auto" />}
                {index > 0 && <Separator className="ml-3 w-auto" />}
                <button type="button" className={cn('flex w-full items-center gap-2 text-left text-body', setting)} data-monthly={option.key} aria-pressed={on} onClick={() => setDraft({ ...draft, monthly: option.monthly })}>
                  <span className="optical-center flex-1">{option.label}</span>
                  {on && <Icon name="complete" className="size-4 text-primary" />}
                </button>
              </div>
            );
          })}
        {draft.mode === 'dates' && (
          <>
            <Separator className="ml-3 w-auto" />
            <Calendar
              mode="multiple"
              selected={dates.map(toDate)}
              defaultMonth={toDate(dates[0] ?? anchor)}
              onSelect={(picked) => setDraft({ ...draft, dates: [...new Set((picked ?? []).map(fromDate))].sort() })}
              className="mx-auto p-1"
            />
            <div className="flex flex-wrap gap-1.5 px-3 pb-2" data-slot="repeat-dates">
              {dates.map((date) => (
                <button key={date} type="button" className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-footnote" onClick={() => setDraft({ ...draft, dates: dates.filter((item) => item !== date) })}>
                  {shortDate(date, today)}
                  <Icon name="close" className="size-2.5" />
                  <span className="sr-only">Remove {shortDate(date, today)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
        {draft.mode !== 'dates' && (
          <>
            <div className={cn('flex items-center gap-2.5', setting)}>
              <span className="optical-center flex-1 text-body">Ends</span>
              <span className="flex items-center gap-1.5">
                {kind === 'afterCount' && <Stepper label="times" min={1} value={endCount} onChange={(value) => setDraft(setEnds(draft, { afterCount: value }))} />}
                <MiniMenu
                  labelledBy="Ends"
                  label={kind === 'never' ? 'Never' : kind === 'onDate' && endDate ? `On ${shortDate(endDate, today)}` : kind === 'afterCount' ? 'times' : 'On a date'}
                  value={kind}
                  onChange={(value) => {
                    if (value === 'never') setDraft(setEnds(draft, null));
                    else if (value === 'onDate') setDraft(setEnds(draft, { onDate: endDate ?? addMonths(anchor, 1) }));
                    else setDraft(setEnds(draft, { afterCount: endCount }));
                  }}
                  options={[
                    { value: 'never', label: 'Never' },
                    { value: 'onDate', label: 'On a date' },
                    { value: 'afterCount', label: 'After a count' },
                  ]}
                />
              </span>
            </div>
            {kind === 'onDate' && endDate && (
              <DatePicker
                selected={endDate}
                onPick={(date) => setDraft(setEnds(draft, { onDate: date }))}
              />
            )}
            <Separator className="ml-3 w-auto" />
          </>
        )}
        <div className={cn('flex items-center gap-2.5', setting)}>
          <span className="optical-center flex-1 text-body">Start early</span>
          <Switch label="Start early" on={early} onToggle={() => setDraft(setOffset(draft, early ? null : Math.max(draft.startOffsetDays ?? 1, 1)))} />
        </div>
        {early && (
          <>
            <Separator className="ml-3 w-auto" />
            <div className={cn('flex items-center gap-2.5', setting)}>
              <span className="optical-center flex-1 text-body">Days before due</span>
              <Stepper label="days before due" min={0} value={draft.startOffsetDays ?? 0} onChange={(value) => setDraft(setOffset(draft, value))} />
            </div>
          </>
        )}
      </div>
      {note && <Note>{note}</Note>}
    </div>
  );
}

/**
 * The Repeat row in the task sheet. Presets apply at once; Custom waits for Done.
 * A popover on wide screens and a bottom sheet on phones. Trash, completed and offline stay read-only.
 */
export function RepeatField({ task, today }: { task: Task; today: ISODate }) {
  const actions = useBoardActions();
  const online = useOnline();
  const wide = useMediaQuery(WIDE_QUERY);
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<'presets' | 'custom'>('presets');
  const locked = !!task.deletedAt || !!task.completedAt || !online || !actions;
  const value = task.repeat ? repeatLabel(task.repeat, task.dueDate) : 'None';

  const row = (
    <div className="flex min-h-row items-center gap-row-gap px-row-x">
      <Icon name="repeat" className="size-icon shrink-0 text-muted-foreground" />
      <span className="optical-center shrink-0 text-body">Repeat</span>
      <span className="optical-center min-w-0 flex-1 truncate text-right text-body text-muted-foreground" data-slot="repeat-value">
        {value}
      </span>
    </div>
  );

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setScreen('presets');
  };

  if (locked) return <div data-field="Repeat">{row}</div>;

  const editor = <RepeatEditor task={task} today={today} screen={screen} sheet={!wide} onScreen={setScreen} onClose={() => close(false)} />;
  const trigger = 'w-full text-left outline-none hover:bg-muted focus-visible:bg-muted';

  if (wide) {
    return (
      <Popover open={open} onOpenChange={(next, details) => { if (!keepMenuOpen(next, details)) close(next); }}>
        <PopoverTrigger className={trigger} data-field="Repeat">
          {row}
        </PopoverTrigger>
        <PopoverContent align="end" className={cn('gap-0 p-0', screen === 'custom' ? 'w-[340px]' : 'w-[300px]')}>
          {editor}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <button type="button" className={trigger} data-field="Repeat" onClick={() => setOpen(true)}>
        {row}
      </button>
      <Drawer open={open} onOpenChange={(next, details) => { if (!keepMenuOpen(next, details)) close(next); }} showSwipeHandle>
        <DrawerContent className="bg-background" data-slot="repeat-sheet">
          {editor}
        </DrawerContent>
      </Drawer>
    </>
  );
}
