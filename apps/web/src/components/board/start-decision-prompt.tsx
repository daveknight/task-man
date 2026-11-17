import type { ISODate, StartDecision, Status, Task } from '@app/core';
import type { ReactNode } from 'react';
import type { IconMeaning } from '@app/tokens';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { longDate } from '@/lib/day-label';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { PresetPanel } from './preset-panel';
import { enterWaitingGroup } from './row-actions';

const STATUS_LABELS: Record<Status, string> = { open: 'Ready', in_progress: 'In Progress', waiting: 'Waiting' };

type Answer = StartDecision['options'][number];

interface Option {
  answer: Answer;
  icon: IconMeaning;
  label: string;
  detail: string;
}

function copyFor(task: Task, to: Status, decision: StartDecision, today: ISODate) {
  const start = longDate(decision.startDate, today);
  const target = STATUS_LABELS[to];
  const options: Record<Answer, Option> = {
    clear: { answer: 'clear', icon: 'clear', label: 'Clear the check-back date', detail: `Moves to ${target} now` },
    keep: { answer: 'keep', icon: 'startDate', label: `Start ${start}`, detail: 'Waits in Upcoming until then' },
    set: { answer: 'set', icon: 'pickDate', label: 'Pick a start date…', detail: decision.dueDate ? `On or before the due date, ${longDate(decision.dueDate, today)}` : 'Today or later' },
  };
  const description =
    decision.reason === 'leaving_waiting_start_after_due'
      ? `It's set to check back ${start}, after its due date (${longDate(decision.dueDate!, today)}). Outside Waiting, the start date can't be after the due date.`
      : `It's set to check back ${start}. Outside Waiting, that would be its start date.`;
  const ordered = [decision.default, ...decision.options.filter((o) => o !== decision.default)].map((a) => options[a]);
  const title = `Move “${task.title}” to ${target}?`;
  return { title, description, options: ordered };
}

function OptionList({ options, onChoose, onCancel, touch }: { options: Option[]; onChoose?: (a: Answer) => void; onCancel: () => void; touch?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-slot="start-decision-options">
      {options.map((o, i) => (
        <Button
          key={o.answer}
          variant={i === 0 ? 'default' : 'outline'}
          className={cn('h-auto justify-start gap-3 px-3 py-2 text-left whitespace-normal', touch && 'min-h-control py-3')}
          data-default={i === 0 || undefined}
          onClick={() => onChoose?.(o.answer)}
        >
          <Icon name={o.icon} className="size-icon shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-medium">{o.label}</span>
            <span className={cn('text-footnote', i === 0 ? 'text-primary-foreground' : 'text-muted-foreground')}>{o.detail}</span>
          </span>
        </Button>
      ))}
      <Button variant="ghost" className={cn(touch && 'min-h-control')} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

interface PromptShellProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: string;
  children: (touch: boolean) => ReactNode;
}

/** A dialog on desktop and a bottom sheet on phones. */
function PromptShell({ title, description, open, onOpenChange, slot, children }: PromptShellProps) {
  const wide = useMediaQuery('(min-width: 768px)');
  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="gap-4 sm:max-w-sm" data-slot={slot}>
          <DialogHeader>
            <DialogTitle className="text-headline font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-body">{description}</DialogDescription>
          </DialogHeader>
          {children(false)}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="bg-background" data-slot={slot}>
        <DrawerHeader className="gap-1 pb-3 text-left group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="text-headline font-semibold">{title}</DrawerTitle>
          <DrawerDescription className="text-body">{description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children(true)}</div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Asks what happens to the start date when a task leaves Waiting with a check-back date that would
 * become a future start, or one after the due date (core `changeStatus` returned a decision). The
 * policy's default answer comes first and is highlighted.
 */
export function StartDecisionPrompt({
  task,
  to,
  decision,
  today,
  open,
  onOpenChange,
  onChoose,
}: {
  task: Task;
  to: Status;
  decision: StartDecision;
  today: ISODate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose?: (answer: Answer) => void;
}) {
  const { title, description, options } = copyFor(task, to, decision, today);
  return (
    <PromptShell title={title} description={description} open={open} onOpenChange={onOpenChange} slot="start-decision-prompt">
      {(touch) => <OptionList options={options} onChoose={onChoose} onCancel={() => onOpenChange(false)} touch={touch} />}
    </PromptShell>
  );
}

/**
 * Asked whenever a task goes into Waiting without a date already picked (status menu, drag): when to
 * check back. No date is highlighted; a future start date can be kept as the check-back date.
 */
export function EnterWaitingPrompt({ task, today, open, onOpenChange }: { task: Task; today: ISODate; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <PromptShell
      title={`Move “${task.title}” to Waiting`}
      description="Check back on a date? With no date, it stays in view as needing follow-up."
      open={open}
      onOpenChange={onOpenChange}
      slot="enter-waiting-prompt"
    >
      {(touch) => (
        <div className="flex flex-col gap-2">
          <PresetPanel group={enterWaitingGroup(task, today)} hideTitle />
          <Button variant="ghost" className={cn(touch && 'min-h-control')} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      )}
    </PromptShell>
  );
}
