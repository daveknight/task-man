import { waitingStateFor, type ISODate, type Status, type Task } from '@app/core';
import type { IconMeaning } from '@app/tokens';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { longDate } from '@/lib/day-label';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { RowList } from './board-view';

const STATUS: Record<Status, { label: string; icon: IconMeaning }> = {
  open: { label: 'Open', icon: 'complete' },
  in_progress: { label: 'In Progress', icon: 'inProgress' },
  waiting: { label: 'Waiting', icon: 'waiting' },
};

function toDate(day: ISODate): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

function FieldRow({ icon, label, children, tone }: { icon: IconMeaning; label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex min-h-row items-center gap-row-gap px-row-x">
      <Icon name={icon} className="size-icon shrink-0 text-muted-foreground" />
      <span className="optical-center flex-1 text-body">{label}</span>
      <span className={cn('optical-center text-body text-muted-foreground', tone)}>{children}</span>
    </div>
  );
}

function DateField({ icon, label, date, today, tone }: { icon: IconMeaning; label: string; date?: ISODate | null; today: ISODate; tone?: string }) {
  return (
    <Popover>
      <PopoverTrigger className="w-full text-left outline-none hover:bg-muted focus-visible:bg-muted">
        <FieldRow icon={icon} label={label} tone={date ? tone : undefined}>
          {date ? longDate(date, today) : 'None'}
        </FieldRow>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar mode="single" selected={date ? toDate(date) : undefined} defaultMonth={toDate(date ?? today)} />
      </PopoverContent>
    </Popover>
  );
}

function StatusMenu({ status }: { status: Status }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>
        <Icon name={STATUS[status].icon} data-icon="inline-start" />
        {STATUS[status].label}
        <Icon name="collapse" data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuRadioGroup value={status}>
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              <Icon name={STATUS[s].icon} />
              {STATUS[s].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Everything in the sheet: header actions, title, dates, Waiting fields and the description. */
export function TaskEditor({ task, today, onClose }: { task: Task; today: ISODate; onClose?: () => void }) {
  const waiting = task.status === 'waiting' ? waitingStateFor(task, today) : null;
  const overdue = !!task.dueDate && task.dueDate < today;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-slot="task-editor">
      <div className="flex items-center gap-2">
        <Checkbox aria-label="Complete" />
        <StatusMenu status={task.status} />
        <span className="flex-1" />
        <Toggle aria-label="Flag" defaultPressed={!!task.flagged} className="text-muted-foreground data-pressed:bg-transparent data-pressed:text-flag">
          <Icon name="flag" active={!!task.flagged} className="size-5" />
        </Toggle>
        <Button variant="ghost" size="icon" aria-label="More">
          <Icon name="more" weight="bold" className="size-5" />
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" className="size-5" />
          </Button>
        )}
      </div>

      <Textarea
        defaultValue={task.title}
        aria-label="Title"
        rows={1}
        className="min-h-0 resize-none rounded-none border-0 bg-transparent! px-0 py-0 text-title font-semibold shadow-none focus-visible:ring-0 md:text-title"
      />

      {waiting === 'needs_follow_up' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <Icon name="waiting" data-icon="inline-start" />
            Extend wait
          </Button>
          <Button variant="outline" size="sm">
            <Icon name="inProgress" data-icon="inline-start" />
            Resume
          </Button>
        </div>
      )}

      <RowList className="ring-1 ring-border/60">
        {task.status === 'waiting' ? (
          <DateField icon="waiting" label="Check back" date={task.startDate} today={today} />
        ) : (
          <DateField icon="startDate" label="Start" date={task.startDate} today={today} />
        )}
        <DateField icon="dueDate" label="Due" date={task.dueDate} today={today} tone={overdue ? 'text-overdue' : undefined} />
      </RowList>

      <Textarea
        defaultValue={task.description ?? ''}
        placeholder="Description"
        aria-label="Description"
        className="min-h-40 flex-1 resize-none rounded-xl border-0 bg-card text-body shadow-none ring-1 ring-border/60 md:text-body dark:bg-card"
      />
    </div>
  );
}

/** A side sheet on wide screens and a bottom sheet (drawer) on narrow ones. */
export function TaskSheet({ task, today, open, onOpenChange }: { task: Task | null; today: ISODate; open: boolean; onOpenChange: (open: boolean) => void }) {
  const wide = useMediaQuery('(min-width: 768px)');
  if (!task) return null;
  if (wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-background sm:max-w-md">
          <SheetTitle className="sr-only">{task.title}</SheetTitle>
          <TaskEditor task={task} today={today} onClose={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="bg-background">
        <DrawerTitle className="sr-only">{task.title}</DrawerTitle>
        <TaskEditor task={task} today={today} />
      </DrawerContent>
    </Drawer>
  );
}
